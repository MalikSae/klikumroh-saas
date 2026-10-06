import assert from 'node:assert';
import { summarizeCommissionHistory } from '../lib/commissionSummary.ts';

// Riwayat komisi cards must match the server balance: negative corrections (cancelled closing, admin edit)
// reduce the totals; only payout rows count as withdrawals.
const ledger = (amount, held = false) => ({ source: 'ledger', amount, held });
const payout = (amount, status) => ({ source: 'payout', amount, status });

// 1. Released commission, then the closing is cancelled: nothing left to withdraw.
assert.deepStrictEqual(summarizeCommissionHistory([ledger(1_000_000), ledger(-1_000_000)]), {
  tertahan: 0,
  sudahCair: 0,
  menungguTransfer: 0,
  bisaDicairkan: 0,
});

// 2. Held commission (jamaah belum lunas), then cancelled: nothing held any more.
assert.strictEqual(summarizeCommissionHistory([ledger(500_000, true), ledger(-500_000, true)]).tertahan, 0);

// 3. Admin lowers a released commission from 1,000,000 to 600,000.
assert.strictEqual(summarizeCommissionHistory([ledger(1_000_000), ledger(-400_000)]).bisaDicairkan, 600_000);

// 4. Withdrawals: only paid counts as withdrawn ("Sudah ditarik"); approved is "Menunggu transfer"; rejected
//    (also an approved request the admin cancelled) does not count; a pending request is no longer
//    "Siap ditarik" (same number as Tarik saldo / server saldo_tersedia, keputusan pendiri 5 Okt 2026).
const s = summarizeCommissionHistory([
  ledger(2_000_000),
  payout(500_000, 'paid'),
  payout(300_000, 'approved'),
  payout(100_000, 'rejected'),
  payout(200_000, 'pending'),
  ledger(700_000, true),
]);
assert.deepStrictEqual(s, { tertahan: 700_000, sudahCair: 500_000, menungguTransfer: 300_000, bisaDicairkan: 1_000_000 });

// 4c. An approved request the admin cancels becomes rejected: the money is back in "Siap ditarik".
assert.deepStrictEqual(summarizeCommissionHistory([ledger(1_000_000), payout(300_000, 'rejected')]), {
  tertahan: 0,
  sudahCair: 0,
  menungguTransfer: 0,
  bisaDicairkan: 1_000_000,
});

// 4b. The founder's example: 1,000,000 released, 300,000 requested and not processed yet → 700,000.
assert.strictEqual(summarizeCommissionHistory([ledger(1_000_000), payout(300_000, 'pending')]).bisaDicairkan, 700_000);

// 5. Never negative.
assert.deepStrictEqual(summarizeCommissionHistory([ledger(-50_000), ledger(-10_000, true)]), {
  tertahan: 0,
  sudahCair: 0,
  menungguTransfer: 0,
  bisaDicairkan: 0,
});

console.log('commission-summary: all assertions passed');
