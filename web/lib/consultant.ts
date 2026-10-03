'use client';

// The visitor's consultant: the agent whose referral link brought them here (called "konsultan" on public
// pages). The code comes from ?ref= (set by /ref/[code]) or the ref_code cookie that route stores for 30
// days, so the consultant stays on every page of the visit and on later visits. The interest form already
// sends the prospect and its WhatsApp redirect to this agent; this hook lets pages show who they are and
// offer to ask them through that form (the public site has no direct WhatsApp button). Null when there is
// no code or it is not an active agent of this travel.
import { useEffect, useState } from 'react';

export interface Consultant {
  name: string;
  photo_url: string | null;
  referral_code: string;
}

const CACHE_KEY = 'klikumroh_consultant';

const refCode = (): string => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('ref');
    if (fromUrl && fromUrl.trim()) return fromUrl.trim();
    const m = document.cookie.match(/(?:^|;\s*)ref_code=([^;]+)/);
    return m ? decodeURIComponent(m[1]).trim() : '';
  } catch {
    return '';
  }
};

const readCache = (code: string): Consultant | null | undefined => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const c = JSON.parse(raw) as { code: string; data: Consultant | null };
    return c.code === code ? c.data : undefined;
  } catch {
    return undefined;
  }
};

const writeCache = (code: string, data: Consultant | null) => {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ code, data }));
  } catch {}
};

export const useConsultant = (): Consultant | null => {
  const [consultant, setConsultant] = useState<Consultant | null>(null);
  useEffect(() => {
    const code = refCode();
    if (!code) return;
    let alive = true;
    const cached = readCache(code);
    if (cached !== undefined) {
      // Cached for this tab session: no request on every page.
      Promise.resolve().then(() => {
        if (alive) setConsultant(cached);
      });
      return () => {
        alive = false;
      };
    }
    fetch(`/api/public/consultant?ref=${encodeURIComponent(code)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Consultant | null) => {
        const c = data && data.name ? data : null;
        writeCache(code, c);
        if (alive) setConsultant(c);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return consultant;
};
