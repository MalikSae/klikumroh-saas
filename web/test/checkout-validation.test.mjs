import test from 'node:test';
import assert from 'node:assert/strict';

// validateWhatsApp is the real helper used by CheckoutView; validateEmail below is still a mirror.
import { validateWhatsApp } from '../lib/signupWhatsApp.ts';

function validateEmail(val) {
  const trimmed = (val || '').trim().toLowerCase();
  if (!trimmed) {
    return 'Email wajib diisi';
  }

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (!emailRegex.test(trimmed)) {
    return 'Format email tidak valid (contoh: nama@travel.com)';
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return 'Format email tidak valid';
  }
  const domainParts = parts[1].split('.');
  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2) {
    return 'Domain email tidak valid (contoh: .com, .id, .co.id)';
  }

  return undefined;
}

test('WhatsApp Validation - Valid Indonesian numbers', () => {
  assert.equal(validateWhatsApp('081234567890'), undefined);
  assert.equal(validateWhatsApp('0812-3456-7890'), undefined);
  assert.equal(validateWhatsApp('0812 3456 7890'), undefined);
  assert.equal(validateWhatsApp('+6281234567890'), undefined);
  assert.equal(validateWhatsApp('6281234567890'), undefined);
  assert.equal(validateWhatsApp('08571234567'), undefined);
  assert.equal(validateWhatsApp('089612345678'), undefined);
});

test('WhatsApp Validation - Invalid numbers', () => {
  assert.ok(validateWhatsApp(''));
  assert.ok(validateWhatsApp('   '));
  assert.ok(validateWhatsApp('12345'));
  assert.ok(validateWhatsApp('0211234567')); // Landline
  assert.ok(validateWhatsApp('0812345')); // Too short
  assert.ok(validateWhatsApp('08123456789012345')); // Too long
  assert.ok(validateWhatsApp('0812abc345')); // Letters
  assert.ok(validateWhatsApp('hello@world.com'));
});

test('Email Validation - Valid emails', () => {
  assert.equal(validateEmail('admin@travel.com'), undefined);
  assert.equal(validateEmail('contact.pic@albarakah.co.id'), undefined);
  assert.equal(validateEmail('info+promo@umrah-travel.id'), undefined);
  assert.equal(validateEmail('USER.123@GMAIL.COM'), undefined);
});

test('Email Validation - Invalid emails', () => {
  assert.ok(validateEmail(''));
  assert.ok(validateEmail('   '));
  assert.ok(validateEmail('admin'));
  assert.ok(validateEmail('admin@'));
  assert.ok(validateEmail('admin@travel'));
  assert.ok(validateEmail('admin@.com'));
  assert.ok(validateEmail('@travel.com'));
  assert.ok(validateEmail('admin@travel.c')); // TLD too short
  assert.ok(validateEmail('admin travel@domain.com'));
});

// Round 4 L3: a rate-limited or failed live check is never read as "taken" / "invalid".
import { slugCheckOutcome, couponErrorMessage, TOO_MANY_ATTEMPTS_MESSAGE } from '../lib/checkoutChecks.ts';

test('slug check: 429 and server errors are "unknown", not "unavailable"', () => {
  assert.deepEqual(slugCheckOutcome(429, { error: 'Terlalu banyak permintaan.' }), { status: 'unknown', reason: TOO_MANY_ATTEMPTS_MESSAGE });
  assert.equal(slugCheckOutcome(500, { error: 'x' }).status, 'unknown');
  assert.equal(slugCheckOutcome(502, null).status, 'unknown');
  assert.equal(slugCheckOutcome(200, {}).status, 'unknown');
  assert.deepEqual(slugCheckOutcome(200, { available: true }), { status: 'available', reason: '' });
  assert.deepEqual(slugCheckOutcome(200, { available: false }), { status: 'unavailable', reason: 'Subdomain sudah digunakan' });
  assert.deepEqual(slugCheckOutcome(200, { available: false, reason: 'Subdomain dicadangkan' }), { status: 'unavailable', reason: 'Subdomain dicadangkan' });
});

test('coupon check: 429 shows the rate-limit text, other errors keep the API reason', () => {
  assert.equal(couponErrorMessage(429, { error: 'Terlalu banyak permintaan.' }), TOO_MANY_ATTEMPTS_MESSAGE);
  assert.equal(couponErrorMessage(400, { error: 'kode kupon tidak ditemukan' }), 'kode kupon tidak ditemukan');
  assert.equal(couponErrorMessage(200, { valid: false }), 'Kupon tidak valid atau sudah kedaluwarsa');
  assert.equal(couponErrorMessage(502, null), 'Gagal memvalidasi kupon. Coba lagi.');
});
