// Wording for the prospect drawer and list that depends on data, kept pure so it can be tested in node.

export type ReleasePolicy = 'lunas' | 'dp';

const BATAL_PREFIX = 'Batal setelah DP:';

// Free-text note stored in lost_reason, or '' when there is none. The backend stores the category label
// when no note was typed (cleanLostReasonWithCategory), and "Batal setelah DP: <alasan>" for a cancelled
// closing, so only text that differs from the label counts as a note.
export const lostReasonNote = (category: string | null | undefined, categoryLabel: string, reason: string | null | undefined): string => {
  let text = (reason || '').trim();
  if (!text || !categoryLabel) return '';
  if (category === 'batal_setelah_dp' && text.toLowerCase().startsWith(BATAL_PREFIX.toLowerCase())) {
    text = text.slice(BATAL_PREFIX.length).trim();
  }
  if (!text || text.toLowerCase() === categoryLabel.trim().toLowerCase()) return '';
  return text;
};

type HeldInfo = { type?: string; held_amount?: number; released_amount?: number } | null | undefined;

// Line under "Sudah DP, menunggu lunas" in the drawer. It follows the booked commission (held vs.
// withdrawable), not the current policy: a policy change does not move commissions already booked.
export const closingPayoffNote = (hasAgent: boolean, komisi: HeldInfo): string => {
  const held = komisi?.type === 'final' ? komisi.held_amount ?? 0 : 0;
  const released = komisi?.type === 'final' ? komisi.released_amount ?? 0 : 0;
  if (hasAgent && held > 0) return 'Komisi agen tertahan sampai jamaah ditandai lunas.';
  if (hasAgent && released > 0) return 'Komisi agen sudah bisa dicairkan. Tandai lunas setelah jamaah melunasi.';
  return 'Tandai lunas setelah jamaah melunasi.';
};

// Extra sentence in the "Tandai lunas" dialog: only when part of the commission is still held.
export const paidOffDialogNote = (hasAgent: boolean, komisi: HeldInfo): string => {
  const held = komisi?.type === 'final' ? komisi.held_amount ?? 0 : 0;
  return hasAgent && held > 0 ? ' Komisi agen yang tertahan menjadi siap dicairkan.' : '';
};

// Sentence in the closing confirmation. With an unknown policy (still loading or failed) it does not
// promise either way.
export const closingCommissionNote = (agentName: string, policy: ReleasePolicy | null): string => {
  if (policy === 'lunas') return `Komisi agen ${agentName} langsung dibukukan dan tertahan sampai jamaah ditandai lunas.`;
  if (policy === 'dp') return `Komisi agen ${agentName} langsung dibukukan dan bisa langsung dicairkan agen (aturan travel: cair saat DP).`;
  return `Komisi agen ${agentName} langsung dibukukan.`;
};

// Tail of the Closing-tab banner about prospects that paid a DP but are not marked lunas yet.
export const awaitingPayoffAgentNote = (withAgent: number, policy: ReleasePolicy | null, fmt: (n: number) => string): string => {
  if (withAgent <= 0) return '.';
  if (policy === 'lunas') return `; komisi agen untuk ${fmt(withAgent)} di antaranya masih tertahan.`;
  return `; ${fmt(withAgent)} di antaranya dari agen.`;
};
