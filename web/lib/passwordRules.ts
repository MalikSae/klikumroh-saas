// Password checks shared by the web forms (agent sign-up, agent password change, travel checkout).
// The password is never trimmed: it is sent and stored exactly as typed, and login compares it as typed.
// Spaces at the ends do not count towards the minimum length, matching the backend policy, and a password
// of only spaces is blank. No imports so node tests can load this file directly.

export const MIN_PASSWORD_LENGTH = 8;

/** Error text for a new password, or undefined when it is acceptable. */
export const newPasswordError = (password: string, min: number = MIN_PASSWORD_LENGTH): string | undefined => {
  const meaningful = (password || '').trim().length;
  if (meaningful === 0) return 'Password wajib diisi';
  if (meaningful < min) return `Password minimal ${min} karakter`;
  return undefined;
};

/** True when a password field (login, current password) is empty or only spaces. */
export const isBlankPassword = (password: string): boolean => !(password || '').trim();
