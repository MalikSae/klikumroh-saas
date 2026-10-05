import assert from 'node:assert';
import { addMonthsClampedWIB, discountedPrice, impliedDiscountPercentage, planChangeTotal } from '../src/utils/billingMath.ts';
import { resetPasswordProblem } from '../src/utils/password.ts';
import { fitsUploadLimit, multipartOverhead } from '../src/utils/uploadLimit.ts';

// addMonthsClampedWIB mirrors addMonthsClamped (internal/service/months.go), in WIB.
const wib = (s) => new Date(`${s}+07:00`);
const iso = (d) => d.toISOString();
// 31 Jan + 1 month = 28 Feb (not 3 Mar as Date.setMonth gives), time of day kept.
assert.strictEqual(iso(addMonthsClampedWIB(wib('2027-01-31T23:59:59'), 1)), iso(wib('2027-02-28T23:59:59')));
// Leap year: 29 Feb.
assert.strictEqual(iso(addMonthsClampedWIB(wib('2028-01-31T10:00:00'), 1)), iso(wib('2028-02-29T10:00:00')));
// 31 Aug + 6 months = 28 Feb (the bug report's example: preview said 3 Mar).
assert.strictEqual(iso(addMonthsClampedWIB(wib('2026-08-31T12:00:00'), 6)), iso(wib('2027-02-28T12:00:00')));
// Crossing the year and a normal day.
assert.strictEqual(iso(addMonthsClampedWIB(wib('2026-11-15T08:30:00'), 3)), iso(wib('2027-02-15T08:30:00')));
assert.strictEqual(iso(addMonthsClampedWIB(wib('2026-10-31T00:00:00'), 12)), iso(wib('2027-10-31T00:00:00')));
// 30 Apr + 1 month stays 30 May (no clamp needed).
assert.strictEqual(iso(addMonthsClampedWIB(wib('2027-04-30T09:00:00'), 1)), iso(wib('2027-05-30T09:00:00')));
// The WIB calendar decides the day: 31 Jan 01:00 WIB is still 30 Jan in UTC, yet clamps to 28 Feb WIB.
assert.strictEqual(iso(addMonthsClampedWIB(wib('2027-01-31T01:00:00'), 1)), iso(wib('2027-02-28T01:00:00')));

// Coupon maths like the backend (math.Round(base - pct/100*base), floor 0).
assert.strictEqual(discountedPrice(1_500_000, 20), 1_200_000);
assert.strictEqual(discountedPrice(999_999, 15), 849_999);
assert.strictEqual(discountedPrice(1_500_000, null), 1_500_000);
assert.strictEqual(discountedPrice(1_500_000, 100), 0);
// Plan change keeps the coupon and the unique code; a free result drops the unique code.
assert.strictEqual(planChangeTotal(3_000_000, 20, 123), 2_400_123);
assert.strictEqual(planChangeTotal(3_000_000, null, 123), 3_000_123);
assert.strictEqual(planChangeTotal(3_000_000, 100, 123), 0);
assert.strictEqual(planChangeTotal(0, null, 0), 0);
// Percentage read back from an invoice (affiliator coupons are not in the staff coupon list).
assert.ok(Math.abs(impliedDiscountPercentage(1_500_000, 1_200_456, 456) - 20) < 1e-9);
assert.strictEqual(impliedDiscountPercentage(1_500_000, 0, 0), 100);
assert.strictEqual(impliedDiscountPercentage(1_500_000, 1_500_321, 321), 0);
assert.strictEqual(planChangeTotal(3_000_000, impliedDiscountPercentage(1_500_000, 1_200_456, 456), 456), 2_400_456);

// Reset passwords are sent as typed: blank and space-padded are refused, length counts the typed text.
assert.ok(resetPasswordProblem(''));
assert.ok(resetPasswordProblem('        '));
assert.ok(resetPasswordProblem('rahasia123 '));
assert.ok(resetPasswordProblem(' rahasia123'));
assert.ok(resetPasswordProblem('1234567'));
assert.strictEqual(resetPasswordProblem('rahasia 123'), null); // inner spaces are fine
assert.strictEqual(resetPasswordProblem('12345678'), null);

// Upload size counts the multipart framing: a file just under 8 MB no longer passes the client check.
const LIMIT = 8 * 1024 * 1024;
const photo = (size, name = 'foto.jpg') => ({ size, name, type: 'image/jpeg' });
assert.strictEqual(fitsUploadLimit(photo(LIMIT), 'photo', LIMIT), false);
assert.strictEqual(fitsUploadLimit(photo(LIMIT - 100), 'photo', LIMIT), false);
assert.strictEqual(fitsUploadLimit(photo(LIMIT - 1024), 'photo', LIMIT), true);
assert.strictEqual(fitsUploadLimit(photo(5 * 1024 * 1024), 'photo', LIMIT), true);
// The overhead bound covers a real browser body: Chrome's 38-char boundary and the actual header lines.
{
  const f = photo(0, 'Paket Umroh Ramadhan.jpg');
  const B = '----WebKitFormBoundary' + 'a'.repeat(16);
  const real = `--${B}\r\nContent-Disposition: form-data; name="photo"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n` + `\r\n--${B}--\r\n`;
  assert.ok(multipartOverhead('photo', f) >= new TextEncoder().encode(real).length);
}

console.log('billing-math: all assertions passed');
