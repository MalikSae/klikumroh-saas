import assert from 'node:assert';
import { buildAdLink, isMetaPlatform } from '../src/utils/adLink.ts';
import { sourceLabel, utmValue } from '../src/utils/sourceLabel.ts';
import { isCouponRejectedStatus, planChangeCouponPercentage } from '../src/utils/billingMath.ts';
import { formatRupiahInput, parseRupiah } from '../src/screens/programs/numberInput.ts';
import { PROSPECT_LIST_STATUSES, prospectListStateFromParams } from '../src/utils/prospectListQuery.ts';
import { couponExhausted, paymentNeedsReview, paymentStatusView } from '../src/modules/superadmin/shared/statusLabels.ts';
import { subscriptionStatusView } from '../src/modules/superadmin/shared/subscriptionStatus.ts';
import { DEFAULT_STAFF_PAGE, staffLoginTarget } from '../src/modules/superadmin/shared/loginRedirect.ts';

// --- Ad link builder: Meta platforms leave utm_source to Meta's {{site_source_name}} ---
const site = 'https://travel.klikumroh.id';
assert.ok(isMetaPlatform('facebook') && isMetaPlatform('instagram'));
assert.ok(!isMetaPlatform('google') && !isMetaPlatform('tiktok'));
assert.strictEqual(buildAdLink(site, 'home', 'facebook', 'promo-ramadhan'), `${site}/?utm_medium=paid&utm_campaign=promo-ramadhan`);
assert.strictEqual(buildAdLink(site, '12', 'instagram', ''), `${site}/paket/12?utm_medium=paid`);
assert.strictEqual(buildAdLink(site, 'home', 'google', 'x'), `${site}/?utm_source=google&utm_medium=paid&utm_campaign=x`);
assert.strictEqual(buildAdLink('', 'home', 'google', 'x'), '');
// Meta appends its parameters; the web keeps the last value, so Meta's utm_source/utm_campaign win.
const withMeta = new URLSearchParams(buildAdLink(site, 'home', 'facebook', 'slug').split('?')[1] + '&utm_source=ig&utm_medium=paid&utm_campaign=Meta%20Name&ad_id=1');
assert.deepStrictEqual(withMeta.getAll('utm_source'), ['ig']);
assert.strictEqual(withMeta.getAll('utm_campaign').at(-1), 'Meta Name');

// --- Source labels ---
assert.strictEqual(sourceLabel('fb'), 'Facebook');
assert.strictEqual(sourceLabel('facebook'), 'Facebook');
assert.strictEqual(sourceLabel('Instagram'), 'Instagram');
assert.strictEqual(sourceLabel('ig'), 'Instagram');
assert.strictEqual(sourceLabel('tiktok'), 'tiktok');
assert.strictEqual(sourceLabel('{{site_source_name}}'), '');
assert.strictEqual(sourceLabel(null), '');
assert.strictEqual(utmValue('{{campaign.name}}'), '');
assert.strictEqual(utmValue(' promo '), 'promo');
assert.strictEqual(utmValue('promo-{{x}}'), 'promo-{{x}}'); // only a whole unfilled placeholder is hidden

// --- Carried coupon fallback only when the server rejected the coupon itself ---
assert.strictEqual(isCouponRejectedStatus(400), true);
assert.strictEqual(isCouponRejectedStatus(404), true);
assert.strictEqual(isCouponRejectedStatus(429), false);
assert.strictEqual(isCouponRejectedStatus(500), false);
assert.strictEqual(isCouponRejectedStatus(503), false);
assert.strictEqual(isCouponRejectedStatus(undefined), false); // network error

