// Ad attribution sent with a prospect (lead). proxy.ts stores these keys in the ku_attr cookie when a
// visitor lands from an ad; the prospect form reads them back here. Keep proxy.ts ATTRIBUTION_KEYS in
// sync with this list (test/ad-attribution.test.mjs checks it).
//
// ad_id is Meta's ad id, filled by the dynamic URL parameter {{ad.id}} in the ad's "URL parameters".
// The backend counts a prospect as paid (Iklan) only when ad_id is present; fbclid or utm_medium alone
// no longer count.
export const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'ad_id'] as const;

export const ATTRIBUTION_COOKIE = 'ku_attr';

// An ad link can carry the same key twice: the travel's link builder adds utm_source/utm_campaign and Meta
// then appends its own "URL parameters" (utm_source={{site_source_name}}, ...). Founder decision: the LAST
// value wins (Meta appends its own). A value Meta left unfilled ("{{...}}") is ignored. Keep in sync with
// lastAttributionValue in proxy.ts (test/ad-attribution.test.mjs checks both).
const UNFILLED_PLACEHOLDER = /\{\{.*\}\}/;

export function lastAttributionValue(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key).filter((v) => v.trim() !== '' && !UNFILLED_PLACEHOLDER.test(v));
  const last = values.at(-1);
  return last === undefined ? null : last;
}

/**
 * Attribution for the prospect payload: the current URL's ad parameters win (the visitor just clicked an
 * ad); otherwise the ku_attr cookie set by proxy.ts within the attribution window. Returns null if none.
 */
export function readAttribution(search: string, cookieHeader: string): Record<string, string> | null {
  const params = new URLSearchParams(search);
  const fromUrl: Record<string, string> = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = lastAttributionValue(params, k);
    if (v) fromUrl[k] = v.slice(0, 255);
  }
  if (Object.keys(fromUrl).length > 0) return fromUrl;

  const match = cookieHeader.match(/(?:^|;\s*)ku_attr=([^;]+)/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(match[1]));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const k of ATTRIBUTION_KEYS) {
      const v = (parsed as Record<string, unknown>)[k];
      if (typeof v === 'string' && v) out[k] = v.slice(0, 255);
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}
