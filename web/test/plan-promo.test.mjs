import assert from 'node:assert';
import { payablePrice, toPlanTiers } from '../lib/planTiers.ts';
import { discountedPrice } from '../lib/checkoutPricing.ts';

// Plan promo (founder decision 7 Oct 2026): the landing and checkout show the promo price, and a coupon
// comes off the promo price, the same as the backend invoice.
const plans = [
  { id: 1, name: '3 Bulan', period_months: 3, price: 1500000 },
  { id: 3, name: '12 Bulan', period_months: 12, price: 4800000, promo_percent: 50, promo_ends_at: '2026-12-31', promo_active: true, promo_price: 2400000 },
  { id: 4, name: '6 Bulan', period_months: 6, price: 2700000, promo_percent: 30, promo_ends_at: null, promo_active: false, promo_price: null },
];
const tiers = toPlanTiers(plans);
const annual = tiers.find((t) => t.id === 3);
assert.strictEqual(annual.promoPercent, 50);
assert.strictEqual(payablePrice(annual), 2400000);
assert.strictEqual(annual.monthlyEquivalent, 200000);
assert.strictEqual(annual.promoEndsAt, '2026-12-31');
// An inactive (ended) promo is not shown.
const six = tiers.find((t) => t.id === 4);
assert.strictEqual(six.promoPercent, undefined);
assert.strictEqual(payablePrice(six), 2700000);
// 50% promo + 20% affiliator coupon = 1.920.000.
assert.strictEqual(discountedPrice(payablePrice(annual), 20).finalAmount, 1920000);
console.log('plan promo web ok');
