// Pure helpers for the platform checkout form (CheckoutView): subdomain suggestion from the travel name
// and which parts of the order summary are visible. Kept free of React so test/checkout-validation.test.mjs
// can import them directly.

// Same limits as the backend (internal/service/public_signup.go: 3-30 chars, ^[a-z][a-z0-9]*(-[a-z0-9]+)*$).
// Wording rules (reserved, platform name, misleading, generic, offensive) are checked by the backend.
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;

// Subdomain suggested from "Nama Travel": lowercase, accents dropped, anything outside a-z0-9 becomes a
// hyphen, repeated hyphens collapsed, no hyphen at either end (also after cutting to the maximum length).
export function slugifyTravelName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    // The subdomain must start with a letter: drop leading digits and hyphens ("99 Tours" -> "tours").
    .replace(/^[0-9-]+/, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
}

// The coupon field sits behind "Punya kode kupon?" and stays open while a coupon is applied or an error shows.
export function isCouponFieldOpen(state: { opened: boolean; couponApplied: boolean; couponError: string | null; couponCode: string }): boolean {
  return state.opened || state.couponApplied || !!state.couponError || state.couponCode.trim() !== '';
}

// Subtotal and Diskon rows only appear when a coupon is applied; otherwise the summary shows the total
// alone, so each amount appears once.
export function showCouponBreakdown(couponApplied: boolean): boolean {
  return couponApplied;
}

export const formatRupiah = (amount: number): string => `Rp${amount.toLocaleString('id-ID')}`;

// Secondary text under the per-month price; no amount (the total shows it once).
export function billingPeriodNote(periodMonths: number): string {
  return `Dibayar sekali untuk ${periodMonths} bulan`;
}
