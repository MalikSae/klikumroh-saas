import React from 'react';
import { headers } from 'next/headers';
import { HomeClientView } from '../components/HomeClientView';
import type { PublicPackage } from '../components/PublicCatalog';
import type { PublicBannerItem } from '../components/HeroCarousel';
import type { PublicTestimonialItem } from '../components/TestimonialSection';
import type { PublicFAQItem } from '../components/FAQAccordion';

export const dynamic = 'force-dynamic';

export interface PublicTenantInfo {
  name: string;
  brand_primary_color: string | null;
  brand_logo_url: string | null;
  brand_icon_url: string | null;
  whatsapp_number: string | null;
  tagline: string | null;
  about_summary: string | null;
  ppiu_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  trust_rating: string | null;
  trust_alumni_count: string | null;
  trust_guarantee: string | null;
  social_instagram: string | null;
  social_facebook: string | null;
  social_youtube: string | null;
  city: string | null;
  province: string | null;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  og_image_url: string | null;
  is_suspended?: boolean;
  suspended_reason?: string | null;
}

const getBackendBaseUrl = (): string => {
  return process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://localhost:8080';
};

async function getPublishedPackages(host: string): Promise<PublicPackage[]> {
  const backendUrl = getBackendBaseUrl();
  try {
    const res = await fetch(`${backendUrl}/api/public/packages`, {
      headers: {
        Host: host,
        'X-Forwarded-Host': host,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return data || [];
  } catch (err) {
    console.error('Failed to fetch public packages:', err);
    return [];
  }
}

async function getTenantInfo(host: string): Promise<PublicTenantInfo | null> {
  const backendUrl = getBackendBaseUrl();
  try {
    const res = await fetch(`${backendUrl}/api/public/tenant-info`, {
      headers: {
        Host: host,
        'X-Forwarded-Host': host,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data || null;
  } catch (err) {
    console.error('Failed to fetch tenant info:', err);
    return null;
  }
}

async function getPublishedBanners(host: string): Promise<PublicBannerItem[]> {
  const backendUrl = getBackendBaseUrl();
  try {
    const res = await fetch(`${backendUrl}/api/public/banners`, {
      headers: {
        Host: host,
        'X-Forwarded-Host': host,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return data || [];
  } catch (err) {
    console.error('Failed to fetch public banners:', err);
    return [];
  }
}

async function getPublishedTestimonials(host: string): Promise<PublicTestimonialItem[]> {
  const backendUrl = getBackendBaseUrl();
  try {
    const res = await fetch(`${backendUrl}/api/public/testimonials`, {
      headers: {
        Host: host,
        'X-Forwarded-Host': host,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return data || [];
  } catch (err) {
    console.error('Failed to fetch public testimonials:', err);
    return [];
  }
}

async function getPublishedFaqs(host: string): Promise<PublicFAQItem[]> {
  const backendUrl = getBackendBaseUrl();
  try {
    const res = await fetch(`${backendUrl}/api/public/faqs`, {
      headers: {
        Host: host,
        'X-Forwarded-Host': host,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return data || [];
  } catch (err) {
    console.error('Failed to fetch public faqs:', err);
    return [];
  }
}

import { MarketingLandingView } from '../components/marketing/MarketingLandingView';
import { SuspendedView } from '../components/SuspendedView';

export default async function HomePage() {
  const headerList = await headers();
  const hostHeader = headerList.get('x-forwarded-host') || headerList.get('host') || '';
  const host = hostHeader.split(':')[0].trim().toLowerCase();

  const isApexMarketingHost =
    host === 'klikumroh.id' ||
    host === 'www.klikumroh.id' ||
    host === 'klikumroh.local' ||
    host === 'localhost' ||
    host === '127.0.0.1';

  // If visiting the apex marketing domain directly, render marketing landing page
  if (isApexMarketingHost) {
    return <MarketingLandingView />;
  }

  // Otherwise, fetch tenant-specific data for whitelabel website
  const [packages, tenantInfo, banners, testimonials, faqs] = await Promise.all([
    getPublishedPackages(host),
    getTenantInfo(host),
    getPublishedBanners(host),
    getPublishedTestimonials(host),
    getPublishedFaqs(host),
  ]);

  // If no tenant found for this hostname, fallback to marketing landing page
  if (!tenantInfo) {
    return <MarketingLandingView />;
  }

  // If tenant subscription is suspended (past grace period), render suspended notice
  if (tenantInfo.is_suspended) {
    return <SuspendedView tenantInfo={tenantInfo} />;
  }

  return (
    <HomeClientView
      packages={packages}
      tenantInfo={tenantInfo}
      banners={banners}
      testimonials={testimonials}
      faqs={faqs}
    />
  );
}

