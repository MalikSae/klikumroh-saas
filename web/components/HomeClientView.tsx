'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { MobileContainer } from './MobileContainer';
import { PublicHeader } from './PublicHeader';
import { HeroCarousel, type PublicBannerItem } from './HeroCarousel';
import { TrustStrip } from './TrustStrip';
import { PackageTabsSection } from './PackageTabsSection';
import { TestimonialSection, type PublicTestimonialItem } from './TestimonialSection';
import { FAQAccordion, type PublicFAQItem } from './FAQAccordion';
import { CTASection } from './CTASection';
import { PublicFooter } from './PublicFooter';
import { BottomNavbar } from './BottomNavbar';
import { MenuBottomSheet } from './MenuBottomSheet';
import { ProspectModal } from './ProspectModal';
import type { PublicPackage } from './PublicCatalog';
import type { PublicTenantInfo } from '../app/page';
import designTokens from '../../design-tokens.json';
import './HomeClientView.css';

export interface HomeClientViewProps {
  packages: PublicPackage[];
  tenantInfo: PublicTenantInfo | null;
  banners?: PublicBannerItem[];
  testimonials?: PublicTestimonialItem[];
  faqs?: PublicFAQItem[];
}

export const HomeClientView: React.FC<HomeClientViewProps> = ({ packages, tenantInfo, banners = [], testimonials = [], faqs = [] }) => {
  const [isProspectModalOpen, setIsProspectModalOpen] = useState(false);
  const [isMenuSheetOpen, setIsMenuSheetOpen] = useState(false);
  const router = useRouter();
  const handleOpenGeneralInterest = () => setIsProspectModalOpen(true);
  const layoutStyle = Object.fromEntries(Object.entries(designTokens.publicConversionLayout).map(([key, value]) => ['--cro-' + key, value]));
  const brandingStyle = tenantInfo?.brand_primary_color ? { '--tw-brand-primary': tenantInfo.brand_primary_color } : {};

  return (
    <div className="tw-home" style={{ ...layoutStyle, ...brandingStyle } as React.CSSProperties}>
      <MobileContainer>
        <PublicHeader tenantName={tenantInfo?.name} logoUrl={tenantInfo?.brand_logo_url} iconUrl={tenantInfo?.brand_icon_url} />
        {banners.length > 0 && <HeroCarousel banners={banners} />}
        <TrustStrip ppiuNumber={tenantInfo?.ppiu_number} trustRating={tenantInfo?.trust_rating} trustAlumniCount={tenantInfo?.trust_alumni_count} trustGuarantee={tenantInfo?.trust_guarantee} />
        <PackageTabsSection packages={packages} onSelectPackage={(pkg) => router.push(`/paket/${pkg.id}`)} />
        <CTASection onOpenModal={handleOpenGeneralInterest} />
        <TestimonialSection testimonials={testimonials} />
        <FAQAccordion faqs={faqs} />
        {/* Agent Partnership CTA Banner */}
        <section style={{ padding: '0 16px 24px 16px' }}>
          <div
            style={{
              backgroundColor: 'var(--tw-surface, #FFFFFF)',
              border: '1px solid var(--tw-border, #E2E8F0)',
              borderRadius: '12px',
              padding: '20px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '8px',
                  backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary, #0D9488) 12%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--tw-brand-primary, #0D9488)',
                  flexShrink: 0,
                }}
              >
                <Users size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--tw-text-primary, #0F172A)' }}>
                  Peluang Syiar Bersama {tenantInfo?.name || 'Kami'}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--tw-text-muted, #64748B)' }}>
                  Dapatkan komisi berkah & fasilitas link syiar resmi
                </span>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--tw-text-secondary, #334155)', lineHeight: 1.5 }}>
              Ajak keluarga dan kerabat beribadah ke Baitullah. Dapatkan link syiar digital resmi dan dashboard pemantauan komisi yang transparan.
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <Link
                href="/agen/daftar"
                className="tw-button tw-button--primary tw-button--md"
                style={{ textDecoration: 'none', flex: 1, justifyContent: 'center' }}
              >
                <span>Daftar Mitra Agen</span>
              </Link>
              <Link
                href="/agen/login"
                className="tw-button tw-button--secondary tw-button--md"
                style={{ textDecoration: 'none', justifyContent: 'center' }}
              >
                <span>Masuk</span>
              </Link>
            </div>
          </div>
        </section>
        <PublicFooter tenantName={tenantInfo?.name} address={tenantInfo?.address} phone={tenantInfo?.phone} whatsappNumber={tenantInfo?.whatsapp_number} email={tenantInfo?.email} ppiuNumber={tenantInfo?.ppiu_number} />
      </MobileContainer>
      <BottomNavbar onOpenMenu={() => setIsMenuSheetOpen(true)} waNumber={tenantInfo?.whatsapp_number || undefined} />
      <MenuBottomSheet isOpen={isMenuSheetOpen} onClose={() => setIsMenuSheetOpen(false)} />
      <ProspectModal isOpen={isProspectModalOpen} onClose={() => setIsProspectModalOpen(false)} selectedPackage={null} />
    </div>
  );
};

