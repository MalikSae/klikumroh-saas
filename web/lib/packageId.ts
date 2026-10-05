/**
 * Package id from the /paket/[id] route param. Next.js decodes route params, so the raw value can hold
 * "/", "?" or ".." and must never go into a backend URL unchecked. Only a positive whole number (digits
 * only, leading zeros allowed) is accepted; it is returned as a number so "007" and "7" are the same page.
 * Returns null for anything else (the page answers 404).
 */
export const parsePackageId = (raw: string | undefined | null): number | null => {
  if (typeof raw !== 'string' || !/^\d{1,16}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
