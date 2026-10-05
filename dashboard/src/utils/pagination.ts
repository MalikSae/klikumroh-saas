// Page clamping for server-paginated lists. After rows leave the current filter (status changed, deleted)
// or a stale ?page= link is opened, the requested page can lie past the last page: the server then returns
// no rows but a non-zero total. The list must move back to the last page that still has rows.

/** Last page number for this total (at least 1). */
export const lastPage = (total: number, pageSize: number): number =>
  Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));

/** The page to show instead of `page`, or null when `page` is valid. */
export const clampedPage = (page: number, total: number, pageSize: number): number | null => {
  const last = lastPage(total, pageSize);
  if (!Number.isFinite(page) || page < 1) return 1;
  return page > last ? last : null;
};
