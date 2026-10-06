// What the root layout may add around a travel's pages, from its public tenant info.
// A suspended travel (subscription past the grace period) shows no contact at all (founder decision):
// no structured data (it carries the phone, email and address), no Meta Pixel, and stays out of search.
// The made-up demo travel gets no structured data and is never indexed either.
export interface TravelSiteFlags {
  structuredData: boolean;
  metaPixel: boolean;
  noindex: boolean;
}

export function travelSiteFlags(
  tenantInfo: { is_demo?: boolean | null; is_suspended?: boolean | null } | null | undefined
): TravelSiteFlags {
  if (!tenantInfo) return { structuredData: false, metaPixel: false, noindex: false };
  const suspended = Boolean(tenantInfo.is_suspended);
  const demo = Boolean(tenantInfo.is_demo);
  return {
    structuredData: !suspended && !demo,
    metaPixel: !suspended,
    noindex: suspended || demo,
  };
}
