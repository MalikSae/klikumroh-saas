/**
 * Rank shown on the agent home tile ("Peringkat #N"), or null for no rank.
 * The leaderboard orders agents by closed jamaah; with no closing of their own an agent's position is only
 * decided by account age, so no rank is shown then (the leaderboard page says "Belum ada closing").
 * The API may also send 0, null or no preview at all when nobody has a rank. Only #1-#9 fit the tile.
 */
export const homeRank = (
  rank: number | null | undefined,
  ownClosings: number | null | undefined,
): number | null => {
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1 || rank > 9) return null;
  if (typeof ownClosings !== 'number' || ownClosings <= 0) return null;
  return rank;
};
