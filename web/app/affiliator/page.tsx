import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AffiliatorProgramView, type AffiliatorProgram } from '../../components/marketing-v3/AffiliatorProgramView';

// Affiliator KlikUmroh: how the program works and its terms, read before the signup form (platform host
// only, see proxy.ts). The numbers come from the program settings set by staff.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Program Affiliator KlikUmroh',
  description: 'Ajak travel umroh berlangganan KlikUmroh dan dapatkan komisi dari pembayaran pertama dan setiap perpanjangannya.',
  alternates: { canonical: 'https://klikumroh.id/affiliator' },
};

const backendUrl = () => process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://localhost:8080';

async function getProgram(): Promise<AffiliatorProgram | null> {
  try {
    const res = await fetch(`${backendUrl()}/api/public/affiliator-program`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as AffiliatorProgram) : null;
  } catch {
    return null;
  }
}

export default async function AffiliatorPage() {
  const host = ((await headers()).get('x-forwarded-host') || (await headers()).get('host') || '').split(':')[0].toLowerCase();
  const local = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  // The signup form lives in the dashboard app (app.klikumroh.id; localhost:5175 in local dev).
  const signupUrl = `${local ? 'http://localhost:5175' : 'https://app.klikumroh.id'}/affiliator/daftar`;
  const loginUrl = `${local ? 'http://localhost:5175' : 'https://app.klikumroh.id'}/affiliator/login`;
  return <AffiliatorProgramView program={await getProgram()} signupUrl={signupUrl} loginUrl={loginUrl} />;
}
