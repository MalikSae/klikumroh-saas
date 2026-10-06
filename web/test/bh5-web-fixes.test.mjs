import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { proxy } from '../proxy.ts';
import { readAttribution, lastAttributionValue } from '../lib/adAttribution.ts';
import { backendFetch, BackendTimeoutError } from '../lib/backendFetch.ts';
import { loadPlatformSettings } from '../lib/usePlatformSettings.ts';
import { agentPhoneError } from '../lib/agentPhone.ts';
import { clearScriptProspectNames, scriptProspectNameKey, SCRIPT_PROSPECT_NAME_PREFIX } from '../lib/scriptProspectName.ts';
import { storeDashboardSession, clearDashboardSession } from '../lib/dashboardSession.ts';

// Bug hunt round 5 (web): last-value ad attribution, travel paths on klikumroh.id, server fetch timeout,
// platform settings failure not cached, prospect phone rule, per-agent Script WA name, no token cookie.

const req = (url) => new NextRequest(url, { headers: new Headers({ host: new URL(url).host }) });
const attrOf = (res) => {
  const c = res.cookies.get('ku_attr');
  return c ? JSON.parse(c.value) : null;
};

// Link builder's utm_source/utm_campaign first, then Meta's appended URL parameters.
const META_URL =
  'utm_source=facebook&utm_medium=paid&utm_campaign=ramadhan-slug' +
  '&utm_source=ig&utm_medium=paid&utm_campaign=Promo%20Ramadhan&ad_id=120210000000001';

test('lastAttributionValue: the last value wins, unfilled {{...}} placeholders are ignored', () => {
  const p = new URLSearchParams('utm_source=facebook&utm_source=ig&utm_campaign=a&utm_campaign={{campaign.name}}&ad_id=');
  assert.equal(lastAttributionValue(p, 'utm_source'), 'ig');
  assert.equal(lastAttributionValue(p, 'utm_campaign'), 'a');
  assert.equal(lastAttributionValue(p, 'ad_id'), null);
  assert.equal(lastAttributionValue(p, 'fbclid'), null);
  assert.equal(lastAttributionValue(new URLSearchParams('utm_source=%7B%7Bsite_source_name%7D%7D'), 'utm_source'), null);
});

test('readAttribution uses the last value of a repeated key', () => {
  assert.deepEqual(readAttribution('?' + META_URL, ''), {
    utm_source: 'ig',
    utm_medium: 'paid',
    utm_campaign: 'Promo Ramadhan',
    ad_id: '120210000000001',
  });
});

test('readAttribution: only placeholders in the URL falls back to the ku_attr cookie', () => {
  const cookie = `ku_attr=${encodeURIComponent(JSON.stringify({ utm_source: 'fb', ad_id: '9' }))}`;
  assert.deepEqual(readAttribution('?utm_source={{site_source_name}}&ad_id={{ad.id}}', cookie), { utm_source: 'fb', ad_id: '9' });
});

test('proxy ku_attr cookie stores the last value of a repeated key (same as readAttribution)', async () => {
  const res = await proxy(req('http://localhost:3000/paket/1?' + META_URL));
  assert.deepEqual(attrOf(res), readAttribution('?' + META_URL, ''));
  assert.equal(attrOf(res).utm_source, 'ig');
  assert.equal(attrOf(res).utm_campaign, 'Promo Ramadhan');
});

test('proxy: placeholders only -> no ku_attr cookie (an older real attribution is kept)', async () => {
  const res = await proxy(req('http://localhost:3000/?utm_source={{site_source_name}}&ad_id={{ad.id}}'));
  assert.equal(res.cookies.get('ku_attr'), undefined);
});

test('proxy: travel-only paths are blocked on klikumroh.id, platform paths and dev hosts are not', async () => {
  const prev = process.env.PLATFORM_ORIGIN;
  try {
    delete process.env.PLATFORM_ORIGIN;
    for (const path of ['/paket', '/paket/7', '/agen/daftar', '/agen', '/agen/login?x=1']) {
      for (const host of ['klikumroh.id', 'www.klikumroh.id']) {
        const res = await proxy(req(`http://${host}${path}`));
        assert.equal(res.status, 404, `${host}${path} blocked in dev (no platform origin)`);
      }
    }
    process.env.PLATFORM_ORIGIN = 'https://klikumroh.id';
    const redirected = await proxy(req('http://klikumroh.id/agen/daftar?ref=AG1'));
    assert.equal(redirected.status, 307);
    assert.equal(redirected.headers.get('location'), 'https://klikumroh.id/');

    // Not blocked: platform pages, look-alike paths, and the local dev hosts.
    for (const url of [
      'http://klikumroh.id/',
      'http://klikumroh.id/checkout',
      'http://klikumroh.id/affiliator',
      'http://klikumroh.id/agentur',
      'http://klikumroh.id/paketku',
      'http://localhost:3000/paket/1',
      'http://localhost:3000/agen/login',
      'http://klikumroh.local/paket',
    ]) {
      const res = await proxy(req(url));
      assert.equal(res.status, 200, `${url} passes`);
      assert.equal(res.headers.get('location'), null, `${url} not redirected`);
    }
  } finally {
    if (prev === undefined) delete process.env.PLATFORM_ORIGIN;
    else process.env.PLATFORM_ORIGIN = prev;
  }
});