// --- Rupiah amounts loaded from the server are formatted so parseRupiah accepts them again ---
assert.strictEqual(formatRupiahInput(150000.5), '150.000,50');
assert.strictEqual(formatRupiahInput('150000.5'), '150.000,50');
assert.strictEqual(formatRupiahInput(150000), '150.000');
assert.strictEqual(formatRupiahInput(1500000.25), '1.500.000,25');
assert.strictEqual(formatRupiahInput(999), '999');
assert.strictEqual(formatRupiahInput(0), '');
assert.strictEqual(formatRupiahInput(null), '');
assert.strictEqual(formatRupiahInput('abc'), '');
for (const v of [150000.5, 150000, 1500000.25, 999, 0.5, 12345678.99]) {
  assert.strictEqual(parseRupiah(formatRupiahInput(v)), v, `round trip ${v}`);
}
assert.strictEqual(parseRupiah('150000.5'), 'invalid'); // the raw form is still refused when typed

// --- Prospect list: a stale ?status falls back to all ---
const st = (q) => prospectListStateFromParams(new URLSearchParams(q), [25, 50]).status;
assert.strictEqual(st('status=foo'), 'all');
assert.strictEqual(st('status=closing'), 'closing');
assert.strictEqual(st(''), 'all');
for (const s of PROSPECT_LIST_STATUSES) assert.strictEqual(st(`status=${s}`), s);

// --- Coupon quota ---
assert.strictEqual(couponExhausted(5, 5), true);
assert.strictEqual(couponExhausted(6, 5), true);
assert.strictEqual(couponExhausted(4, 5), false);
assert.strictEqual(couponExhausted(100, null), false);
assert.strictEqual(couponExhausted(100, 0), false); // 0 = unlimited

// --- Payment badge: list and modal agree ---
assert.strictEqual(paymentStatusView('pending', null, 150000).label, 'Menunggu Transfer');
assert.strictEqual(paymentStatusView('pending', '/p.jpg', 150000).label, 'Perlu Verifikasi');
assert.strictEqual(paymentStatusView('pending', null, 0).label, 'Perlu Verifikasi'); // Rp 0 needs no proof
assert.strictEqual(paymentStatusView('approved', null, 0).label, 'Disetujui');
assert.strictEqual(paymentStatusView('rejected', '/p.jpg', 1).label, 'Ditolak');
assert.strictEqual(paymentStatusView('cancelled', null, 1).label, 'Dibatalkan');
assert.strictEqual(paymentNeedsReview('approved', '/p.jpg', 1), false);

// --- Ubah Paket preview for affiliator coupons ---
assert.deepStrictEqual(planChangeCouponPercentage(20, 15, 100000, 80123, 123), { percentage: 20, estimated: false });
assert.deepStrictEqual(planChangeCouponPercentage(undefined, 15, 100000, 90123, 123), { percentage: 15, estimated: true });
const implied = planChangeCouponPercentage(undefined, null, 100000, 90123, 123);
assert.strictEqual(implied.estimated, true);
assert.ok(Math.abs(implied.percentage - 10) < 1e-9);

// --- Affiliator detail travel pills use the shared subscription view ---
assert.strictEqual(subscriptionStatusView('expired').label, 'Kedaluwarsa');
assert.strictEqual(subscriptionStatusView('suspended').label, 'Ditangguhkan');
assert.strictEqual(subscriptionStatusView('no_plan').label, 'Tanpa Paket');
assert.strictEqual(subscriptionStatusView('demo').label, 'Demo');

// --- Staff login keeps the deep link, only inside /internal ---
assert.strictEqual(staffLoginTarget({ pathname: '/internal/tenants/7', search: '?tab=x' }), '/internal/tenants/7?tab=x');
assert.strictEqual(staffLoginTarget(undefined), DEFAULT_STAFF_PAGE);
assert.strictEqual(staffLoginTarget({ pathname: '/internal/login' }), DEFAULT_STAFF_PAGE);
assert.strictEqual(staffLoginTarget({ pathname: '/settings' }), DEFAULT_STAFF_PAGE);
assert.strictEqual(staffLoginTarget({ pathname: '//evil.example/internal/x' }), DEFAULT_STAFF_PAGE);

console.log('round5 tests passed');
