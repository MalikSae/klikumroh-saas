import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { CheckoutView } from '../../../components/checkout/CheckoutView';
import { fetchPricingPlans, toPlanTiers } from '../../../lib/pricingPlans';

// Real prices from the super admin in the initial HTML (ISR, 5 minutes).
export const revalidate = 300;

export const metadata = {
  title: 'Checkout | KlikUmroh.id',
  description: 'Pendaftaran dan pembayaran sistem KlikUmroh.',
  // Same checkout as /checkout: point search engines there instead of the homepage (root layout default).
  alternates: { canonical: 'https://klikumroh.id/checkout' },
};

export default async function CheckoutPage() {
  const plans = toPlanTiers(await fetchPricingPlans());
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--km-bg)' }}>
          <Loader2 size={32} style={{ color: 'var(--km-ink)', animation: 'spin 1s linear infinite' }} />
        </div>
      }
    >
      <CheckoutView initialPlans={plans} />
    </Suspense>
  );
}
