// The invite an agent sends to a person they would like to bring in as an agent, and money formats for the
// "Agen binaan saya" page. One place, so the home card and that page send the same text.

export const rupiahFull = (n: number): string => 'Rp ' + Math.floor(n).toLocaleString('id-ID');

// Millions as "Jt" ("Rp 1,5 Jt", "Rp 10 Jt"); below a million the full number ("Rp 450.000").
export const rupiahJt = (n: number): string =>
  n >= 1_000_000 ? `Rp ${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Jt` : rupiahFull(n);

export interface RecruitInviteInput {
  travelName?: string | null;
  // Highest commission per jamaah among the packages on sale; null/0 -> the sentence goes without a number.
  maxCommission?: number | null;
  link: string;
}

// Wording approved by the founder (10 Okt 2026): neutral (no greeting), about what the reader gets. The
// registration may have a fee, so nothing says free or no capital.
export const recruitInviteText = ({ travelName, maxCommission, link }: RecruitInviteInput): string => {
  const commissionLine =
    maxCommission && maxCommission > 0
      ? `Raih komisi hingga ${rupiahFull(maxCommission)} per jamaah yang Anda ajak.`
      : 'Raih komisi untuk setiap jamaah yang Anda ajak.';
  return [
    `Mau dapat penghasilan tambahan? Rekomendasikan relasi Anda untuk berumroh bersama ${travelName || 'travel umroh'}.`,
    '',
    commissionLine,
    '',
    link,
  ].join('\n');
};
