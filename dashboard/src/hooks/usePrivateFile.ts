import { useEffect, useState } from 'react';
import { API_BASE, getStoredToken } from '../services/api';
import { getStoredStaffToken } from '../services/staffApi';

/**
 * Transfer proofs are private: they are not served from /uploads but from an authenticated endpoint.
 * This hook downloads one (by the reference stored in the database, e.g. "/uploads/12/subscription-proofs/x.webp")
 * with the travel admin's or staff member's token and returns a temporary blob URL for <img>/<a>.
 */
export function usePrivateFileURL(ref: string | null | undefined, audience: 'dashboard' | 'staff' = 'dashboard') {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    setError(null);
    if (!ref) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    const token = audience === 'staff' ? getStoredStaffToken() : getStoredToken();
    fetch(`${API_BASE}/api/${audience}/files?path=${encodeURIComponent(ref)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Bukti transfer tidak dapat dimuat');
        objectUrl = URL.createObjectURL(await res.blob());
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setError(err?.message || 'Bukti transfer tidak dapat dimuat');
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ref, audience]);

  return { url, error };
}
