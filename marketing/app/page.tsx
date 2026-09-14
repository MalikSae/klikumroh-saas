import React from 'react';
import { Section01Navbar } from '../components/Section01Navbar';
import { Section02Hero } from '../components/Section02Hero';
import { Section03Problem } from '../components/Section03Problem';
import { Section04Positioning } from '../components/Section04Positioning';
import { Section05BeforeAfter } from '../components/Section05BeforeAfter';
import { Section06HowItWorks } from '../components/Section06HowItWorks';
import { Section07AgentDashboard } from '../components/Section07AgentDashboard';
import { Section08AgentActivation } from '../components/Section08AgentActivation';
import { Section09Whitelabel } from '../components/Section09Whitelabel';
import { Section10TravelDashboard } from '../components/Section10TravelDashboard';
import { Section11Analytics } from '../components/Section11Analytics';
import { Section12TwoConditions } from '../components/Section12TwoConditions';
import { Section13Comparison } from '../components/Section13Comparison';
import { Section14Commission } from '../components/Section14Commission';
import { Section15DataTrust } from '../components/Section15DataTrust';
import { Section16SocialProof } from '../components/Section16SocialProof';
import { PricingSection } from '../components/PricingSection';
import { Section17FAQ } from '../components/Section17FAQ';
import { Section18FinalCTA } from '../components/Section18FinalCTA';
import { Section19Footer } from '../components/Section19Footer';

export default function MarketingHomePage() {
  return (
    <main>
      <Section01Navbar />
      <Section02Hero />
      <Section03Problem />
      <Section04Positioning />
      <Section05BeforeAfter />
      <Section06HowItWorks />
      <Section07AgentDashboard />
      <Section08AgentActivation />
      <Section09Whitelabel />
      <Section10TravelDashboard />
      <Section11Analytics />
      <Section12TwoConditions />
      <Section13Comparison />
      <Section14Commission />
      <Section15DataTrust />
      <Section16SocialProof />
      <PricingSection />
      <Section17FAQ />
      <Section18FinalCTA />
      <Section19Footer />
    </main>
  );
}
