import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Roboto } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import '../components/FormInput.css';
import { TravelAgencyJsonLd } from '../components/TravelAgencyJsonLd';
import { MetaPixel } from '../components/MetaPixel';
import { DemoRibbon } from '../components/DemoRibbon';
import { isPlatformHost } from '../lib/platformHost';
import { travelSiteFlags } from '../lib/travelSiteState';

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--tw-font-heading',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const roboto = Roboto({
  variable: '--tw-font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const getBackendBaseUrl = (): string => {
  return process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://localhost:8080';
};

async function getTenantInfo(host: string) {
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
    return null;
  }
}

// The travel's Meta Pixel ID (set in the dashboard), or '' when none. Never fails the page.
async function getMetaPixelId(host: string): Promise<string> {
  try {
    const res = await fetch(`${getBackendBaseUrl()}/api/public/meta-pixel`, {
      headers: { Host: host, 'X-Forwarded-Host': host },
      // Same host-dependent URL for every travel: never cache it across requests.
      cache: 'no-store',
    });
    if (!res.ok) return '';
    const data = await res.json();
    return typeof data?.pixel_id === 'string' && /^[0-9]{10,20}$/.test(data.pixel_id) ? data.pixel_id : '';
  } catch {
    return '';
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') || headerList.get('host') || '';
  const tenantInfo = await getTenantInfo(host);

  // A travel host with no active travel (unknown, not active yet, or the API failed): never KlikUmroh's own
  // title, canonical or favicon on a travel's domain (whitelabel), and keep the empty page out of search.
  if (!tenantInfo && !isPlatformHost(host)) {
    return {
      title: 'Situs belum tersedia',
      robots: { index: false, follow: false },
      icons: { icon: [{ url: 'data:,' }] },
    };
  }

  if (!tenantInfo) {
    return {
      title: 'KlikUmroh.id — Website, Dashboard Travel & Portal Agen',
      description:
        'Bantu agen membawa calon jamaah ke travel Anda. Kelola website travel, link referral, bahan promosi, prospek, dan komisi agen melalui KlikUmroh.',
      alternates: { canonical: 'https://klikumroh.id' },
      icons: {
        icon: [
          { url: '/icon-klikumroh.svg', type: 'image/svg+xml' },
          { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
          { url: '/favicon.ico', type: 'image/x-icon' },
        ],
        shortcut: ['/favicon.ico'],
        apple: [
          { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
    };
  }

  const title =
    tenantInfo.meta_title ||
    // "Resmi" and the licence number only when the travel entered its PPIU number.
    (tenantInfo.ppiu_number
      ? `${tenantInfo.name} — Paket Umroh Resmi ${tenantInfo.city || 'Indonesia'} (PPIU ${tenantInfo.ppiu_number})`
      : `${tenantInfo.name} — Paket Umroh ${tenantInfo.city || 'Indonesia'}`);

  const description =
    tenantInfo.meta_description ||
    (tenantInfo.about_summary
      ? (tenantInfo.about_summary.length > 155
          ? `${tenantInfo.about_summary.slice(0, 155)}...`
          : tenantInfo.about_summary)
      : `${tenantInfo.name}, biro perjalanan umroh di ${tenantInfo.city || 'Indonesia'}${tenantInfo.ppiu_number ? ` dengan izin PPIU ${tenantInfo.ppiu_number}` : ''}. Lihat paket umroh dan jadwal keberangkatan.`);

  const canonicalUrl = host ? `https://${host}` : 'https://klikumroh.id';

  const rawImageUrl = tenantInfo.og_image_url || tenantInfo.brand_logo_url || tenantInfo.brand_icon_url;
  const imageUrl = rawImageUrl
    ? (rawImageUrl.startsWith('http') ? rawImageUrl : `${canonicalUrl}${rawImageUrl}`)
    : undefined;

  const rawIconUrl = tenantInfo.brand_icon_url || tenantInfo.brand_logo_url;
  const iconUrl = rawIconUrl
    ? (rawIconUrl.startsWith('http') ? rawIconUrl : `${canonicalUrl}${rawIconUrl}`)
    : '/favicon.ico';

  const metadata: Metadata = {
    title,
    description,
    keywords: tenantInfo.meta_keywords ? tenantInfo.meta_keywords.split(',').map((s: string) => s.trim()) : undefined,
    alternates: {
      canonical: canonicalUrl,
    },
    icons: {
      icon: [
        {
          url: iconUrl,
          type: iconUrl.endsWith('.png') ? 'image/png' : 'image/x-icon',
        },
      ],
      shortcut: [iconUrl],
      apple: [
        {
          url: iconUrl,
          sizes: '180x180',
          type: 'image/png',
        },
      ],
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: tenantInfo.name,
      locale: 'id_ID',
      type: 'website',
      images: imageUrl
        ? [
            {
              url: imageUrl,
              width: 1200,
              height: 630,
              alt: title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
    // The demo travel is made up and a suspended travel shows only a notice: keep both out of search engines.
    // Pages that return no robots of their own (e.g. /paket while suspended returns {}) inherit this.
    robots: travelSiteFlags(tenantInfo).noindex ? { index: false, follow: false } : undefined,
    other: {
      ...(tenantInfo.city ? { 'geo.placename': tenantInfo.city } : {}),
      ...(tenantInfo.province ? { 'geo.region': tenantInfo.province } : {}),
    },
  };

  return metadata;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') || headerList.get('host') || '';
  const tenantInfo = await getTenantInfo(host);
  const siteFlags = travelSiteFlags(tenantInfo);
  // No Meta Pixel while the travel is suspended: the site only shows the suspended notice.
  const metaPixelId = siteFlags.metaPixel ? await getMetaPixelId(host) : '';
  const brandPrimaryColor = tenantInfo?.brand_primary_color;

  const styleObj = brandPrimaryColor
    ? ({ '--tw-brand-primary': brandPrimaryColor } as React.CSSProperties)
    : undefined;

  const rawIcon = tenantInfo?.brand_icon_url || tenantInfo?.brand_logo_url;
  const isCustomTenantIcon = Boolean(rawIcon);
  const tenantIconUrl = rawIcon
    ? (rawIcon.startsWith('http') ? rawIcon : rawIcon)
    : undefined;

  return (
    <html lang="id" className={`${plusJakartaSans.variable} ${roboto.variable}`} style={styleObj} suppressHydrationWarning>
      <head>
        {!tenantInfo && !isPlatformHost(host) ? null : isCustomTenantIcon ? (
          <>
            <link rel="icon" href={tenantIconUrl} />
            <link rel="shortcut icon" href={tenantIconUrl} />
            <link rel="apple-touch-icon" href={tenantIconUrl} />
          </>
        ) : (
          <>
            <link rel="icon" type="image/svg+xml" href="/icon-klikumroh.svg" />
            <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
            <link rel="shortcut icon" href="/favicon.ico" />
            <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          </>
        )}
        {/* No travel agency structured data (phone, email, address) for the made-up demo travel or a suspended travel. */}
        {siteFlags.structuredData && <TravelAgencyJsonLd tenantInfo={tenantInfo} host={host} />}
      </head>
      <body suppressHydrationWarning>
        {tenantInfo?.is_demo && <DemoRibbon host={host} />}
        {children}
        {metaPixelId && <MetaPixel pixelId={metaPixelId} />}
      </body>
    </html>
  );
}
