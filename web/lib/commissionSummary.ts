// Totals for the agent's commission history cards (Riwayat komisi).
//
// Ledger amounts are signed: a cancelled closing or an admin edit writes a negative correction, held or
// released like the commission it corrects, so ledger rows are summed with their sign (the same totals
// the server uses for Tarik saldo). Withdrawals are the payout rows only.

export interface CommissionHistoryEntry {
  source: string; // 'ledger' | 'payout'
  amount: number;
  status?: string; // payout: 'pending' | 'approved' | 'rejected' | 'paid'
  held?: boolean; // ledger entry not withdrawable yet (jamaah belum lunas)
}

export interface CommissionSummary {
  tertahan: number;
  sudahCair: number; // withdrawals the travel has transferred (paid)
  menungguTransfer: number; // approved by the travel, transfer not done yet (shown as "Menunggu transfer")
  // What the agent can still request: released commission minus every request not rejected (pending,
  // approved, paid). Same number as Tarik saldo (server saldo_tersedia), keputusan pendiri 5 Okt 2026.
  bisaDicairkan: number;
}

export function summarizeCommissionHistory(items: CommissionHistoryEntry[]): CommissionSummary {
  let cair = 0;
  let tertahan = 0;
  let sudahCair = 0;
  let menungguTransfer = 0;
  let diproses = 0; // requests still waiting for the travel admin
  for (const item of items) {
    if (item.source === 'ledger') {
      if (item.held) tertahan += item.amount;
      else cair += item.amount;
    } else if (item.source === 'payout') {
      // An approved request can still be cancelled by the admin (it becomes rejected): only paid is withdrawn.
      if (item.status === 'paid') sudahCair += item.amount;
      else if (item.status === 'approved') menungguTransfer += item.amount;
      else if (item.status === 'pending') diproses += item.amount;
    }
  }
  return {
    tertahan: Math.max(0, tertahan),
    sudahCair,
    menungguTransfer,
    bisaDicairkan: Math.max(0, cair - sudahCair - menungguTransfer - diproses),
  };
}
