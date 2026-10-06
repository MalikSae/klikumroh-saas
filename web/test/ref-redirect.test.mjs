import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRefRedirectPath } from '../lib/refRedirect.ts';

const build = (code, qs) => {
  const path = buildRefRedirectPath(code, new URLSearchParams(qs));
  const url = new URL(path, 'https://travel.example');
  return { path, url };
};

test('ref redirect: keeps fbclid, ad_id and utm_* on the landing URL', () => {
  const { url } = build('BUDI', 'utm_source=facebook&utm_medium=paid&utm_campaign=X&ad_id=123&fbclid=IwAR0abc-_x');
  assert.equal(url.pathname, '/');
  assert.equal(url.searchParams.get('ref'), 'BUDI');
  assert.equal(url.searchParams.get('utm_source'), 'facebook');
  assert.equal(url.searchParams.get('utm_medium'), 'paid');
  assert.equal(url.searchParams.get('utm_campaign'), 'X');
  assert.equal(url.searchParams.get('ad_id'), '123');
  assert.equal(url.searchParams.get('fbclid'), 'IwAR0abc-_x');
});

test('ref redirect: `to` is consumed and chooses a package landing', () => {
  const { url } = build('BUDI', 'to=/paket/42&fbclid=abc');
  assert.equal(url.pathname, '/paket/42');
  assert.equal(url.searchParams.has('to'), false);
  assert.equal(url.searchParams.get('fbclid'), 'abc');
  assert.equal(url.searchParams.get('ref'), 'BUDI');
});

test('ref redirect: unsafe `to` falls back to / and is still dropped', () => {
  for (const to of ['https://evil.example/paket/1', '//evil.example', '/paket/1/../../admin', '/paket/abc', '/login']) {
    const { path, url } = build('BUDI', `to=${encodeURIComponent(to)}&utm_source=x`);
    assert.ok(path.startsWith('/?'), `expected same-host root for ${to}, got ${path}`);
    assert.equal(url.host, 'travel.example');
    assert.equal(url.pathname, '/');
    assert.equal(url.searchParams.has('to'), false);
    assert.equal(url.searchParams.get('utm_source'), 'x');
  }
});

test('ref redirect: an incoming ref is replaced, ref appears exactly once', () => {
  const { url } = build('BUDI', 'ref=OTHER&ref=THIRD&utm_source=x');
  assert.deepEqual(url.searchParams.getAll('ref'), ['BUDI']);
  assert.equal(url.searchParams.get('utm_source'), 'x');
});

test('ref redirect: no query gives just ?ref=CODE, and the code is encoded', () => {
  assert.equal(build('BUDI', '').path, '/?ref=BUDI');
  const { url } = build('A&B=C', '');
  assert.deepEqual(url.searchParams.getAll('ref'), ['A&B=C']);
  assert.equal(url.searchParams.has('B'), false);
});

test('ref redirect: repeated parameters are kept in order', () => {
  const { url } = build('BUDI', 'tag=a&tag=b');
  assert.deepEqual(url.searchParams.getAll('tag'), ['a', 'b']);
});
