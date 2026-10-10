// The invite an agent sends to a person they would like to bring in as an agent. One place, so the home card
// and the "Agen binaan saya" page send the same text.
import { rupiah } from './money';
import { copyToClipboard } from './clipboard';

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
      ? `Raih komisi hingga ${rupiah(maxCommission)} per jamaah yang Anda ajak.`
      : 'Raih komisi untuk setiap jamaah yang Anda ajak.';
  return [
    `Mau dapat penghasilan tambahan? Rekomendasikan relasi Anda untuk berumroh bersama ${travelName || 'travel umroh'}.`,
    '',
    commissionLine,
    '',
    link,
  ].join('\n');
};

export type InviteResult = 'shared' | 'copied' | 'cancelled' | 'failed';

// One action for the invite: the phone's share sheet (WhatsApp, copy, ...) when there is one, otherwise copy the
// whole message. 'cancelled' = the person closed the sheet.
export const shareInvite = async (text: string): Promise<InviteResult> => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ text });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
  }
  return (await copyToClipboard(text)) ? 'copied' : 'failed';
};
