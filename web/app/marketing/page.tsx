import React from 'react';
import { MarketingLandingView } from '../../components/marketing/MarketingLandingView';

export const dynamic = 'force-static';

export const metadata = {
  title: 'KlikUmroh.id — Platform Agen & Affiliate Khusus Travel Umroh',
  description:
    'Bangun pasukan agen umroh dan lipatgandakan closing jamaah. Rekrut dan aktifkan agen dengan tools marketing siap pakai, manajemen prospek terintegrasi, dan website whitelabel resmi.',
};

export default function MarketingPage() {
  return <MarketingLandingView />;
}
