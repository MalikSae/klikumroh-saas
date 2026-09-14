import React from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PackageDetailClientView } from '../../../components/PackageDetailClientView';
import type { PublicPackage } from '../../../components/PublicCatalog';
import type { PublicTenantInfo } from '../../page';

export const dynamic = 'force-dynamic';

const getBackendBaseUrl = (): string => {
  return process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://localhost:8080';
};

async function getPackageDetail(host: string, id: string): Promise<PublicPackage | null> {
  const backendUrl = getBackendBaseUrl();
  try {
    const res = await fetch(`${backendUrl}/api/public/packages/${id}`, {
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

    return await res.json();
  } catch (err) {
    console.error('Failed to fetch tenant info:', err);
    return null;
  }
}

import { SuspendedView } from '../../../components/SuspendedView';

export default async function PackageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const headerList = await headers();
  const host = headerList.get('host') || 'travela.klikumroh.local';
  
  const { id } = await params;

  const [pkg, tenantInfo] = await Promise.all([
    getPackageDetail(host, id),
    getTenantInfo(host),
  ]);

  if (tenantInfo?.is_suspended) {
    return <SuspendedView tenantInfo={tenantInfo} />;
  }

  if (!pkg) {
    notFound();
  }

  return (
    <PackageDetailClientView pkg={pkg} tenantInfo={tenantInfo} />
  );
}
