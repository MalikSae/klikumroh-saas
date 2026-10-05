import assert from 'node:assert';
import { subscriptionStatusView } from '../src/modules/superadmin/shared/subscriptionStatus.ts';
import { todayWIB } from '../src/utils/datetime.ts';

// Derived subscription_status wins over the raw tenants.status (an expired travel is never "Aktif").
assert.deepStrictEqual(subscriptionStatusView('expired', 'active'), { key: 'expired', label: 'Kedaluwarsa', tone: 'red' });
assert.deepStrictEqual(subscriptionStatusView('suspended', 'suspended'), { key: 'suspended', label: 'Ditangguhkan', tone: 'red' });
assert.deepStrictEqual(subscriptionStatusView('no_plan', 'active'), { key: 'no_plan', label: 'Tanpa Paket', tone: 'neutral' });
assert.strictEqual(subscriptionStatusView('active', 'active').label, 'Aktif');
assert.strictEqual(subscriptionStatusView('pending').label, 'Pending');
assert.strictEqual(subscriptionStatusView('demo').label, 'Demo');
// Fallbacks: raw status when subscription_status is absent, then Trial.
assert.strictEqual(subscriptionStatusView(undefined, 'active').label, 'Aktif');
assert.strictEqual(subscriptionStatusView(null, 'inactive').label, 'Nonaktif');
assert.strictEqual(subscriptionStatusView(undefined, undefined).label, 'Trial');
assert.strictEqual(subscriptionStatusView('something_new').label, 'something_new');

// WIB calendar date: 2026-10-04T18:30Z is already 5 Oct 01:30 WIB (UTC would still say the 4th).
assert.strictEqual(todayWIB(new Date('2026-10-04T18:30:00Z')), '2026-10-05');
assert.strictEqual(todayWIB(new Date('2026-10-04T16:59:59Z')), '2026-10-04');
assert.strictEqual(todayWIB(new Date('2026-12-31T17:00:00Z')), '2027-01-01');

console.log('status-date: all assertions passed');

// Super admin dates are WIB whatever the device timezone: 17:30Z on 4 Oct is already 5 Oct WIB.
{
  const { formatDateWIB, formatDayMonthWIB } = await import('../src/utils/datetime.ts');
  const wib = new Date('2026-10-05T00:30:00+07:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
  assert.strictEqual(formatDateWIB('2026-10-04T17:30:00Z'), wib);
  assert.ok(formatDayMonthWIB('2026-10-04T17:30:00Z').startsWith('5 '));
  assert.strictEqual(formatDayMonthWIB('nope'), '');
}
