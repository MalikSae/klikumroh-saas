// How one row of an agent's commission history reads in the travel dashboard (AgentDetail).

export type LedgerTone = 'in' | 'out' | 'neutral';

export interface LedgerRowLike {
  source: string;
  direction: string;
  status?: string;
  /** Sent by newer backends: false when the row does not change the balance (e.g. a rejected payout). */
  counts_against_balance?: boolean;
}

/**
 * 'out' shows a minus, 'in' a plus, 'neutral' no sign. A rejected payout never left the balance, so it is
 * neutral whatever direction the server sends (older backends send every payout as "keluar").
 */
export const ledgerTone = (c: LedgerRowLike): LedgerTone => {
  if (c.source === 'payout' && c.status === 'rejected') return 'neutral';
  if (c.counts_against_balance === false) return 'neutral';
  if (c.direction === 'keluar') return 'out';
  if (c.direction === 'masuk') return 'in';
  return 'neutral';
};

export const ledgerSign = (tone: LedgerTone): string => (tone === 'out' ? '−' : tone === 'in' ? '+' : '');
