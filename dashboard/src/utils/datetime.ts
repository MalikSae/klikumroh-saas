// Business times are shown in WIB (Asia/Jakarta) regardless of the viewer's device timezone, so a
// travel admin in Makassar or Jayapura sees the same "WIB" timestamps as the data and CSV export.
const WIB = 'Asia/Jakarta';

export const formatDateWIB = (value?: string | null): string => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: WIB });
};

/** Day and short month in WIB without the year ("5 Okt"), for recent items such as notifications. */
export const formatDayMonthWIB = (value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: WIB });
};

export const formatTimeWIB =(value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: WIB })} WIB`;
};

export const formatDateTimeWIB = (value?: string | null): string => {
  if (!value) return '-';
  const date = formatDateWIB(value);
  const time = formatTimeWIB(value);
  return time ? `${date}, ${time}` : date;
};

/** Calendar date (YYYY-MM-DD) in WIB. toISOString() is UTC and still gives yesterday until 07:00 WIB. */
export const todayWIB = (now: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: WIB }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};
