// Money as people read it in Rupiah, in one place. The agent portal used to carry six copies of "formatRupiah"
// that disagreed (Intl currency vs toLocaleString, floor vs no rounding).

// "Rp 1.500.000". Whole rupiah (floor), null/undefined count as 0.
export const rupiah = (n: number | null | undefined): string => 'Rp ' + Math.floor(n ?? 0).toLocaleString('id-ID');

const decimals = (n: number, max: number): string => n.toLocaleString('id-ID', { maximumFractionDigits: max });

// Compact, for narrow places (a column of a list). The result is at most about 10 characters:
//   below a million   the full number         "Rp 450.000"
//   1 to 99,99 Jt     up to 2 decimals        "Rp 1,25 Jt", "Rp 12,5 Jt"
//   100 to 999,9 Jt   1 decimal               "Rp 125,5 Jt"
//   a billion or more in "M", 1 decimal       "Rp 1,2 M"
export const rupiahJt = (n: number): string => {
  if (n < 1_000_000) return rupiah(n);
  const jt = n / 1_000_000;
  if (jt < 100) return `Rp ${decimals(jt, 2)} Jt`;
  const rounded = Math.round(jt * 10) / 10;
  // 999,95 Jt rounds up to 1.000 Jt: that is a billion
  if (rounded < 1000) return `Rp ${decimals(rounded, 1)} Jt`;
  return `Rp ${decimals(n / 1_000_000_000, 1)} M`;
};
