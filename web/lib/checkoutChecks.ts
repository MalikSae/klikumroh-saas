// Interpreting the checkout's live checks (subdomain availability, coupon) from the API response.
// A rate limit (429) or a server error is not an answer about the slug or coupon itself, so it must
// never read as "Subdomain sudah digunakan" / "Kupon tidak valid".

export const TOO_MANY_ATTEMPTS_MESSAGE = 'Terlalu banyak percobaan, coba lagi sebentar';

export type SlugCheckOutcome =
  | { status: 'available'; reason: '' }
  | { status: 'unavailable'; reason: string }
  // The check could not answer (rate limited, server error): shown as info, does not block submit.
  | { status: 'unknown'; reason: string };

type CheckBody = { available?: boolean; reason?: string; error?: string; message?: string } | null | undefined;

export function slugCheckOutcome(httpStatus: number, data: CheckBody): SlugCheckOutcome {
  if (httpStatus === 429) return { status: 'unknown', reason: TOO_MANY_ATTEMPTS_MESSAGE };
  if (httpStatus < 200 || httpStatus >= 300 || !data || typeof data.available !== 'boolean') {
    return { status: 'unknown', reason: 'Ketersediaan subdomain belum bisa dicek. Coba lagi sebentar.' };
  }
  if (data.available) return { status: 'available', reason: '' };
  return { status: 'unavailable', reason: data.reason || 'Subdomain sudah digunakan' };
}

// Error text for a coupon check that did not return a valid coupon.
export function couponErrorMessage(httpStatus: number, data: CheckBody): string {
  if (httpStatus === 429) return TOO_MANY_ATTEMPTS_MESSAGE;
  if (httpStatus >= 500) return 'Gagal memvalidasi kupon. Coba lagi.';
  // The API returns the reason in `error` (e.g. "kode kupon tidak ditemukan").
  return data?.error || data?.message || 'Kupon tidak valid atau sudah kedaluwarsa';
}
