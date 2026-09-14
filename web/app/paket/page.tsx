import React from 'react';
import { headers } from 'next/headers';
import { PaketClientView } from '../../components/PaketClientView';
import type { PublicPackage } from '../../components/PublicCatalog';

export const dynamic = 'force-dynamic';

import type { PublicTenantInfo } from '../page';
export type { PublicTenantInfo };

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

import { SuspendedView } from '../../components/SuspendedView';

export default async function PaketPage() {
  const headerList = await headers();
  const host = headerList.get('host') || 'travela.klikumroh.local';

  const [packages, tenantInfo] = await Promise.all([
    getPublishedPackages(host),
    getTenantInfo(host),
  ]);

  if (tenantInfo?.is_suspended) {
    return <SuspendedView tenantInfo={tenantInfo} />;
  }

  return (
    <PaketClientView packages={packages} tenantInfo={tenantInfo} />
  );
}
