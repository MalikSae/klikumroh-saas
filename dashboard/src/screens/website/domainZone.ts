// Pure hostname helpers for the Domain screen (kept out of the .tsx so node tests can import them).

/** Indonesian second-level names under .id: a domain registered there has three labels (namatravel.co.id). */
const ID_SECOND_LEVEL = /\.(co|or|ac|go|web|my|sch|net|biz|ponpes|desa)\.id$/;
const ID_SECOND_LEVEL_BARE = /^(co|or|ac|go|web|my|sch|net|biz|ponpes|desa)\.id$/;

/** Registrable domain of a hostname: namatravel.com, or namatravel.co.id for Indonesian second-level names. */
export const zoneOf = (host: string): string => {
  const parts = host.split('.');
  const n = ID_SECOND_LEVEL.test(host) ? 3 : 2;
  return parts.slice(-n).join('.');
};

/** A root domain (namatravel.com) cannot have a CNAME; it needs A records. www.namatravel.com can. */
export const isRoot = (host: string): boolean => zoneOf(host) === host;

/** What to type in the "Host" field of most DNS panels, which append the domain themselves. */
export const hostField = (name: string, zone: string): string =>
  name === zone ? '@' : name.endsWith('.' + zone) ? name.slice(0, -(zone.length + 1)) : name;

/** The www / non-www pair for a typed host, or null when the host is neither (e.g. umroh.namatravel.com). */
export const pairOf = (host: string): { primary: string; alias: string } | null => {
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host)) return null;
  // A bare suffix such as co.id is not a domain a travel can own.
  if (ID_SECOND_LEVEL_BARE.test(host)) return null;
  if (isRoot(host)) return { primary: 'www.' + host, alias: host };
  if (host.startsWith('www.') && isRoot(host.slice(4))) return { primary: host, alias: host.slice(4) };
  return null;
};
