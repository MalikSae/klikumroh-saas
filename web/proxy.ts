import { NextResponse } from 'next/server.js';
import type { NextRequest } from 'next/server.js';

const getBackendBaseUrl = (): string => {
  return process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://127.0.0.1:8080';
};

// Hosts that serve KlikUmroh itself (same list as the marketing check in app/page.tsx).
const PLATFORM_HOSTS = new Set(['klikumroh.id', 'www.klikumroh.id', 'klikumroh.local', 'localhost', '127.0.0.1']);
const PLATFORM_ONLY_PATHS = ['/login', '/checkout', '/marketing', '/affiliator'];

// Where platform pages live. Unset in development: the dev server would turn a redirect to its own
// origin (localhost:3000) into a relative one and loop on the travel host, so dev answers 404 instead.
const getPlatformOrigin = (): string | null =>
  process.env.PLATFORM_ORIGIN || (process.env.NODE_ENV === 'production' ? 'https://klikumroh.id' : null);

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

// Affiliator KlikUmroh link (klikumroh.id/?aff=CODE), platform hosts only: remember the affiliator for
// 60 days (last link wins) so the checkout can send it with the signup. An affiliator coupon entered at
// checkout still wins over this link (decided by the backend). Separate from the agent ?ref= above.
const AFFILIATOR_COOKIE = 'ku_aff';
const AFFILIATOR_CODE_PATTERN = /^[A-Za-z0-9]{4,20}$/;

async function withAffiliator(req: NextRequest, res: NextResponse): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get('aff');
  if (!raw || !AFFILIATOR_CODE_PATTERN.test(raw)) {
    return res;
  }
  const code = raw.toUpperCase();
  // Count a click once per browser and code, not on every reload of a page that still has ?aff=.
  if (req.cookies.get(AFFILIATOR_COOKIE)?.value !== code) {
    try {
      const forwardedFor = req.headers.get('x-forwarded-for');
      await fetch(`${getBackendBaseUrl()}/api/public/affiliator-clicks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}) },
        body: JSON.stringify({ code }),
        cache: 'no-store',
        signal: AbortSignal.timeout(1500),
      });
    } catch {
      // Click logging is best-effort: never block or break the page.
    }
  }
  res.cookies.set(AFFILIATOR_COOKIE, code, {
    maxAge: 60 * 60 * 24 * 60,
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
  });
  return res;
}

/**
 * Next.js Proxy for travel host redirection (307, temporary).
 *
 * Rules:
 * 1. If incoming Host is a default subdomain ({slug}.klikumroh.id or .local for dev)
 *    AND the tenant has an active custom domain:
 *    307 redirect to https://{custom_domain}{path}{query}.
 *    FULL path and query string MUST be preserved (critical for referral tracking).
 * 2. If incoming Host is an alias custom domain (namatravel.com) whose primary (www.namatravel.com) is
 *    active and healthy: 307 redirect to https://{primary}{path}{query}, same rule as 1.
 * 3. If custom domain is pending, failed, or none exists:
 *    DO NOT redirect. Subdomain (or alias) remains normally accessible.
 */
export async function proxy(req: NextRequest) {
  const hostHeader = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  const hostname = hostHeader.split(':')[0].trim().toLowerCase();

  // KlikUmroh's own pages (travel admin login, platform sign-up/checkout, marketing) live only on the
  // platform host, never on a travel's subdomain or custom domain (AGENTS.md 3.5, whitelabel).
  const pathname = req.nextUrl.pathname;
  const isPlatformOnlyPath = PLATFORM_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (isPlatformOnlyPath && !PLATFORM_HOSTS.has(hostname)) {
    const origin = getPlatformOrigin();
    return origin
      ? NextResponse.redirect(`${origin}${pathname}${req.nextUrl.search}`, 307)
      : new NextResponse(null, { status: 404 });
  }
  // Check if current hostname is a default subdomain
  const isDefaultSubdomain =
    (hostname.endsWith('.klikumroh.id') && hostname !== 'klikumroh.id' && hostname !== 'cname.klikumroh.id') ||
    (hostname.endsWith('.klikumroh.local') && hostname !== 'klikumroh.local') ||
    hostname.endsWith('.localhost');

  // Platform hosts never redirect. Default subdomains and custom domains ask the backend: a subdomain goes
  // to the travel's primary custom domain, an alias to its primary, a primary stays where it is.
  if (PLATFORM_HOSTS.has(hostname)) {
    return withAffiliator(req, withReferral(req, withAttribution(req, NextResponse.next())));
  }
  if (!isDefaultSubdomain && !hostname.includes('.')) {
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

          // Temporary redirect: a 301 is cached by browsers forever, so visitors and old referral links would
          // keep going to the custom domain even after it is removed or its DNS breaks.
          return NextResponse.redirect(redirectUrl, 307);
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
