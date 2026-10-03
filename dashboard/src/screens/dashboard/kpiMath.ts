// KPI arithmetic over the 60-day series of the overview API (dashboard home and Prospek page).
import type { KPIDay } from '../../services/api';

/** Current 30 days vs the 30 before, from the 60-day series. */
export function compare(days: KPIDay[], pick: (d: KPIDay) => number) {
  const cur = days.slice(-30).reduce((a, d) => a + pick(d), 0);
  const prev = days.slice(-60, -30).reduce((a, d) => a + pick(d), 0);
  return { cur, prev };
}

/** Four weekly totals of the last 28 days (sparkline). */
export function weekly(days: KPIDay[], pick: (d: KPIDay) => number) {
  const last = days.slice(-28);
  return [0, 1, 2, 3].map((w) => last.slice(w * 7, w * 7 + 7).reduce((a, d) => a + pick(d), 0));
}

/** Percent change, as shown under a KPI. */
export function delta(cur: number, prev: number): { text: string; trend: 'up' | 'down' | 'flat' } {
  if (prev === 0) return cur > 0 ? { text: 'Baru', trend: 'up' } : { text: '0', trend: 'flat' };
  const pct = ((cur - prev) / prev) * 100;
  const trend = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  return { text: `${pct > 0 ? '+' : ''}${Math.round(pct)}%`, trend };
}
