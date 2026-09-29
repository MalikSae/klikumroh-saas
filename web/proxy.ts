import { NextResponse } from 'next/server.js';
import type { NextRequest } from 'next/server.js';

const getBackendBaseUrl = (): string => {
  return process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://127.0.0.1:8080';
};

// Ad attribution: when a visitor lands from an ad (utm_* or Meta's fbclid in the URL), remember it for
// 7 days (Meta's default click window) so the prospect form can report the source even if the visitor
// browses other pages first. Last ad click wins. Read by components/ProspectModal.tsx.
const ATTRIBUTION_COOKIE = 'ku_attr';
const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid'] as const;

function withAttribution(req: NextRequest, res: NextResponse): NextResponse {
  const params = req.nextUrl.searchParams;
  if (!ATTRIBUTION_KEYS.some((k) => params.get(k))) {
    return res;
  }
  const attr: Record<string, string> = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = params.get(k);
    if (v) attr[k] = v.slice(0, 255);
  }
  res.cookies.set(ATTRIBUTION_COOKIE, JSON.stringify(attr), {
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
  });
  return res;
}

// Agent referral: a link with ?ref=CODE (not only /ref/CODE) remembers the agent for 30 days, so the
// referral is not lost when the visitor opens another page before filling in the form.
// Read by components/ProspectModal.tsx; the backend decides whether the code is valid.
const REFERRAL_COOKIE = 'ref_code';
const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

function withReferral(req: NextRequest, res: NextResponse): NextResponse {
  const code = req.nextUrl.searchParams.get('ref');
  if (!code || !REFERRAL_CODE_PATTERN.test(code)) {
    return res;
  }
  res.cookies.set(REFERRAL_COOKIE, code, {
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
  });
  return res;
}

/**
 * Next.js Proxy for Subdomain to Custom Domain 301 Redirection.
 *
 * Rules:
 * 1. If incoming Host is a default subdomain ({slug}.klikumroh.id or .local for dev)
 *    AND the tenant has an active custom domain:
 *    301 redirect to https://{custom_domain}{path}{query}.
 *    FULL path and query string MUST be preserved (critical for referral tracking).
 * 2. If custom domain is pending, failed, or none exists:
 *    DO NOT redirect. Subdomain remains normally accessible.
 */
export async function proxy(req: NextRequest) {
  const hostHeader = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  const hostname = hostHeader.split(':')[0].trim().toLowerCase();

  // Check if current hostname is a default subdomain
  const isDefaultSubdomain =
    (hostname.endsWith('.klikumroh.id') && hostname !== 'klikumroh.id' && hostname !== 'cname.klikumroh.id') ||
    (hostname.endsWith('.klikumroh.local') && hostname !== 'klikumroh.local') ||
    hostname.endsWith('.localhost');

  if (!isDefaultSubdomain) {
    return withReferral(req, withAttribution(req, NextResponse.next()));
  }

  const backendUrl = getBackendBaseUrl();

  try {
    const res = await fetch(`${backendUrl}/api/public/custom-domain-target?host=${encodeURIComponent(hostname)}`, {
      headers: {
        Host: hostname,
        'X-Forwarded-Host': hostname,
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.custom_domain === 'string' && data.custom_domain.trim() !== '') {
        const customDomain = data.custom_domain.trim().toLowerCase();

        // Ensure target custom domain is different from current hostname
        if (customDomain !== hostname) {
          // Construct redirect URL preserving full pathname and query search string
          const redirectUrl = req.nextUrl.clone();
          redirectUrl.hostname = customDomain;
          redirectUrl.protocol = 'https';
          redirectUrl.port = '';

          return NextResponse.redirect(redirectUrl, 301);
        }
      }
    }
  } catch (err) {
    // If backend is temporarily unreachable, fallback gracefully to normal subdomain handling
    console.error('Failed to query custom domain target:', err);
  }

  return withReferral(req, withAttribution(req, NextResponse.next()));
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - _next/static (static assets)
     * - _next/image (image optimization files)
     * - favicon.ico, images, uploads
     */
    '/((?!api|_next/static|_next/image|favicon.ico|uploads|images).*)',
  ],
};
