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
