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
  sudahCair: number; // withdrawals the travel has verified (approved or paid)
  bisaDicairkan: number; // released commission not paid out yet, including requests still being processed
}

export function summarizeCommissionHistory(items: CommissionHistoryEntry[]): CommissionSummary {
  let cair = 0;
  let tertahan = 0;
  let sudahCair = 0;
  for (const item of items) {
    if (item.source === 'ledger') {
      if (item.held) tertahan += item.amount;
      else cair += item.amount;
    } else if (item.source === 'payout' && (item.status === 'approved' || item.status === 'paid')) {
      sudahCair += item.amount;
    }
  }
  return { tertahan: Math.max(0, tertahan), sudahCair, bisaDicairkan: Math.max(0, cair - sudahCair) };
}
