// Checkout price after a coupon, computed exactly like the backend (service/public_signup.go):
// final = math.Round(price - price*pct/100), never below 0. The invoice then adds a unique code
// (100-999 rupiah) on top of any amount above 0, so the transfer total is a little higher.
export function discountedPrice(price: number, discountPercentage: number): { discount: number; finalAmount: number } {
  if (!discountPercentage) {
    return { discount: 0, finalAmount: price };
  }
  // Go's math.Round rounds half away from zero; for the (non-negative) amounts here Math.round matches.
  const finalAmount = Math.max(0, Math.round(price - (discountPercentage / 100) * price));
  return { discount: price - finalAmount, finalAmount };
}
