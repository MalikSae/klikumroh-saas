import test from 'node:test';
import assert from 'node:assert/strict';
import { travelSiteFlags } from '../lib/travelSiteState.ts';
import { readJsonSafe, apiErrorMessage, GATEWAY_ERROR_MESSAGE } from '../lib/safeJson.ts';
import { appendUniqueById } from '../lib/appendUnique.ts';
import { shareCountsAsHabit } from '../lib/packageShare.ts';
import { sumberSaveOutcome } from '../lib/agentHabits.ts';

// L1: a suspended travel gets no structured data (contact), no Meta Pixel, and noindex.
test('travel site flags: suspended, demo, active, none', () => {
  assert.deepEqual(travelSiteFlags({ is_suspended: true }), { structuredData: false, metaPixel: false, noindex: true });
  assert.deepEqual(travelSiteFlags({ is_demo: true }), { structuredData: false, metaPixel: true, noindex: true });
  assert.deepEqual(travelSiteFlags({ is_demo: true, is_suspended: true }), { structuredData: false, metaPixel: false, noindex: true });
  assert.deepEqual(travelSiteFlags({ is_demo: false, is_suspended: false }), { structuredData: true, metaPixel: true, noindex: false });
  assert.deepEqual(travelSiteFlags({}), { structuredData: true, metaPixel: true, noindex: false });
  assert.deepEqual(travelSiteFlags(null), { structuredData: false, metaPixel: false, noindex: false });
});

// L10: a gateway HTML page never surfaces as a JSON parse error.
test('readJsonSafe: JSON, HTML, empty', async () => {
  const fakeRes = (body) => ({ json: async () => JSON.parse(body) });
  assert.deepEqual(await readJsonSafe(fakeRes('{"error":"x"}')), { error: 'x' });
  assert.equal(await readJsonSafe(fakeRes('<html>502 Bad Gateway</html>')), null);
  assert.equal(await readJsonSafe(fakeRes('')), null);
  assert.equal(await readJsonSafe(fakeRes('null')), null);
  assert.equal(await readJsonSafe(fakeRes('"text"')), null);
});

test('apiErrorMessage: server reason, gateway text, fallback', () => {
  assert.equal(apiErrorMessage(400, { error: 'Nomor tidak valid' }, 'Gagal'), 'Nomor tidak valid');
  assert.equal(apiErrorMessage(502, { error: 'Server sedang tidak dapat dihubungi' }, 'Gagal'), 'Server sedang tidak dapat dihubungi');
  for (const status of [502, 503, 504]) {
    assert.equal(apiErrorMessage(status, null, 'Gagal'), GATEWAY_ERROR_MESSAGE);
    assert.equal(apiErrorMessage(status, {}, 'Gagal'), GATEWAY_ERROR_MESSAGE);
  }
  assert.equal(apiErrorMessage(500, null, 'Gagal'), 'Gagal');
  assert.equal(apiErrorMessage(400, { error: '   ' }, 'Gagal'), 'Gagal');
  assert.equal(apiErrorMessage(400, { error: 42 }, 'Gagal'), 'Gagal');
  assert.doesNotMatch(apiErrorMessage(502, null, 'Gagal'), /Unexpected token/);
});

// L7: "Muat lebih banyak" never shows a row twice.
test('appendUniqueById: drops rows already shown, keeps order', () => {
  const prev = [{ id: 3, n: 'a' }, { id: 2, n: 'b' }];
  const next = [{ id: 2, n: 'b-again' }, { id: 1, n: 'c' }, { id: 1, n: 'c-dup' }];
  assert.deepEqual(appendUniqueById(prev, next), [{ id: 3, n: 'a' }, { id: 2, n: 'b' }, { id: 1, n: 'c' }]);
  assert.deepEqual(appendUniqueById([], next).map((r) => r.id), [2, 1]);
  assert.deepEqual(appendUniqueById(prev, []), prev);
  assert.notEqual(appendUniqueById(prev, []), prev, 'returns a new array for React state');
});

// L6: a cancelled or failed share sheet does not count as a share.
test('shareCountsAsHabit', () => {
  assert.equal(shareCountsAsHabit('shared'), true);
  assert.equal(shareCountsAsHabit('copied'), true);
  assert.equal(shareCountsAsHabit('cancelled'), false);
  assert.equal(shareCountsAsHabit('failed'), false);
});

// L8: 402 (travel suspended) is told apart from other failures.
test('sumberSaveOutcome', () => {
  assert.equal(sumberSaveOutcome(200), 'ok');
  assert.equal(sumberSaveOutcome(204), 'ok');
  assert.equal(sumberSaveOutcome(402), 'suspended');
  assert.equal(sumberSaveOutcome(401), 'failed');
  assert.equal(sumberSaveOutcome(500), 'failed');
  assert.equal(sumberSaveOutcome(0), 'failed');
});
