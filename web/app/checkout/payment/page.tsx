import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { PaymentInstructionPage } from '../../../components/checkout/PaymentInstructionPage';

export const metadata = {
  title: 'Instruksi Pembayaran | KlikUmroh.id',
  description:
    'Selesaikan pembayaran untuk mengaktifkan platform agen & affiliate travel umroh Anda.',
};

export default function CheckoutPaymentRoute() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--km-bg)',
          }}
        >
          <Loader2
            size={32}
            style={{ color: 'var(--km-green-2)', animation: 'spin 1s linear infinite' }}
          />
        </div>
      }
    >
      <PaymentInstructionPage />
    </Suspense>
  );
}
