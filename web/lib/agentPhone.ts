// Agent WhatsApp number check. Mirrors the backend rule exactly:
// internal/service/prospect_validation.go validateProspectPhone (used by validateAgentPhone) plus
// internal/util/phone.go NormalizePhoneToWhatsApp. Allowed: ASCII digits, a "+" only as the first
// character, and the formatting characters space - . ( ). After normalization ("+62"/"0" become "62")
// the number must be 62 followed by 8-13 digits.

const NORMALIZED_PATTERN = /^62[0-9]{8,13}$/;

// normalizeAgentPhone returns the "62..." form the backend stores, or null when the input holds a
// character the backend refuses (letters, a "+" that is not the first character, other symbols).
export function normalizeAgentPhone(raw: string): string | null {
  const s = raw.trim();
  let clean = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch >= '0' && ch <= '9') {
      clean += ch;
    } else if (ch === '+' && i === 0) {
      clean += ch;
    } else if (ch === ' ' || ch === '-' || ch === '.' || ch === '(' || ch === ')') {
      // formatting character, dropped
    } else {
      return null;
    }
  }
  if (clean.startsWith('+62')) return '62' + clean.slice(3);
  if (clean.startsWith('0')) return '62' + clean.slice(1);
  if (clean.startsWith('62')) return clean;
  if (clean.startsWith('+')) return clean.slice(1);
  return clean;
}

// agentPhoneError returns a user-facing message, or undefined when the backend will accept the number.
export function agentPhoneError(raw: string): string | undefined {
  if (!raw.trim()) {
    return 'Nomor WhatsApp wajib diisi';
  }
  const normalized = normalizeAgentPhone(raw);
  if (normalized === null) {
    return 'Nomor WhatsApp hanya boleh berisi angka (boleh spasi, tanda hubung, titik, atau kurung)';
  }
  if (NORMALIZED_PATTERN.test(normalized)) {
    return undefined;
  }
  if (!normalized.startsWith('62')) {
    return 'Gunakan nomor WhatsApp Indonesia yang diawali 08, 62, atau +62';
  }
  if (normalized.length < 10) {
    return 'Nomor WhatsApp terlalu pendek (contoh: 081234567890)';
  }
  return 'Nomor WhatsApp terlalu panjang, periksa kembali nomornya';
}
