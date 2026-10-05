import assert from 'node:assert';
import { clampedPage, lastPage } from '../src/utils/pagination.ts';
import { parseJamaahCount, parseWholeNumber } from '../src/screens/programs/numberInput.ts';
import { withVersion } from '../src/utils/cacheBust.ts';
import { adminStatusView, couponState, domainStatusView } from '../src/modules/superadmin/shared/statusLabels.ts';
import { parseAffiliatorDraft, toAffiliatorDraft } from '../src/modules/superadmin/views/affiliatorSettingsForm.ts';

// --- Prospect list page clamp ---
assert.strictEqual(lastPage(25, 25), 1);
assert.strictEqual(lastPage(26, 25), 2);
assert.strictEqual(lastPage(0, 25), 1);
// Page 2 had 1 row; it left the filter: total 25 -> back to page 1 (no "26-25 dari 25").
assert.strictEqual(clampedPage(2, 25, 25), 1);
// Stale ?page=9 link with 60 rows at 25 per page -> page 3.
assert.strictEqual(clampedPage(9, 60, 25), 3);
// Valid pages are left alone.
assert.strictEqual(clampedPage(1, 0, 25), null);
assert.strictEqual(clampedPage(3, 60, 25), null);
assert.strictEqual(clampedPage(1, 25, 25), null);
// Empty list on a later page -> page 1.
assert.strictEqual(clampedPage(4, 0, 25), 1);

// --- Jamaah count (Edit prospek): empty while retyping, validated on save ---
assert.strictEqual(parseJamaahCount(''), null); // Backspace on "3" no longer jumps to 1
assert.strictEqual(parseJamaahCount('5'), 5);
assert.strictEqual(parseJamaahCount(' 12 '), 12);
assert.strictEqual(parseJamaahCount('0'), null);
assert.strictEqual(parseJamaahCount('51'), null);
assert.strictEqual(parseJamaahCount('50'), 50);
assert.strictEqual(parseJamaahCount('2,5'), null);
assert.strictEqual(parseJamaahCount('2.5'), null);
assert.strictEqual(parseJamaahCount('-1'), null);

// --- Whole numbers (affiliator hold days / minimum payout) ---
assert.strictEqual(parseWholeNumber(''), null);
assert.strictEqual(parseWholeNumber('0'), 0);
assert.strictEqual(parseWholeNumber('10.5'), null); // not 105
assert.strictEqual(parseWholeNumber('366', 0, 365), null);
assert.strictEqual(parseWholeNumber('365', 0, 365), 365);

// --- Cache-bust for fixed-path uploads (agent poster) ---
assert.strictEqual(withVersion('http://x/uploads/1/agent/poster.webp', null), 'http://x/uploads/1/agent/poster.webp');
assert.strictEqual(withVersion('http://x/uploads/1/agent/poster.webp', 123), 'http://x/uploads/1/agent/poster.webp?v=123');
assert.strictEqual(withVersion('http://x/a.webp?s=1', 7), 'http://x/a.webp?s=1&v=7');
assert.strictEqual(withVersion('http://x/a.webp#top', 7), 'http://x/a.webp?v=7#top');
assert.strictEqual(withVersion('blob:http://x/abc', 7), 'blob:http://x/abc');
assert.strictEqual(withVersion('', 7), '');

// --- Staff portal labels ---
assert.deepStrictEqual(adminStatusView('active'), { label: 'Aktif', tone: 'green' });
assert.deepStrictEqual(adminStatusView('inactive'), { label: 'Nonaktif', tone: 'neutral' });
assert.deepStrictEqual(adminStatusView(''), { label: 'Aktif', tone: 'green' });
assert.deepStrictEqual(domainStatusView(null), { label: 'Subdomain aktif', tone: 'neutral' });
assert.deepStrictEqual(domainStatusView('pending'), { label: 'Menunggu verifikasi', tone: 'amber' });
assert.deepStrictEqual(domainStatusView('failed'), { label: 'Gagal verifikasi', tone: 'red' });
assert.deepStrictEqual(domainStatusView('active'), { label: 'Aktif', tone: 'green' });

// --- Coupon expiry in WIB (valid through the end of its expiry day, like couponEndOfDay) ---
// Expiry stored 2026-10-05 00:00 WIB = 2026-10-04T17:00:00Z.
const exp = '2026-10-04T17:00:00Z';
assert.strictEqual(couponState('active', exp, new Date('2026-10-05T16:59:00Z')), 'active'); // 23:59 WIB on the 5th
assert.strictEqual(couponState('active', exp, new Date('2026-10-05T17:00:00Z')), 'expired'); // 00:00 WIB on the 6th
assert.strictEqual(couponState('active', null, new Date('2030-01-01T00:00:00Z')), 'active');
assert.strictEqual(couponState('inactive', exp, new Date('2026-10-01T00:00:00Z')), 'inactive');
assert.strictEqual(couponState('active', 'garbage', new Date()), 'active');

// --- Affiliator program settings: a cleared field is refused, never saved as 0 ---
const base = toAffiliatorDraft({ first_rate: 10, renewal_rate: 5, coupon_discount: 10, hold_days: 14, min_payout: 100000 });
assert.deepStrictEqual(parseAffiliatorDraft(base), { ok: true, value: { first_rate: 10, renewal_rate: 5, coupon_discount: 10, hold_days: 14, min_payout: 100000 } });
assert.deepStrictEqual(parseAffiliatorDraft({ ...base, first_rate: '2,5' }).ok && parseAffiliatorDraft({ ...base, first_rate: '2,5' }).value.first_rate, 2.5);
for (const k of ['first_rate', 'renewal_rate', 'coupon_discount', 'hold_days', 'min_payout']) {
  const r = parseAffiliatorDraft({ ...base, [k]: '' });
  assert.strictEqual(r.ok, false, `${k} empty must be refused`);
  assert.match(r.error, /wajib diisi/);
}
assert.strictEqual(parseAffiliatorDraft({ ...base, first_rate: '0' }).ok, true); // 0% is allowed when typed
assert.strictEqual(parseAffiliatorDraft({ ...base, coupon_discount: '0' }).ok, false); // backend needs > 0
assert.strictEqual(parseAffiliatorDraft({ ...base, renewal_rate: '101' }).ok, false);
assert.strictEqual(parseAffiliatorDraft({ ...base, hold_days: '400' }).ok, false);
assert.strictEqual(parseAffiliatorDraft({ ...base, min_payout: '-5' }).ok, false);

console.log('list-and-forms: all assertions passed');
