import React from 'react';
import { MarketingNavbar } from './MarketingNavbar';
import { MarketingHero } from './MarketingHero';
import { MarketingEcosystemBar } from './MarketingEcosystemBar';
import { MarketingPainPoints } from './MarketingPainPoints';
import { MarketingWorkflow } from './MarketingWorkflow';
import { MarketingAffiliateSystem } from './MarketingAffiliateSystem';
import { MarketingProspectFeature } from './MarketingProspectFeature';
import { MarketingToolsFeature } from './MarketingToolsFeature';
import { MarketingWhitelabelTrust } from './MarketingWhitelabelTrust';
import { MarketingProductFit } from './MarketingProductFit';
import { MarketingPricing } from './MarketingPricing';
import { MarketingFAQ } from './MarketingFAQ';
import { MarketingFinalCTA } from './MarketingFinalCTA';
import { MarketingFooter } from './MarketingFooter';

export const MarketingLandingView: React.FC = () => {
  return (
    <div style={{ backgroundColor: 'var(--km-bg)', minHeight: '100vh', width: '100%', overflowX: 'hidden' }}>
      <MarketingNavbar />
      <main>
        <MarketingHero />
        <MarketingEcosystemBar />
        <MarketingPainPoints />
        <MarketingWorkflow />
        <MarketingAffiliateSystem />
        <MarketingProspectFeature />
        <MarketingToolsFeature />
        <MarketingWhitelabelTrust />
        <MarketingProductFit />
        <MarketingPricing />
        <MarketingFAQ />
        <MarketingFinalCTA />
      </main>
      <MarketingFooter />
    </div>
  );
};
