// Remembers the prospect list's filters/page (as a query string) so "Kembali" from a prospect's
// detail returns to the same filtered page instead of the unfiltered first page.
// sessionStorage can be unavailable (private mode, blocked storage): then it simply falls back to /prospects.
const STORAGE_KEY = 'prospects:list-query';

export const rememberProspectListQuery = (query: string): void => {
  try {
    sessionStorage.setItem(STORAGE_KEY, query);
  } catch {
    // storage unavailable: nothing to remember
  }
};

export const prospectListPath = (): string => {
  try {
    const query = sessionStorage.getItem(STORAGE_KEY);
    return query ? `/prospects?${query}` : '/prospects';
  } catch {
    return '/prospects';
  }
};

/** Filters and paging of the prospect list as kept in the URL (the search box is synced separately). */
export interface ProspectListState {
  status: string;
  source: string;
  pkg: string;
  agent: string;
  payoff: string;
  departure: string;
  page: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 25;

/** Reads the list state from the URL; missing or invalid values fall back to the defaults. */
export const prospectListStateFromParams = (params: URLSearchParams, pageSizes: number[]): ProspectListState => {
  const get = (k: string, d: string) => params.get(k) || d;
  const size = Number(get('size', String(DEFAULT_PAGE_SIZE)));
  return {
    status: get('status', 'all'),
    source: get('source', 'all'),
    pkg: get('package', 'all'),
    agent: get('agent', 'all'),
    payoff: get('payoff', 'all'),
    departure: get('departure', 'all'),
    page: Math.max(1, Math.floor(Number(get('page', '1'))) || 1),
    pageSize: pageSizes.includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
};

export const sameProspectListState = (a: ProspectListState, b: ProspectListState): boolean =>
  a.status === b.status &&
  a.source === b.source &&
  a.pkg === b.pkg &&
  a.agent === b.agent &&
  a.payoff === b.payoff &&
  a.departure === b.departure &&
  a.page === b.page &&
  a.pageSize === b.pageSize;

/**
 * "Rencana berangkat" filter options: the upcoming months plus any other "YYYY-MM" month that the data or
 * the current selection uses (past plans are kept on purpose), in calendar order.
 */
export const withExtraDepartureMonths = (
  upcoming: Array<{ value: string; label: string }>,
  extra: Array<string | null | undefined>,
  label: (month: string) => string,
): Array<{ value: string; label: string }> => {
  const seen = new Set(upcoming.map((o) => o.value));
  const out = [...upcoming];
  for (const m of extra) {
    if (!m || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || seen.has(m)) continue;
    seen.add(m);
    out.push({ value: m, label: label(m) });
  }
  return out.sort((a, b) => a.value.localeCompare(b.value));
};
