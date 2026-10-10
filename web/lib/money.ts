// Money as people read it in Rupiah, in one place. The agent portal used to carry six copies of "formatRupiah"
// that disagreed (Intl currency vs toLocaleString, floor vs no rounding).

// "Rp 1.500.000". Whole rupiah (floor), null/undefined count as 0.
export const rupiah = (n: number | null | undefined): string => 'Rp ' + Math.floor(n ?? 0).toLocaleString('id-ID');

// Millions as "Jt" ("Rp 1,5 Jt", "Rp 10 Jt"); below a million the full number ("Rp 450.000").
export const rupiahJt = (n: number): string =>
  n >= 1_000_000 ? `Rp ${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Jt` : rupiah(n);
