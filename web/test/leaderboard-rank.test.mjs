import test from 'node:test';
import assert from 'node:assert/strict';
import { podiumEntries, podiumScreenOrder, medalTier, rankCellText, myRankText, hasRank } from '../lib/leaderboardRank.ts';

const list = (ranks) => ranks.map((rank, i) => ({ rank, name: `A${i}` }));

test('podium: shared ranks keep their label, places follow list order', () => {
  // totals 5,3,3,1 -> ranks 1,2,2,4
  const p = podiumEntries(list([1, 2, 2, 4]));
  assert.deepEqual(p.map((s) => [s.place, s.entry.rank, s.entry.name]), [[1, 1, 'A0'], [2, 2, 'A1'], [3, 2, 'A2']]);
  // screen order: place 2 left, 1 middle, 3 right; keys (place) are unique even with tied ranks
  assert.deepEqual(podiumScreenOrder(p).map((s) => s.place), [2, 1, 3]);
});

test('podium: rank 0 agents never stand on it; empty when nobody closed', () => {
  assert.deepEqual(podiumEntries(list([1, 0, 0])).map((s) => s.entry.name), ['A0']);
  assert.deepEqual(podiumScreenOrder(podiumEntries(list([1, 0, 0]))).map((s) => s.place), [1]);
  assert.deepEqual(podiumEntries(list([1, 1, 0])).map((s) => s.entry.rank), [1, 1]);
  assert.equal(podiumEntries(list([0, 0, 0])).length, 0);
  assert.equal(podiumEntries([]).length, 0);
});

test('labels: medal only for ranks 1-3, never for 0; no "#0"', () => {
  assert.equal(medalTier(1), 1);
  assert.equal(medalTier(2), 2);
  assert.equal(medalTier(3), 3);
  assert.equal(medalTier(4), null);
  assert.equal(medalTier(0), null);
  assert.equal(rankCellText(4), '4');
  assert.equal(rankCellText(0), '-');
  assert.equal(myRankText(2), '#2');
  assert.equal(myRankText(0), 'Belum closing');
  assert.equal(hasRank(0), false);
  assert.equal(hasRank(-1), false);
  assert.equal(hasRank(1), true);
});
