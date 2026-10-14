import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSignupAdContext } from '../lib/signupAdContext.ts';
import { readAttribution } from '../lib/adAttribution.ts';

const build = (search, cookie, meta) => buildSignupAdContext(readAttribution(search, cookie), meta);

const noMeta = { fbp: '', fbc: '', event_source_url: 'https://klikumroh.id/checkout' };

test('organic visit sends no ad context', () => {
  assert.equal(build('', '', noMeta), undefined);
  assert.equal(build('?plan_id=2', 'other=1', noMeta), undefined);
});

test('Meta cookies and URL ad parameters are combined', () => {
  const ctx = build(
    '?utm_source=facebook&utm_campaign=umroh-okt&fbclid=IwAR123',
    '',
    { fbp: 'fb.1.1700000000000.111', fbc: 'fb.1.1700000000000.IwAR123', event_source_url: 'https://klikumroh.id/checkout?x=1' },
  );
  assert.deepEqual(ctx, {
    fbp: 'fb.1.1700000000000.111',
    fbc: 'fb.1.1700000000000.IwAR123',
    event_source_url: 'https://klikumroh.id/checkout?x=1',
    fbclid: 'IwAR123',
    utm_source: 'facebook',
    utm_campaign: 'umroh-okt',
  });
});

test('falls back to the ku_attr cookie when the URL has no ad parameters', () => {
  const cookie = 'ku_attr=' + encodeURIComponent(JSON.stringify({ utm_source: 'facebook', fbclid: 'abc', ad_id: '99' }));
  const ctx = build('?plan_id=2', cookie, noMeta);
  assert.equal(ctx?.utm_source, 'facebook');
  assert.equal(ctx?.fbclid, 'abc');
  // ad_id is not part of the signup ad context.
  assert.equal('ad_id' in ctx, false);
});

test('only the Meta cookie is enough to send a context', () => {
  const ctx = build('', '', { ...noMeta, fbp: 'fb.1.1700000000000.222' });
  assert.equal(ctx?.fbp, 'fb.1.1700000000000.222');
});
