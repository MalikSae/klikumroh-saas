import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePackageId } from '../lib/packageId.ts';
import { parseRouteLegs } from '../lib/flightRoute.ts';
import { homeRank } from '../lib/agentRank.ts';
import { legacySumberToReplay } from '../lib/agentHabits.ts';
import { isPlatformHost } from '../lib/platformHost.ts';

// L3: only a positive whole number reaches the backend URL; "007" normalizes to 7 (one canonical).
test('package id: positive integers only, normalized', () => {
  assert.equal(parsePackageId('7'), 7);
  assert.equal(parsePackageId('007'), 7);
  assert.equal(parsePackageId('123456'), 123456);
  for (const bad of ['0', '000', '-1', '1.5', '1e3', ' 7', '7 ', '7a', '', '0x1A',
    '../../../internal/domain-ask?domain=x.com', '7/../8', '7?x=1', '99999999999999999']) {
    assert.equal(parsePackageId(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
  assert.equal(parsePackageId(undefined), null);
  assert.equal(parsePackageId(null), null);
});

// L4: the dashboard placeholder format "CGK - JED, MED - CGK" is two legs, not one leg with stop "JED, MED".
test('flight route: comma-separated legs', () => {
  assert.deepEqual(parseRouteLegs('CGK - JED, MED - CGK'), [
    { stops: ['CGK', 'JED'], text: '' },
    { stops: ['MED', 'CGK'], text: '' },
  ]);
  assert.deepEqual(parseRouteLegs('CGK - JED; MED - CGK'), [
    { stops: ['CGK', 'JED'], text: '' },
    { stops: ['MED', 'CGK'], text: '' },
  ]);
  // One leg per line still works, with transit stops.
  assert.deepEqual(parseRouteLegs('CGK - DXB - JED\nMED - CGK'), [
    { stops: ['CGK', 'DXB', 'JED'], text: '' },
    { stops: ['MED', 'CGK'], text: '' },
  ]);
  // A comma part that is not a route keeps the line whole.
  assert.deepEqual(parseRouteLegs('Jakarta - Jeddah, via Dubai'), [
    { stops: ['Jakarta', 'Jeddah, via Dubai'], text: '' },
  ]);
  // Plain text lines stay text; empty input has no legs.
  assert.deepEqual(parseRouteLegs('Direct flight'), [{ stops: [], text: 'Direct flight' }]);
  assert.deepEqual(parseRouteLegs(''), []);
  assert.deepEqual(parseRouteLegs(undefined), []);
});

// L5: no rank before the agent's first closing; 0, null and missing ranks show no rank.
test('home rank tile', () => {
  assert.equal(homeRank(1, 2), 1);
  assert.equal(homeRank(9, 1), 9);
  assert.equal(homeRank(10, 5), null); // does not fit the tile
  assert.equal(homeRank(1, 0), null); // nobody / not this agent has closed
  assert.equal(homeRank(3, 0), null);
  assert.equal(homeRank(0, 4), null);
  assert.equal(homeRank(null, 4), null);
  assert.equal(homeRank(undefined, 4), null);
  assert.equal(homeRank(2, undefined), null);
});

// L6: the legacy browser list only replays sources the server does not know yet.
test('legacy sumber replay skips sources the server already has', () => {
  assert.deepEqual(legacySumberToReplay([1, 2, 3], [1, 2, 3]), []);
  assert.deepEqual(legacySumberToReplay([1, 2, 5], [1, 2]), [5]);
  assert.deepEqual(legacySumberToReplay([4, 4, 'x', 1.5, -1, 0, 6], []), [4, 6]);
  assert.deepEqual(legacySumberToReplay('not a list', []), []);
  assert.deepEqual(legacySumberToReplay(null, [1]), []);
});

// L12: KlikUmroh's own branding only on platform hosts.
test('platform host check', () => {
  assert.equal(isPlatformHost('klikumroh.id'), true);
  assert.equal(isPlatformHost('www.klikumroh.id'), true);
  assert.equal(isPlatformHost('localhost:3000'), true);
  assert.equal(isPlatformHost('KLIKUMROH.ID'), true);
  assert.equal(isPlatformHost('travela.klikumroh.id'), false);
  assert.equal(isPlatformHost('namatravel.com'), false);
  assert.equal(isPlatformHost(''), false);
  assert.equal(isPlatformHost(null), false);
});

// L2 + L11 (proxy): /demo is platform-only, and a hung custom-domain lookup no longer hangs the page.
test('proxy: /demo on a travel host is redirected to the platform with path + query kept', async () => {
  const { NextRequest } = await import('next/server.js');
  const { proxy } = await import('../proxy.ts');
  const prevOrigin = process.env.PLATFORM_ORIGIN;
  const prevFetch = globalThis.fetch;
  process.env.PLATFORM_ORIGIN = 'https://klikumroh.id';
  globalThis.fetch = async () => {
    throw new Error('backend must not be called for a platform-only path');
  };
  try {
    const req = new NextRequest('http://namatravel.com/demo?x=1&ref=ABC', { headers: { host: 'namatravel.com' } });
    const res = await proxy(req);
    assert.equal(res.status, 307);
    assert.equal(res.headers.get('location'), 'https://klikumroh.id/demo?x=1&ref=ABC');

    // Platform host: /demo is served normally.
    const own = await proxy(new NextRequest('http://klikumroh.id/demo', { headers: { host: 'klikumroh.id' } }));
    assert.equal(own.headers.get('location'), null);

    // Dev (no platform origin): 404 instead of the demo page on a travel host.
    delete process.env.PLATFORM_ORIGIN;
    const dev = await proxy(new NextRequest('http://travela.localhost/demo', { headers: { host: 'travela.localhost' } }));
    assert.equal(dev.status, 404);
  } finally {
    if (prevOrigin === undefined) delete process.env.PLATFORM_ORIGIN;
    else process.env.PLATFORM_ORIGIN = prevOrigin;
    globalThis.fetch = prevFetch;
  }
});

test('proxy: custom-domain lookup is aborted by its timeout and the page proceeds', { timeout: 10000 }, async () => {
  const { NextRequest } = await import('next/server.js');
  const { proxy } = await import('../proxy.ts');
  const prevFetch = globalThis.fetch;
  let sawSignal = false;
  // A backend that never answers: only the request's abort signal ends the wait.
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      if (init?.signal) {
        sawSignal = true;
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      }
    });
  const origError = console.error;
  console.error = () => {};
  // AbortSignal.timeout's timer does not keep Node alive on its own; this one does (like a server would).
  const keepAlive = setTimeout(() => {}, 10000);
  try {
    const started = Date.now();
    const req = new NextRequest('http://travela.klikumroh.id/paket/9?ref=HANAFI', { headers: { host: 'travela.klikumroh.id' } });
    const res = await proxy(req);
    const elapsed = Date.now() - started;
    assert.ok(sawSignal, 'lookup must pass an abort signal');
    assert.ok(elapsed < 5000, `took ${elapsed} ms`);
    assert.equal(res.headers.get('location'), null); // no redirect: subdomain served as is
    assert.equal(res.headers.get('x-middleware-next'), '1');
  } finally {
    clearTimeout(keepAlive);
    console.error = origError;
    globalThis.fetch = prevFetch;
  }
});
