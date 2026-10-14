// Ad context sent with the travel signup (POST /api/public/tenant-signup, field ad_context), so the server
// can report the signup to KlikUmroh's own Meta Pixel (Conversions API) matched to the same visitor.
// Everything here is optional and untrusted: the backend validates it again and drops invalid values.

export interface SignupAdContext {
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  event_source_url?: string;
}

const CONTEXT_ATTRIBUTION_KEYS = ['fbclid', 'utm_source', 'utm_medium', 'utm_campaign'] as const;

/**
 * Builds the signup ad context from the Meta cookies (see getMetaBrowserContext in metaPixel.ts) and the ad
 * parameters of the visit (readAttribution in adAttribution.ts: URL first, then the ku_attr cookie set by
 * proxy.ts). Returns undefined when the visitor did not come with any ad data, so organic signups send no
 * ad_context at all.
 */
export function buildSignupAdContext(
  attribution: Record<string, string> | null,
  meta: { fbp: string; fbc: string; event_source_url: string },
): SignupAdContext | undefined {
  const ctx: SignupAdContext = {};
  if (meta.fbp) ctx.fbp = meta.fbp;
  if (meta.fbc) ctx.fbc = meta.fbc;
  if (meta.event_source_url) ctx.event_source_url = meta.event_source_url;

  if (attribution) {
    for (const key of CONTEXT_ATTRIBUTION_KEYS) {
      if (attribution[key]) ctx[key] = attribution[key];
    }
  }
  // The page URL alone is not ad data.
  const hasAdData = Boolean(ctx.fbp || ctx.fbc || ctx.fbclid || ctx.utm_source || ctx.utm_medium || ctx.utm_campaign);
  return hasAdData ? ctx : undefined;
}
