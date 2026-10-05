import test from 'node:test';
import assert from 'node:assert/strict';

import { agentPhoneError, normalizeAgentPhone } from '../lib/agentPhone.ts';

// Cases mirror internal/service/prospect_validation.go validateProspectPhone + util.NormalizePhoneToWhatsApp:
// normalized form must be ^62[0-9]{8,13}$.

test('accepts Indonesian numbers in 08 / 62 / +62 form with formatting characters', () => {
  const ok = [
    ['081234567890', '6281234567890'],
    ['0812-3456-7890', '6281234567890'],
    ['0812 3456 7890', '6281234567890'],
    ['0812.3456.7890', '6281234567890'],
    ['(0812) 3456-7890', '6281234567890'],
    ['6281234567890', '6281234567890'],
    ['+62 812-3456-7890', '6281234567890'],
    ['  +6281234567890  ', '6281234567890'],
    ['0812345678', '62812345678'], // 62 + 9 digits
  ];
  for (const [input, normalized] of ok) {
    assert.equal(agentPhoneError(input), undefined, input);
    assert.equal(normalizeAgentPhone(input), normalized, input);
  }
});

test('boundaries: 62 + 8 digits is the minimum, 62 + 13 digits the maximum', () => {
  assert.equal(agentPhoneError('6212345678'), undefined); // 62 + 8
  assert.equal(agentPhoneError('621234567'), 'Nomor WhatsApp terlalu pendek (contoh: 081234567890)'); // 62 + 7
  assert.equal(agentPhoneError('621234567890123'), undefined); // 62 + 13
  assert.equal(agentPhoneError('6212345678901234'), 'Nomor WhatsApp terlalu panjang, periksa kembali nomornya'); // 62 + 14
  assert.equal(agentPhoneError('01234567'), 'Nomor WhatsApp terlalu pendek (contoh: 081234567890)'); // 62 + 7
});

test('refuses empty input', () => {
  assert.equal(agentPhoneError(''), 'Nomor WhatsApp wajib diisi');
  assert.equal(agentPhoneError('   '), 'Nomor WhatsApp wajib diisi');
});

test('refuses letters and other symbols (the old client stripped them silently)', () => {
  const msg = 'Nomor WhatsApp hanya boleh berisi angka (boleh spasi, tanda hubung, titik, atau kurung)';
  assert.equal(agentPhoneError('0812abc34567'), msg);
  assert.equal(agentPhoneError('0812/3456/7890'), msg);
  assert.equal(agentPhoneError('0812+34567890'), msg); // "+" only allowed first
  assert.equal(agentPhoneError('++6281234567890'), msg);
  assert.equal(normalizeAgentPhone('0812abc'), null);
});

test('refuses foreign prefixes and numbers without 0/62', () => {
  const msg = 'Gunakan nomor WhatsApp Indonesia yang diawali 08, 62, atau +62';
  assert.equal(agentPhoneError('+60123456789'), msg);
  assert.equal(agentPhoneError('+1 415 555 0100'), msg);
  assert.equal(agentPhoneError('8123456789'), msg);
});

test('too short / too long numbers', () => {
  assert.equal(agentPhoneError('0812345'), 'Nomor WhatsApp terlalu pendek (contoh: 081234567890)');
  assert.equal(agentPhoneError('12345'), 'Gunakan nomor WhatsApp Indonesia yang diawali 08, 62, atau +62');
  assert.equal(agentPhoneError('08123456789012345'), 'Nomor WhatsApp terlalu panjang, periksa kembali nomornya');
});
