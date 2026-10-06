// Ad link builder for "Iklan & pelacakan". Pure so it can be tested without React.

/** Platforms whose ads get Meta's URL parameters (utm_source={{site_source_name}} etc.). */
export const isMetaPlatform = (source: string): boolean => source === 'facebook' || source === 'instagram';

/**
 * Builds the landing URL with UTM parameters. For a Meta platform utm_source is left out: Meta's URL
 * parameters add utm_source={{site_source_name}} (fb, ig, ...), so the real placement is recorded.
 * utm_medium and utm_campaign stay; when Meta appends its own copies the website keeps the last value,
 * so Meta's values win.
 */
export const buildAdLink = (site: string, page: string, source: string, campaignSlug: string): string => {
  if (!site) return '';
  const base = page === 'home' ? site + '/' : `${site}/paket/${page}`;
  const q = new URLSearchParams();
  if (!isMetaPlatform(source)) q.set('utm_source', source);
  q.set('utm_medium', 'paid');
  if (campaignSlug) q.set('utm_campaign', campaignSlug);
  return `${base}?${q.toString()}`;
};