test('backendFetch gives up after the timeout instead of hanging', async () => {
  const globalFetch = globalThis.fetch;
  globalThis.fetch = () => new Promise(() => {}); // backend accepts and never answers
  try {
    const started = Date.now();
    await assert.rejects(backendFetch('http://127.0.0.1:8080/api/public/tenant-info', {}, 50), BackendTimeoutError);
    assert.ok(Date.now() - started < 1000);
  } finally {
    globalThis.fetch = globalFetch;
  }
});

test('backendFetch passes a quick answer through unchanged', async () => {
  const globalFetch = globalThis.fetch;
  let seenInit;
  globalThis.fetch = async (_url, init) => {
    seenInit = init;
    return new Response('{"ok":true}', { status: 200 });
  };
  try {
    const res = await backendFetch('http://x/api', { cache: 'no-store', headers: { Host: 'a' } }, 1000);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    // No AbortSignal is added: Next.js would skip request memoization for it.
    assert.equal(seenInit.signal, undefined);
    assert.equal(seenInit.cache, 'no-store');
  } finally {
    globalThis.fetch = globalFetch;
  }
});

test('platform settings: a failed request is not cached as empty and is retried', async () => {
  const globalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response('<html>502</html>', { status: 502 });
    return new Response(JSON.stringify({ terms_url: 'https://t', privacy_url: 'https://p' }), { status: 200 });
  };
  try {
    assert.equal(await loadPlatformSettings(), null, 'failure resolves to null, never EMPTY_SETTINGS');
    const second = await loadPlatformSettings();
    assert.equal(calls, 2, 'the failure was not cached');
    assert.equal(second.terms_url, 'https://t');
    assert.equal(second.whatsapp_number, '');
    await loadPlatformSettings();
    assert.equal(calls, 2, 'a success is cached');
  } finally {
    globalThis.fetch = globalFetch;
  }
});

test('prospect phone check matches the backend rule with a clear message', () => {
  assert.equal(agentPhoneError('081234567890'), undefined);
  assert.equal(agentPhoneError('+62 812-3456-7890'), undefined);
  assert.equal(agentPhoneError('6281234567890'), undefined);
  assert.match(agentPhoneError('81234567890'), /08, 62, atau \+62/);
  assert.match(agentPhoneError('+60123456789'), /08, 62, atau \+62/);
  assert.match(agentPhoneError('0812'), /terlalu pendek/);
  assert.match(agentPhoneError('0812abc4567'), /hanya boleh berisi angka/);
});

const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()].sort(),
  };
};

test('Script WA manual name: per-agent key, every agent name removed on logout', () => {
  assert.equal(scriptProspectNameKey(12), `${SCRIPT_PROSPECT_NAME_PREFIX}:12`);
  const s = fakeStorage({
    [SCRIPT_PROSPECT_NAME_PREFIX]: 'Bu Aminah',
    [scriptProspectNameKey(12)]: 'Pak Hasan',
    [scriptProspectNameKey(13)]: 'Bu Siti',
    klikumroh_agent_script_favorites: '["a"]',
    agent_token: 't',
  });
  clearScriptProspectNames(s);
  assert.deepEqual(s.keys(), ['agent_token', 'klikumroh_agent_script_favorites']);
  clearScriptProspectNames(null); // never throws
});

test('dashboard session: the bearer token is never written to a cookie, an old one is expired', () => {
  const cookies = [];
  const storage = fakeStorage();
  globalThis.window = {};
  globalThis.localStorage = storage;
  globalThis.document = {
    set cookie(v) {
      cookies.push(v);
    },
  };
  try {
    storeDashboardSession({ token: 'secret-token', user: { tenant_name: 'Travel A' } });
    assert.ok(cookies.every((c) => !c.includes('secret-token')), 'token not in any cookie');
    assert.ok(cookies.some((c) => c.startsWith('klikumroh_token=;') && c.includes('max-age=0')), 'old cookie expired');
    cookies.length = 0;
    clearDashboardSession();
    assert.ok(cookies.some((c) => c.startsWith('klikumroh_token=;') && c.includes('max-age=0')));
    assert.equal(storage.getItem('klikumroh_token'), null);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.document;
  }
});
