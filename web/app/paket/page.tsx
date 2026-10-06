import React from 'react';
import type { Metadata, ResolvingMetadata } from 'next';
import { headers } from 'next/headers';
import { backendFetch } from '../../lib/backendFetch';
import { PaketClientView } from '../../components/PaketClientView';
import type { PublicPackage } from '../../components/publicPackage';

export const dynamic = 'force-dynamic';

import type { PublicTenantInfo } from '../page';
export type { PublicTenantInfo };

const getBackendBaseUrl = (): string => {
  return process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://localhost:8080';
};

async function getPublishedPackages(host: string): Promise<PublicPackage[]> {
  const backendUrl = getBackendBaseUrl();
  try {
    const res = await backendFetch(`${backendUrl}/api/public/packages`, {
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

// null: no active travel for this host. 'down': the API could not be reached or failed (5xx).
async function getTenantInfo(host: string): Promise<PublicTenantInfo | null | 'down'> {
  const backendUrl = getBackendBaseUrl();
  try {
    const res = await backendFetch(`${backendUrl}/api/public/tenant-info`, {
      headers: {
        Host: host,
        'X-Forwarded-Host': host,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const fromApi = (res.headers.get('content-type') || '').includes('application/json');
      return res.status < 500 && fromApi ? null : 'down';
    }

    const data = await res.json();
    return data || null;
  } catch (err) {
    console.error('Failed to fetch tenant info:', err);
    return 'down';
  }
}

import { SuspendedView } from '../../components/SuspendedView';
import { SiteUnavailableView } from '../../components/SiteUnavailableView';

// Own canonical + OG url for the catalog page; otherwise it inherits the home page's from the root
// layout. Robots (noindex for the demo travel) is left unset so the layout's value still applies.
export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const headerList = await headers();
  // Same host the page body uses for its (no-store) fetches.
  const host = headerList.get('host') || 'travela.klikumroh.local';
  const publicHost = headerList.get('x-forwarded-host') || headerList.get('host') || '';
  const tenantInfo = await getTenantInfo(host);
  if (!tenantInfo || tenantInfo === 'down' || tenantInfo.is_suspended) {
    return {};
  }

  const parentMeta = await parent;
  const canonicalUrl = `${publicHost ? `https://${publicHost}` : ''}/paket`;
  const title = `Paket Umroh | ${tenantInfo.name}`;
  const description = `Daftar paket umroh ${tenantInfo.name}${tenantInfo.city ? ` di ${tenantInfo.city}` : ''}: harga, jadwal keberangkatan, dan fasilitas.`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: tenantInfo.name,
      locale: 'id_ID',
      type: 'website',
      // Keep the travel's share image from the root layout.
      images: parentMeta.openGraph?.images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: parentMeta.twitter?.images,
    },
  };
}

export default async function PaketPage() {
  const headerList = await headers();
  const host = headerList.get('host') || 'travela.klikumroh.local';

  const [packages, tenantInfo] = await Promise.all([
    getPublishedPackages(host),
    getTenantInfo(host),
  ]);

  if (tenantInfo === 'down') {
    return <SiteUnavailableView reason="down" />;
  }

  if (!tenantInfo) {
    return <SiteUnavailableView />;
  }

  if (tenantInfo.is_suspended) {
    return <SuspendedView tenantInfo={tenantInfo} />;
  }

  return (
    <PaketClientView packages={packages} tenantInfo={tenantInfo} />
  );
}
