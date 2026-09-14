import type { Metadata } from 'next';
import { Nunito, Roboto } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import '../components/FormInput.css';
import { TravelAgencyJsonLd } from '../components/TravelAgencyJsonLd';

const nunito = Nunito({
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

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') || headerList.get('host') || '';
  const tenantInfo = await getTenantInfo(host);

  if (!tenantInfo) {
    return {
      title: 'KlikUmroh.id — Lipatgandakan Jumlah Jamaah & Jadikan Agen Mesin Closing Produktif',
      description:
        'Sistem akuisisi jamaah & aktivasi agen #1 untuk travel umroh: Script Chat WhatsApp Otomatis (TGJP), Peta 100+ Sumber Jamaah, Bank Caption Syiar, dan Website Whitelabel Resmi.',
    };
  }

  const title =
    tenantInfo.meta_title ||
    `${tenantInfo.name} — Paket Umroh Resmi ${tenantInfo.city || 'Indonesia'}${tenantInfo.ppiu_number ? ` (PPIU ${tenantInfo.ppiu_number})` : ''}`;

  const description =
    tenantInfo.meta_description ||
    (tenantInfo.about_summary
      ? (tenantInfo.about_summary.length > 155
          ? `${tenantInfo.about_summary.slice(0, 155)}...`
          : tenantInfo.about_summary)
      : `Biro perjalanan umroh resmi terdaftar di Kemenag RI dengan layanan bintang dan jadwal pasti di ${tenantInfo.city || 'Indonesia'}. Pilihan paket umroh terbaik.`);

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
  const brandPrimaryColor = tenantInfo?.brand_primary_color;

  const styleObj = brandPrimaryColor
    ? ({ '--tw-brand-primary': brandPrimaryColor } as React.CSSProperties)
    : undefined;

  const rawIcon = tenantInfo?.brand_icon_url || tenantInfo?.brand_logo_url;
  const iconUrl = rawIcon
    ? (rawIcon.startsWith('http') ? rawIcon : rawIcon)
    : '/favicon.ico';

  return (
    <html lang="id" className={`${nunito.variable} ${roboto.variable}`} style={styleObj}>
      <head>
        <link rel="icon" type="image/png" href={iconUrl} />
        <link rel="shortcut icon" href={iconUrl} />
        <link rel="apple-touch-icon" href={iconUrl} />
        <TravelAgencyJsonLd tenantInfo={tenantInfo} host={host} />
      </head>
      <body>{children}</body>
    </html>
  );
}
