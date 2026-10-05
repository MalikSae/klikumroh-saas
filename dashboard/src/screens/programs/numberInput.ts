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
