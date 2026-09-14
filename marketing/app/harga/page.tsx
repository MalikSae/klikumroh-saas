import React from 'react';
import { Section01Navbar } from '../../components/Section01Navbar';
import { Section19Footer } from '../../components/Section19Footer';
import { PricingSection } from '../../components/PricingSection';
import { fetchPricingPlans } from '../../lib/api';
import '../../components/sections.css';

export default async function HargaPage() {
  const plans = await fetchPricingPlans();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Section01Navbar />

      <main style={{ flex: 1, paddingTop: '32px', paddingBottom: '64px' }}>
        <PricingSection
          initialPlans={plans}
          title="Pilihan Paket Berlangganan KlikUmroh"
          subtitle="Investasi transparan untuk sistem agen, referral tracking, dan website whitelabel travel Anda."
        />
      </main>

      <Section19Footer />
    </div>
  );
}
