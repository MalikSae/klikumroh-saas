// When an affiliator can request a payout. Shared by the home page (its primary button) and the Komisi
// page (the request itself), so the home never offers "Ajukan pencairan" that Komisi then refuses.
// Mirrors the server: bank details complete (trimmed, like bankComplete in internal/service/affiliator.go),
// nothing already requested, and an available balance of at least the program minimum.

export interface PayoutRuleInput {
  affiliator: { bank_name?: string | null; bank_account_number?: string | null; bank_account_holder?: string | null };
  balance: { available: number; requested: number };
  min_payout: number;
}

export const hasBankDetails = (a: PayoutRuleInput['affiliator']): boolean =>
  Boolean(a.bank_name?.trim() && a.bank_account_number?.trim() && a.bank_account_holder?.trim());

/** canRequest, plus the reason shown when the balance exists but a request is not possible (null otherwise). */
export const affiliatorPayoutState = (o: PayoutRuleInput, fmtRupiah: (n: number) => string): { canRequest: boolean; reason: string | null } => {
  const hasBank = hasBankDetails(o.affiliator);
  const b = o.balance;
  const canRequest = hasBank && b.available > 0 && b.available >= o.min_payout && b.requested === 0;
  const reason = !hasBank
    ? 'Lengkapi rekening di menu Akun sebelum mengajukan pencairan.'
    : b.requested > 0
      ? 'Pencairan sebelumnya masih diproses tim KlikUmroh.'
      : b.available < o.min_payout
        ? `Minimal pencairan ${fmtRupiah(o.min_payout)}.`
        : null;
  return { canRequest, reason };
};
