// Server-rendered calls to the Go API. A backend that accepts the connection but never answers (a DB lock,
// a stalled process) must not hang the page until Node's own fetch timeout: every call gives up after
// BACKEND_FETCH_TIMEOUT_MS and the caller's existing catch turns that into its fallback (the
// SiteUnavailableView "down" notice for tenant-info, an empty list for the other sections).
//
// The timeout races the request instead of passing an AbortSignal: Next.js skips request memoization for
// a fetch that carries a signal (docs: 04-functions/fetch.md "Memoization"), and the layout, metadata and
// page all ask for the same tenant-info within one render.
export const BACKEND_FETCH_TIMEOUT_MS = 4000;

export class BackendTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`backend did not answer within ${timeoutMs} ms: ${url}`);
    this.name = 'BackendTimeoutError';
  }
}

/** fetch() with a timeout. Rejects with BackendTimeoutError when the backend does not answer in time. */
export function backendFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = BACKEND_FETCH_TIMEOUT_MS,
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BackendTimeoutError(url, timeoutMs)), timeoutMs);
  });
  return Promise.race([fetch(url, init), timeout]).finally(() => clearTimeout(timer));
}
