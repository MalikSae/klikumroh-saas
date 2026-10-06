// Leaderboard rank display. The API gives tied agents a shared rank (totals 5,3,3,1 -> ranks 1,2,2,4)
// and rank 0 to agents with no closed jamaah in the period (no rank, no medal).

export interface RankedEntry {
  rank: number;
}

export const hasRank = (rank: number): boolean => Number.isInteger(rank) && rank > 0;

// Medal tier for the list (1, 2 or 3), or null: rank 0 never gets a medal.
export const medalTier = (rank: number): 1 | 2 | 3 | null =>
  rank === 1 || rank === 2 || rank === 3 ? rank : null;

// Rank cell in the list: the shared rank, or "-" for an agent without closing.
export const rankCellText = (rank: number): string => (hasRank(rank) ? String(rank) : '-');

// "Peringkat Anda" value: "#2", or "Belum closing" (never "#0").
export const myRankText = (rank: number): string => (hasRank(rank) ? `#${rank}` : 'Belum closing');

// Podium: the first (up to) 3 entries that have a rank, in list order. `place` is the podium
// position (1 = middle/tallest, 2 = left, 3 = right) used for layout; the label stays `entry.rank`,
// so tied agents keep their shared rank on the podium.
export function podiumEntries<T extends RankedEntry>(list: T[]): { entry: T; place: 1 | 2 | 3 }[] {
  return list
    .filter((e) => hasRank(e.rank))
    .slice(0, 3)
    .map((entry, i) => ({ entry, place: (i + 1) as 1 | 2 | 3 }));
}

// Podium order on screen: 2nd left, 1st in the middle, 3rd right (only the places that exist).
export function podiumScreenOrder<T>(podium: { entry: T; place: 1 | 2 | 3 }[]): { entry: T; place: 1 | 2 | 3 }[] {
  return [2, 1, 3].map((p) => podium.find((s) => s.place === p)).filter((s): s is { entry: T; place: 1 | 2 | 3 } => !!s);
}
