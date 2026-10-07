// Address of the travel's public website for the links the dashboard hands out (agent sign-up link, tracking
// links, "Lihat situs"). One rule for every place: the primary custom domain when it is active and healthy,
// otherwise the default subdomain (which redirects to the custom domain anyway, see web/proxy.ts).

/** A domain of the travel, as far as the link needs it (the dashboard's DomainItem fits). */
export interface DomainLike {
  hostname: string;
  type: 'subdomain' | 'custom';
  status: 'pending' | 'active' | 'failed';
  check_failures?: number;
  redirect_to_domain_id?: number | null;
}

/** After this many failed DNS checks the website stops redirecting to the custom domain (see web/proxy.ts). */
const REDIRECT_STOPS_AT_FAILURES = 3;

/**
 * The address visitors really end up on: the primary custom domain when it is active and healthy, otherwise
 * null (the caller uses the subdomain). An alias domain (redirect_to_domain_id set) is never the primary.
 */
export function primaryCustomHost(domains: DomainLike[]): string | null {
  const d = domains.find(
    (x) => x.type === 'custom' && x.status === 'active' && !x.redirect_to_domain_id && (x.check_failures ?? 0) < REDIRECT_STOPS_AT_FAILURES && x.hostname.trim() !== '',
  );
  return d ? d.hostname.trim().toLowerCase() : null;
}

/**
 * Base URL of the travel website, without a trailing slash. `customHost` comes from primaryCustomHost; on a
 * local development host it is ignored (a custom domain cannot be reached there).
 */
export function siteBaseUrl(slug: string | null | undefined, customHost: string | null | undefined, hostname: string): string | null {
  const local = ['localhost', '127.0.0.1'].includes(hostname);
  if (customHost && !local) return `https://${customHost}`;
  if (!slug) return null;
  return local ? `http://${slug}.localhost:3000` : `https://${slug}.klikumroh.id`;
}
