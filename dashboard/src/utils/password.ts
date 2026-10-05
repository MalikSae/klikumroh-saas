// Checks a password an admin sets for someone else (agent or travel admin reset). The password is sent
// exactly as typed: login compares it untrimmed, so the UI never trims it. Leading/trailing spaces are
// refused because the admin passes the password on by chat, where an invisible space makes login fail.
export const MIN_PASSWORD_LENGTH = 8;

export const resetPasswordProblem = (password: string): string | null => {
  if (password.trim() === '') return 'Kata sandi baru wajib diisi.';
  if (password !== password.trim()) return 'Kata sandi tidak boleh diawali atau diakhiri spasi.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Kata sandi baru minimal ${MIN_PASSWORD_LENGTH} karakter.`;
  return null;
};
