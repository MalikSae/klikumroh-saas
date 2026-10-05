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
