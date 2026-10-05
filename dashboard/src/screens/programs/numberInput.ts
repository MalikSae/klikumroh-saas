// Parsers for the commission & registration settings form (Aturan agen). Empty or invalid input → null.

// Rupiah amounts: dots are thousands separators ("100.000"), a comma is the decimal mark.
export const parseRupiah = (v: string): number | null => {
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return v.trim() === '' || Number.isNaN(n) ? null : n;
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
