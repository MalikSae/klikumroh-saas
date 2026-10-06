// Parsers for the commission & registration settings form (Aturan agen).

// Rupiah amounts: plain digits ("150000") or dots as thousands separators in groups of three ("150.000"),
// optionally with a comma decimal part of one or two digits ("150.000,50"). Empty input is null (not set).
// Anything else ("150.000,-", "1,500,000", "150rb", "1.5", "-5") is 'invalid', so the form shows an error
// instead of silently saving the field as empty.
export const parseRupiah = (v: string): number | null | 'invalid' => {
  const t = v.trim();
  if (t === '') return null;
  if (!/^(\d+|\d{1,3}(\.\d{3})+)(,\d{1,2})?$/.test(t)) return 'invalid';
  return Number(t.replace(/\./g, '').replace(',', '.'));
};

// A stored amount loaded back into a rupiah field, in the format parseRupiah accepts: 150000 -> "150.000",
// 150000.5 (DECIMAL column, sent as 150000.5 or "150000.5") -> "150.000,50". Empty, zero or non-numeric is "".
// Without this, String(150000.5) = "150000.5" is refused on the next save of any other field.
export const formatRupiahInput = (v: number | string | null | undefined): string => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return '';
  const cents = Math.round(n * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac ? `${grouped},${String(frac).padStart(2, '0')}` : grouped;
};

// Percentages: "2.5" and "2,5" both mean two and a half. Stripping dots here (as parseRupiah does) would
// turn 2.5% into 25%, and a stored 2.5 is loaded back into the field as the string "2.5".
export const parsePercent = (v: string): number | null => {
  const n = Number(v.trim().replace(',', '.'));
  return v.trim() === '' || Number.isNaN(n) ? null : n;
};

// Jamaah count typed in a form (Edit prospek). The field may be empty while the admin retypes it, so this is
// read on save only: a whole number 1..max, anything else (empty, 0, "2,5", "abc") is null, so an error is shown.
export const parseJamaahCount = (v: string, max = 50): number | null => {
  const t = v.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= max ? n : null;
};

// Required whole number field with a lower bound (affiliator program settings: hold days, minimum payout).
// Digits only: a dot is not stripped, so "10.5" from a number input is refused instead of becoming 105.
// Empty or invalid gives null, so a cleared field is reported instead of silently saving 0.
export const parseWholeNumber = (v: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | null => {
  const t = v.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
};
