import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { proxy } from '../proxy.ts';
import { ATTRIBUTION_KEYS, readAttribution } from '../lib/adAttribution.ts';

// Meta ad id (ad_id, filled by {{ad.id}}): captured by proxy.ts into ku_attr like utm_* / fbclid, read back
// by the prospect form and sent as attribution.ad_id. The backend counts a lead as paid only with ad_id.

const req = (url) => new NextRequest(url, { headers: new Headers({ host: new URL(url).host }) });
const attrCookie = (res) => res.cookies.get('ku_attr');

test('proxy stores ad_id in ku_attr with the same 7-day window', async () => {
  const res = await proxy(
    req('http://localhost:3000/paket/1?utm_source=facebook&utm_medium=paid&utm_campaign=Ramadhan&ad_id=120210000000001'),
  );
  const c = attrCookie(res);
  assert.ok(c, 'ku_attr cookie set');
  assert.equal(c.maxAge, 60 * 60 * 24 * 7);
  assert.deepEqual(JSON.parse(c.value), {
    utm_source: 'facebook',
    utm_medium: 'paid',
    utm_campaign: 'Ramadhan',
    ad_id: '120210000000001',
  });
});

test('ad_id alone is enough to set ku_attr', async () => {
  const res = await proxy(req('http://localhost:3000/?ad_id=987654321'));
  assert.deepEqual(JSON.parse(attrCookie(res).value), { ad_id: '987654321' });
});

test('proxy and lib/adAttribution.ts capture the same keys', async () => {
  const qs = ATTRIBUTION_KEYS.map((k) => `${k}=v_${k}`).join('&');
  const res = await proxy(req(`http://localhost:3000/?${qs}`));
  const stored = JSON.parse(attrCookie(res).value);
  assert.deepEqual(Object.keys(stored).sort(), [...ATTRIBUTION_KEYS].sort());
});

test('custom-domain redirect keeps ad_id in path + query', async () => {
  const globalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ custom_domain: 'namatravel.com' }), { status: 200 });
  try {
    const res = await proxy(req('http://travela.klikumroh.local/paket/7?ref=AG1&ad_id=555&utm_medium=paid'));
    assert.equal(res.status, 307);
    const loc = new URL(res.headers.get('location'));
    assert.equal(loc.hostname, 'namatravel.com');
    assert.equal(loc.pathname, '/paket/7');
    assert.equal(loc.searchParams.get('ad_id'), '555');
    assert.equal(loc.searchParams.get('ref'), 'AG1');
    assert.equal(loc.searchParams.get('utm_medium'), 'paid');
  } finally {
    globalThis.fetch = globalFetch;
  }
});

test('readAttribution: URL wins, includes ad_id', () => {
  const cookie = `ku_attr=${encodeURIComponent(JSON.stringify({ utm_source: 'old', ad_id: '1' }))}`;
  assert.deepEqual(readAttribution('?ad_id=222&utm_source=facebook', cookie), { utm_source: 'facebook', ad_id: '222' });
});

test('readAttribution: falls back to the ku_attr cookie and keeps ad_id', () => {
  const cookie = `other=1; ku_attr=${encodeURIComponent(JSON.stringify({ utm_medium: 'paid', ad_id: '333', junk: 'x' }))}`;
  assert.deepEqual(readAttribution('?page=2', cookie), { utm_medium: 'paid', ad_id: '333' });
});

test('readAttribution: nothing or broken cookie gives null', () => {
  assert.equal(readAttribution('', ''), null);
  assert.equal(readAttribution('', 'ku_attr=%7Bbroken'), null);
  assert.equal(readAttribution('', `ku_attr=${encodeURIComponent('[1]')}`), null);
});
