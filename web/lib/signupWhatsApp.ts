// WhatsApp number check for the travel sign-up (checkout). Indonesian mobile numbers only: the backend
// (service/public_signup.go) normalizes the number to "62..." and refuses anything else.
export function validateWhatsApp(val: string): string | undefined {
  const trimmed = val.trim();
  if (!trimmed) {
    return 'Nomor WhatsApp wajib diisi';
  }

  // Bersihkan karakter pemisah umum
  const cleaned = trimmed.replace(/[\s\-()]/g, '');

  // Cek karakter angka dan leading +
  if (!/^\+?[0-9]+$/.test(cleaned)) {
    return 'Nomor WhatsApp hanya boleh berisi angka';
  }

  // Format Indonesia yang diawali 0: harus nomor seluler 08 (bukan telepon rumah 02x)
  if (cleaned.startsWith('0')) {
    if (!cleaned.startsWith('08')) {
      return 'Nomor WhatsApp harus nomor seluler (diawali 08)';
    }
    if (cleaned.length < 10 || cleaned.length > 14) {
      return 'Nomor WhatsApp harus 10–14 digit (contoh: 081234567890)';
    }
    return undefined;
  }

  // Format Indonesia yang diawali +62: harus +628
  if (cleaned.startsWith('+62')) {
    if (!cleaned.startsWith('+628')) {
      return 'Nomor WhatsApp Indonesia harus diawali +628';
    }
    if (cleaned.length < 12 || cleaned.length > 16) {
      return 'Nomor WhatsApp harus 11–15 digit (contoh: +6281234567890)';
    }
    return undefined;
  }

  // Format Indonesia yang diawali 62: harus 628
  if (cleaned.startsWith('62')) {
    if (!cleaned.startsWith('628')) {
      return 'Nomor WhatsApp Indonesia harus diawali 628';
    }
    if (cleaned.length < 11 || cleaned.length > 15) {
      return 'Nomor WhatsApp harus 11–15 digit (contoh: 6281234567890)';
    }
    return undefined;
  }

  // Nomor luar negeri (+1, +60, ...) tidak diterima backend.
  if (cleaned.startsWith('+')) {
    return 'Nomor WhatsApp harus nomor Indonesia (diawali +62 atau 08)';
  }

  return 'Gunakan format 08xxxxxxxxxx atau +628xxxxxxxxxx';
}
