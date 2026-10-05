import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWhatsApp } from '../lib/signupWhatsApp.ts';
import { newPasswordError, isBlankPassword } from '../lib/passwordRules.ts';
import { discountedPrice } from '../lib/checkoutPricing.ts';
import { jakartaDayKey, jakartaDayLabel, jakartaTimeLabel, jakartaDateLabel, jakartaMonthOptions } from '../lib/jakartaTime.ts';

// Checkout WhatsApp: the backend only accepts numbers that normalize to 62..., so foreign numbers fail here too.
test('checkout WhatsApp: Indonesian numbers only', () => {
  assert.equal(validateWhatsApp('081234567890'), undefined);
  assert.equal(validateWhatsApp('+6281234567890'), undefined);
  assert.equal(validateWhatsApp('6281234567890'), undefined);
  assert.equal(validateWhatsApp('0812-3456-7890'), undefined);
  assert.equal(validateWhatsApp('+60123456789'), 'Nomor WhatsApp harus nomor Indonesia (diawali +62 atau 08)');
  assert.equal(validateWhatsApp('+14155552671'), 'Nomor WhatsApp harus nomor Indonesia (diawali +62 atau 08)');
  assert.equal(validateWhatsApp('+6221123456'), 'Nomor WhatsApp Indonesia harus diawali +628');
  assert.ok(validateWhatsApp('81234567890'));
  assert.ok(validateWhatsApp(''));
});

// Coupon math: same as Go's math.Round(price - pct/100*price), clamped at 0.
test('checkout discount matches the backend formula', () => {
  assert.deepEqual(discountedPrice(1_500_000, 0), { discount: 0, finalAmount: 1_500_000 });
  assert.deepEqual(discountedPrice(1_000_000, 10), { discount: 100_000, finalAmount: 900_000 });
  // 999 * 12.5% = 124.875: old frontend rounded the discount (125 -> 874); backend rounds the final (874.125 -> 874).
  assert.equal(discountedPrice(999, 12.5).finalAmount, 874);
  // 1 * 50% = 0.5: the old frontend gave Rp0 (1 - round(0.5)); backend math.Round(0.5) = 1.
  assert.equal(discountedPrice(1, 50).finalAmount, 1);
  assert.equal(discountedPrice(149_000, 33.3).finalAmount, Math.round(149_000 - (33.3 / 100) * 149_000));
  assert.deepEqual(discountedPrice(500_000, 100), { discount: 500_000, finalAmount: 0 });
  assert.equal(discountedPrice(500_000, 150).finalAmount, 0);
});

// "WIB" labels are computed in Asia/Jakarta whatever the device zone is.
test('Jakarta time helpers', () => {
  // 2026-10-04 18:30 UTC is 2026-10-05 01:30 WIB: the day must be the 5th.
  const lateUtc = '2026-10-04T18:30:00Z';
  assert.equal(jakartaDayKey(lateUtc), '2026-10-05');
  assert.equal(jakartaTimeLabel(lateUtc), '01.30 WIB');
  assert.equal(jakartaDateLabel(lateUtc, { day: 'numeric', month: 'short', year: 'numeric' }), '5 Okt 2026');
  assert.equal(jakartaDayKey('not a date'), '');
  assert.equal(jakartaTimeLabel('not a date'), '');

  // "Hari ini" / "Kemarin" relative to now in Jakarta: 2026-10-05 01:30 WIB.
  const now = new Date(lateUtc);
  assert.equal(jakartaDayLabel('2026-10-05', now), 'Hari ini');
  assert.equal(jakartaDayLabel('2026-10-04', now), 'Kemarin');
  assert.equal(jakartaDayLabel('2026-10-01', now), 'Kamis, 1 Oktober 2026');
  assert.equal(jakartaDayLabel('', now), 'Tanpa tanggal');
});

// Interest-form months: the first option is the WIB month (the backend rejects earlier months).
test('jakartaMonthOptions starts at the WIB month, not the device or UTC month', () => {
  // 31 Oct 2026 18:00 UTC = 1 Nov 2026 01:00 WIB.
  const opts = jakartaMonthOptions(3, new Date('2026-10-31T18:00:00Z'));
  assert.deepEqual(opts.map((o) => o.value), ['2026-11', '2026-12', '2027-01']);
  assert.deepEqual(opts.map((o) => o.label), ['November 2026', 'Desember 2026', 'Januari 2027']);
  // Still October in Jakarta at 31 Oct 16:59 UTC (23:59 WIB).
  assert.equal(jakartaMonthOptions(1, new Date('2026-10-31T16:59:00Z'))[0].value, '2026-10');
  assert.equal(jakartaMonthOptions(24, new Date('2026-10-05T00:00:00Z')).length, 24);
  assert.equal(jakartaMonthOptions(24, new Date('2026-10-05T00:00:00Z'))[23].value, '2028-09');
});

// Passwords are never trimmed; only spaces is blank and end spaces do not count towards the minimum.
test('password rules: blank rejected, end spaces do not count, value never trimmed', () => {
  assert.equal(newPasswordError(''), 'Password wajib diisi');
  assert.equal(newPasswordError('        '), 'Password wajib diisi');
  assert.equal(newPasswordError('abc     '), 'Password minimal 8 karakter');
  assert.equal(newPasswordError('rahasia1'), undefined);
  assert.equal(newPasswordError(' rahasia1 '), undefined);
  assert.equal(isBlankPassword('   '), true);
  assert.equal(isBlankPassword(' x '), false);
});
