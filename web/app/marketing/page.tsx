import React from 'react';
import { MarketingLandingView } from '../../components/marketing/MarketingLandingView';
import { fetchPricingPlans, toPlanTiers } from '../../lib/pricingPlans';

// ISR: the HTML (seen by visitors before JS and by search engines) carries the real prices from the
// super admin, refreshed every 5 minutes, instead of hardcoded fallback prices.
export const revalidate = 300;

export const metadata = {
  title: 'KlikUmroh.id — Platform Agen & Affiliate Khusus Travel Umroh',
  description:
    'Bangun pasukan agen umroh dan lipatgandakan closing jamaah. Rekrut dan aktifkan agen dengan tools marketing siap pakai, manajemen prospek terintegrasi, dan website whitelabel resmi.',
};

export default async function MarketingPage() {
  const plans = toPlanTiers(await fetchPricingPlans());
  return <MarketingLandingView plans={plans} />;
}
