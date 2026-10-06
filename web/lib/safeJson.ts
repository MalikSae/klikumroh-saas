// Reading API responses that may not be JSON: a gateway error (Caddy 502/504 HTML page) or an empty body
// must never surface as "Unexpected token '<' ..." to the visitor.

/** The parsed JSON body, or null when the body is empty or not JSON. Never throws. */
export async function readJsonSafe<T = Record<string, unknown>>(res: { json: () => Promise<unknown> }): Promise<T | null> {
  try {
    const data = await res.json();
    return data && typeof data === 'object' ? (data as T) : null;
  } catch {
    return null;
  }
}

export const GATEWAY_ERROR_MESSAGE = 'Server sedang tidak bisa dihubungi. Silakan coba lagi beberapa saat lagi.';

/**
 * The message for a failed response: the API's own `error` text when there is one, a "server unreachable"
 * text for gateway/timeout statuses without a JSON reason, otherwise the caller's fallback.
 */
export function apiErrorMessage(status: number, body: unknown, fallback: string): string {
  const err = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
  if (typeof err === 'string' && err.trim()) return err;
  if (status === 502 || status === 503 || status === 504) return GATEWAY_ERROR_MESSAGE;
  return fallback;
}
