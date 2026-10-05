// Date/time helpers for labels marked "WIB": always formatted in Asia/Jakarta, never the device time zone
// (an agent abroad or with a wrong phone zone must still see the travel's time).
export const JAKARTA_TZ = 'Asia/Jakarta';

const toDate = (value: string | number | Date): Date | null => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Calendar day in Jakarta as 'YYYY-MM-DD' (for grouping), or '' for an invalid date. */
export const jakartaDayKey = (value: string | number | Date): string => {
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-CA', { timeZone: JAKARTA_TZ }) : '';
};

/** Group heading for a day key: "Hari ini", "Kemarin" (both in Jakarta), else "Senin, 5 Oktober 2026". */
export const jakartaDayLabel = (key: string, now: Date = new Date()): string => {
  if (!key) return 'Tanpa tanggal';
  if (key === jakartaDayKey(now)) return 'Hari ini';
  // Jakarta has no daylight saving: a day is always 24 hours.
  if (key === jakartaDayKey(now.getTime() - 86400000)) return 'Kemarin';
  const d = toDate(`${key}T00:00:00+07:00`);
  return d
    ? d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: JAKARTA_TZ })
    : key;
};

/** Jakarta clock time with the WIB suffix, e.g. "09.05 WIB", or '' for an invalid date. */
export const jakartaTimeLabel = (value: string | number | Date): string => {
  const d = toDate(value);
  return d ? `${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: JAKARTA_TZ })} WIB` : '';
};

/** Jakarta calendar date with the given parts (e.g. { day: 'numeric', month: 'short', year: 'numeric' }). */
export const jakartaDateLabel = (value: string | number | Date, options: Intl.DateTimeFormatOptions): string => {
  const d = toDate(value);
  return d ? d.toLocaleDateString('id-ID', { ...options, timeZone: JAKARTA_TZ }) : '';
};

/**
 * The current Jakarta month and the following ones as { value: 'YYYY-MM', label: 'Oktober 2026' }. The
 * backend checks month plans against the WIB month, so the first option must be the WIB month even when
 * the device clock is in another zone.
 */
export const jakartaMonthOptions = (count: number, now: Date = new Date()): { value: string; label: string }[] => {
  const [year, month] = jakartaDayKey(now).split('-').map(Number);
  const opts: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const total = month - 1 + i;
    const y = year + Math.floor(total / 12);
    const m = (total % 12) + 1;
    const value = `${y}-${String(m).padStart(2, '0')}`;
    // Mid-month noon in Jakarta: the label cannot slip into a neighbouring month in any zone.
    const label = jakartaDateLabel(`${value}-15T12:00:00+07:00`, { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
};
