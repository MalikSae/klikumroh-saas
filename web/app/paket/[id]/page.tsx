import React from 'react';
import type { Metadata, ResolvingMetadata } from 'next';
import { headers } from 'next/headers';
import { backendFetch } from '../../../lib/backendFetch';
import { notFound } from 'next/navigation';
import { PackageDetailClientView } from '../../../components/PackageDetailClientView';
import type { PublicPackage } from '../../../components/publicPackage';
import type { PublicTenantInfo } from '../../page';
import { parsePackageId } from '../../../lib/packageId';

export const dynamic = 'force-dynamic';

const getBackendBaseUrl = (): string => {
  return process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://localhost:8080';
};

async function getPackageDetail(host: string, id: number): Promise<PublicPackage | null> {
  const backendUrl = getBackendBaseUrl();
  try {
    const res = await backendFetch(`${backendUrl}/api/public/packages/${id}`, {
      headers: {
        Host: host,
        'X-Forwarded-Host': host,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('Failed to fetch package detail:', err);
    return null;
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

    return await res.json();
  } catch (err) {
    console.error('Failed to fetch tenant info:', err);
    return 'down';
  }
}

import { SuspendedView } from '../../../components/SuspendedView';
import { SiteUnavailableView } from '../../../components/SiteUnavailableView';

// Package pages get their own title, description, canonical and OG tags; without this they inherit the
// home page's canonical/OG url from the root layout. Robots (noindex for the demo travel) is left unset
// here so the layout's value still applies.
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const headerList = await headers();
  // Same host the page body uses for its (no-store) fetches.
  const host = headerList.get('host') || 'travela.klikumroh.local';
  const publicHost = headerList.get('x-forwarded-host') || headerList.get('host') || '';
  const id = parsePackageId((await params).id);
  if (id === null) {
    return {};
  }

  const [pkg, tenantInfo] = await Promise.all([getPackageDetail(host, id), getTenantInfo(host)]);
  if (!pkg || !tenantInfo || tenantInfo === 'down' || tenantInfo.is_suspended) {
    return {};
  }

  const origin = publicHost ? `https://${publicHost}` : '';
  // Normalized number: /paket/007 and /paket/7 share one canonical.
  const canonicalUrl = `${origin}/paket/${id}`;
  const title = `${pkg.name} | ${tenantInfo.name}`;
  const plainDescription = (pkg.description || '').replace(/\s+/g, ' ').trim();
  const description = plainDescription
    ? (plainDescription.length > 155 ? `${plainDescription.slice(0, 155)}...` : plainDescription)
    : `${pkg.name} dari ${tenantInfo.name}. Lihat harga, jadwal keberangkatan, dan fasilitas paket umroh.`;

  // Same first photo the detail page shows (API order).
  const firstPhoto = pkg.photos && pkg.photos.length > 0 ? pkg.photos[0].file_path : '';
  const imageUrl = firstPhoto
    ? (firstPhoto.startsWith('http') ? firstPhoto : `${origin}${firstPhoto}`)
    : undefined;
  // No package photo: keep the travel's share image from the root layout.
  const parentMeta = imageUrl ? null : await parent;

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
      images: imageUrl ? [{ url: imageUrl, alt: pkg.name }] : parentMeta?.openGraph?.images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: imageUrl ? [imageUrl] : parentMeta?.twitter?.images,
    },
  };
}

export default async function PackageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const headerList = await headers();
  const host = headerList.get('host') || 'travela.klikumroh.local';

  // Only a positive whole number may go into the backend URL (route params arrive decoded).
  const id = parsePackageId((await params).id);
  if (id === null) {
    notFound();
  }

  const [pkg, tenantInfo] = await Promise.all([
    getPackageDetail(host, id),
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

  if (!pkg) {
    notFound();
  }

  return (
    <PackageDetailClientView pkg={pkg} tenantInfo={tenantInfo} />
  );
}
