import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { CheckoutView } from '../../../components/checkout/CheckoutView';

export const metadata = {
  title: 'Checkout | KlikUmroh.id',
  description: 'Pendaftaran dan pembayaran sistem KlikUmroh.',
};

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--km-bg)' }}>
          <Loader2 size={32} style={{ color: '#09090B', animation: 'spin 1s linear infinite' }} />
        </div>
      }
    >
      <CheckoutView />
    </Suspense>
  );
}
