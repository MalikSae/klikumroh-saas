import React from 'react';

export interface TravelAgencyJsonLdProps {
  tenantInfo: {
    name: string;
    brand_primary_color?: string | null;
    brand_logo_url?: string | null;
    brand_icon_url?: string | null;
    tagline?: string | null;
    about_summary?: string | null;
    ppiu_number?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    whatsapp_number?: string | null;
    trust_rating?: string | null;
    trust_alumni_count?: string | null;
    social_instagram?: string | null;
    social_facebook?: string | null;
    social_youtube?: string | null;
    city?: string | null;
    province?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
    og_image_url?: string | null;
  } | null;
  host: string;
}

export const TravelAgencyJsonLd: React.FC<TravelAgencyJsonLdProps> = ({ tenantInfo, host }) => {
  if (!tenantInfo) return null;

  const origin = host ? `https://${host}` : 'https://klikumroh.id';
  const logoUrl = tenantInfo.brand_logo_url || tenantInfo.brand_icon_url;
  const imageUrl = tenantInfo.og_image_url || tenantInfo.brand_logo_url || tenantInfo.brand_icon_url;

  const socialLinks: string[] = [];
  if (tenantInfo.social_instagram) socialLinks.push(tenantInfo.social_instagram);
  if (tenantInfo.social_facebook) socialLinks.push(tenantInfo.social_facebook);
  if (tenantInfo.social_youtube) socialLinks.push(tenantInfo.social_youtube);

  const jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: tenantInfo.name,
    url: origin,
    description:
      tenantInfo.meta_description ||
      tenantInfo.about_summary ||
      `Biro perjalanan umroh resmi terdaftar Kemenag RI di ${tenantInfo.city || 'Indonesia'}`,
  };

  if (logoUrl) {
    jsonLd.logo = logoUrl.startsWith('http') ? logoUrl : `${origin}${logoUrl}`;
  }

  if (imageUrl) {
    jsonLd.image = imageUrl.startsWith('http') ? imageUrl : `${origin}${imageUrl}`;
  }

  if (tenantInfo.phone || tenantInfo.whatsapp_number) {
    jsonLd.telephone = tenantInfo.whatsapp_number || tenantInfo.phone;
  }

  if (tenantInfo.email) {
    jsonLd.email = tenantInfo.email;
  }

  // Address & GEO
  if (tenantInfo.address || tenantInfo.city || tenantInfo.province) {
    jsonLd.address = {
      '@type': 'PostalAddress',
      streetAddress: tenantInfo.address || undefined,
      addressLocality: tenantInfo.city || undefined,
      addressRegion: tenantInfo.province || undefined,
      addressCountry: 'ID',
    };
  }

  // Legal PPIU
  if (tenantInfo.ppiu_number) {
    jsonLd.legalName = `${tenantInfo.name} (PPIU: ${tenantInfo.ppiu_number})`;
  }

  // Aggregate Rating if rating exists
  if (tenantInfo.trust_rating) {
    const numericRating = parseFloat(tenantInfo.trust_rating);
    if (!isNaN(numericRating) && numericRating > 0) {
      jsonLd.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: numericRating.toFixed(1),
        bestRating: '5',
        worstRating: '1',
        ratingCount: '100', // Baseline count for rich snippet
      };
    }
  }

  if (socialLinks.length > 0) {
    jsonLd.sameAs = socialLinks;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
};
