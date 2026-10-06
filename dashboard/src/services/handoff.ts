// Pure helpers for the cross-origin auth handoff redeemed in main.tsx (#handoff={code, redirect, source}).
// Kept free of DOM and storage access so it can be tested in node.

/** 'staff' = opened from the staff panel (impersonation); 'login' = normal travel admin login. */
export type HandoffKind = 'staff' | 'login';

export interface HandoffPayload {
  code: string | null;
  /** Same-origin absolute path to land on; '/' when missing or unsafe. */
  redirect: string;
  kind: HandoffKind;
}

/**
 * Reads the #handoff= fragment. Returns null when the URL carries no handoff at all, and a payload with
 * code null when the fragment is malformed (that still counts as a failed handoff).
 */
export const parseHandoffHash = (hash: string): HandoffPayload | null => {
  if (!hash.startsWith('#handoff=')) return null;
  const empty: HandoffPayload = { code: null, redirect: '/', kind: 'login' };
  let payload: unknown;
  try {
    payload = JSON.parse(decodeURIComponent(hash.slice('#handoff='.length)));
  } catch {
    return empty;
  }
  if (!payload || typeof payload !== 'object') return empty;
  const p = payload as Record<string, unknown>;
  // Only same-origin absolute paths, so the payload can't send the user to another site.
  const redirect = typeof p.redirect === 'string' && /^\/(?![/\\])/.test(p.redirect) ? p.redirect : '/';
  const code = typeof p.code === 'string' && p.code ? p.code : null;
  return { code, redirect, kind: p.source === 'staff' ? 'staff' : 'login' };
};

/** Per-tab (sessionStorage) marker of a failed handoff, so a reload of that tab doesn't fall back to an older session. */
export const HANDOFF_FAILED_KEY = 'klikumroh_handoff_failed';

export const toHandoffKind = (v: string | null): HandoffKind | null => (v === 'staff' || v === 'login' ? v : null);

export const handoffFailedText = (kind: HandoffKind): { title: string; description: string } =>
  kind === 'staff'
    ? {
        title: 'Sesi impersonasi gagal dibuka',
        description: 'Sesi impersonasi gagal dibuka, coba lagi dari panel staf. Tab ini tidak memakai sesi lama agar Anda tidak membuka travel yang salah.',
      }
    : {
        title: 'Sesi gagal dibuka',
        description: 'Kode masuk sudah kedaluwarsa atau tidak valid. Silakan masuk lagi.',
      };
