// Target path + query for /ref/[code]. Every incoming query parameter (utm_*, fbclid, ad_id, ...)
// is kept so the landing page, the browser pixel (_fbc from fbclid) and event_source_url still
// see the campaign data. `to` is consumed (it chooses the landing page) and any incoming `ref`
// is replaced by the code, so the target carries exactly one ref.
export function buildRefRedirectPath(code: string, incoming: URLSearchParams): string {
  // Optional landing page: only a package detail on this same site (?to=/paket/123), never another host.
  const to = incoming.get('to') || '';
  const landing = /^\/paket\/\d+$/.test(to) ? to : '/';

  const params = new URLSearchParams();
  params.set('ref', code);
  for (const [key, value] of incoming) {
    if (key === 'to' || key === 'ref') continue;
    params.append(key, value);
  }
  return `${landing}?${params.toString()}`;
}
