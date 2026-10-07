// Pure billing helpers that mirror the Go backend, so previews show what the server will store.

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Jakarta, no daylight saving.

/**
 * Adds n calendar months in WIB and clamps the day to the last day of the target month, keeping the time
 * of day. Mirrors addMonthsClamped (internal/service/months.go): 31 Jan + 1 month = 28/29 Feb, not 3 Mar
 * as Date.setMonth would give.
 */
export const addMonthsClampedWIB = (date: Date, n: number): Date => {
  const w = new Date(date.getTime() + WIB_OFFSET_MS); // UTC fields now read as the WIB wall clock
  const y = w.getUTCFullYear();
  const m = w.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(w.getUTCDate(), lastDay);
  const utc = Date.UTC(y, m, day, w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds(), w.getUTCMilliseconds());
  return new Date(utc - WIB_OFFSET_MS);
};

/** Price after a percentage coupon, rounded like the backend (math.Round(base - pct/100*base), floor 0). */
export const discountedPrice = (price: number, discountPercentage: number | null | undefined): number => {
  if (discountPercentage == null || discountPercentage <= 0) return price;
  return Math.max(0, Math.round(price - (discountPercentage / 100) * price));
};

/**
 * Amount a plan promo takes off an invoice: amount is the plan's normal price, the promo (percent, the
 * invoice's snapshot) comes off first, rounded like the backend (repository.PromoPrice). 0 without a promo.
 */
export const promoCutOf = (amount: number, promoPercent: number | null | undefined): number => {
  if (promoPercent == null || promoPercent <= 0) return 0;
  return amount - Math.max(0, Math.round(amount * (1 - promoPercent / 100)));
};

/**
 * Coupon percentage implied by an invoice: amount is the plan price, final_amount = discounted + unique code.
 * Used when the coupon itself is not visible to the viewer (affiliator coupons are not in the staff list).
 */
export const impliedDiscountPercentage = (amount: number, finalAmount: number, uniqueCode: number | null | undefined): number => {
  if (amount <= 0) return 0;
  const discounted = Math.max(0, finalAmount - (finalAmount > 0 ? uniqueCode || 0 : 0));
  return Math.min(100, Math.max(0, (1 - discounted / amount) * 100));
};

/**
 * Total a pending invoice gets when staff switch it to another plan (UpdateVerificationPlan): the coupon on
 * the invoice stays and is re-applied to the new price; the unique code stays unless the total becomes 0.
 * When the invoice had no unique code (it was free) the backend draws a new random one, which the preview
 * cannot know, so it is left out.
 */
export const planChangeTotal = (newPlanPrice: number, discountPercentage: number | null | undefined, uniqueCode: number | null | undefined): number => {
  const discounted = discountedPrice(newPlanPrice, discountPercentage);
  if (discounted <= 0) return 0;
  return discounted + (uniqueCode && uniqueCode > 0 ? uniqueCode : 0);
};

/**
 * True when a coupon check failed because the server judged the coupon itself (400/404/422), as opposed
 * to a rate limit (429), a server error (5xx) or a network error (no status). Only then may the open
 * invoice's carried coupon be dropped and left to the server's carry-over rule.
 */
export const isCouponRejectedStatus = (status: number | null | undefined): boolean => status === 400 || status === 404 || status === 422;

/**
 * Coupon percentage for the "Ubah Paket" preview. A staff coupon gives its exact percentage. An affiliator
 * coupon is not in the staff list: the server re-applies the coupon row's current percentage, which follows
 * the program's "Diskon kupon affiliator" setting, so that is used when known; otherwise the percentage
 * implied by the invoice amounts. Affiliator previews are marked estimated (the server recalculates).
 */
export const planChangeCouponPercentage = (
  staffCouponPercentage: number | null | undefined,
  affiliatorProgramDiscount: number | null | undefined,
  amount: number,
  finalAmount: number,
  uniqueCode: number | null | undefined,
): { percentage: number; estimated: boolean } => {
  if (typeof staffCouponPercentage === 'number') return { percentage: staffCouponPercentage, estimated: false };
  if (typeof affiliatorProgramDiscount === 'number') return { percentage: affiliatorProgramDiscount, estimated: true };
  return { percentage: impliedDiscountPercentage(amount, finalAmount, uniqueCode), estimated: true };
};

/**
 * True when an invoice carries a transfer proof that was uploaded for a different total than the one billed
 * now (staff changed the plan or coupon after the travel transferred; keputusan pendiri 6 Okt 2026). Compared
 * in whole cents so float noise from DECIMAL(15,2) never raises a false warning. No proof, or an older proof
 * without a recorded amount (null), never warns.
 */
export const proofAmountMismatch = (
  proofUrl: string | null | undefined,
  proofFinalAmount: number | null | undefined,
  finalAmount: number | null | undefined,
): boolean => {
  if (!proofUrl || proofUrl.trim() === '') return false;
  if (proofFinalAmount == null || finalAmount == null) return false;
  if (!Number.isFinite(proofFinalAmount) || !Number.isFinite(finalAmount)) return false;
  return Math.round(proofFinalAmount * 100) !== Math.round(finalAmount * 100);
};
