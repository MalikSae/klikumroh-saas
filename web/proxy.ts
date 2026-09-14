import { NextResponse } from 'next/server.js';
import type { NextRequest } from 'next/server.js';

const getBackendBaseUrl = (): string => {
  return process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://127.0.0.1:8080';
};

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
    return NextResponse.next();
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

  return NextResponse.next();
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
