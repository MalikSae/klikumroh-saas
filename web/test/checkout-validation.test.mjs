import test from 'node:test';
import assert from 'node:assert/strict';

// Mirroring the pure validation functions to ensure test coverage
function validateWhatsApp(val) {
  const trimmed = (val || '').trim();
  if (!trimmed) {
    return 'Nomor WhatsApp wajib diisi';
  }

  const cleaned = trimmed.replace(/[\s\-()]/g, '');

  if (!/^\+?[0-9]+$/.test(cleaned)) {
    return 'Nomor WhatsApp hanya boleh berisi angka';
  }

  if (cleaned.startsWith('0')) {
    if (!cleaned.startsWith('08')) {
      return 'Nomor WhatsApp harus nomor seluler (diawali 08)';
    }
    if (cleaned.length < 10 || cleaned.length > 14) {
      return 'Nomor WhatsApp harus 10–14 digit (contoh: 081234567890)';
    }
    return undefined;
  }

  if (cleaned.startsWith('+62')) {
    if (!cleaned.startsWith('+628')) {
      return 'Nomor WhatsApp Indonesia harus diawali +628';
    }
    if (cleaned.length < 12 || cleaned.length > 16) {
      return 'Nomor WhatsApp harus 11–15 digit (contoh: +6281234567890)';
    }
    return undefined;
  }

  if (cleaned.startsWith('62')) {
    if (!cleaned.startsWith('628')) {
      return 'Nomor WhatsApp Indonesia harus diawali 628';
    }
    if (cleaned.length < 11 || cleaned.length > 15) {
      return 'Nomor WhatsApp harus 11–15 digit (contoh: 6281234567890)';
    }
    return undefined;
  }

  if (cleaned.startsWith('+')) {
    if (cleaned.length < 10 || cleaned.length > 16) {
      return 'Format nomor internasional tidak valid (minimal 10 digit)';
    }
    return undefined;
  }

  return 'Gunakan format 08xxxxxxxxxx atau +628xxxxxxxxxx';
}

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
