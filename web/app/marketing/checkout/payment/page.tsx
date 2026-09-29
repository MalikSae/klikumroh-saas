import { redirect } from 'next/navigation';

// The public payment page was removed: billing now lives in the dashboard (sign in first).
// Old links carried a payment token in the query string; redirect to a clean /login so it is dropped.
export const metadata = {
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function LegacyPaymentRoute() {
  redirect('/login');
}
