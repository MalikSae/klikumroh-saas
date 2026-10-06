'use client';

import { useCallback, useEffect, useState } from 'react';

// Global KlikUmroh settings managed from the super admin (Pengaturan). Empty strings mean the owner has not
// filled the value yet: callers must hide the related UI instead of falling back to placeholder data.
export interface PlatformSettings {
  whatsapp_number: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
  terms_url: string;
  privacy_url: string;
}

const EMPTY_SETTINGS: PlatformSettings = {
  whatsapp_number: '',
  bank_name: '',
  bank_account_number: '',
  bank_account_holder: '',
  terms_url: '',
  privacy_url: '',
};

// One request per page load, shared by every component that uses the hook. Only a successful answer is
// kept: a failed request (5xx, gateway page, network drop) resolves to null and clears the cache, so it is
// never mistaken for "the owner has not filled the settings" and the next attempt asks the API again.
let settingsRequest: Promise<PlatformSettings | null> | null = null;

// Exported for test/bh5-web-fixes.test.mjs.
export function loadPlatformSettings(): Promise<PlatformSettings | null> {
  if (!settingsRequest) {
    const request: Promise<PlatformSettings | null> = fetch('/api/public/platform-settings')
      .then(async (res) => {
        if (!res.ok) throw new Error(`platform-settings ${res.status}`);
        const data: unknown = await res.json();
        if (!data || typeof data !== 'object') throw new Error('platform-settings: not an object');
        return { ...EMPTY_SETTINGS, ...(data as Partial<PlatformSettings>) };
      })
      .catch(() => {
        if (settingsRequest === request) settingsRequest = null; // allow a retry
        return null;
      });
    settingsRequest = request;
  }
  return settingsRequest;
}

/**
 * loaded: the settings arrived. failed: the request failed (show "coba lagi" with retry(), never "not
 * filled yet"). Both are false while the request is in flight.
 */
export function usePlatformSettings(): {
  settings: PlatformSettings;
  loaded: boolean;
  failed: boolean;
  retry: () => void;
} {
  const [settings, setSettings] = useState<PlatformSettings>(EMPTY_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadPlatformSettings().then((data) => {
      if (!active) return;
      if (data) {
        setSettings(data);
        setLoaded(true);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { settings, loaded, failed, retry };
}

export function hasBankDetails(s: PlatformSettings): boolean {
  return Boolean(s.bank_name && s.bank_account_number && s.bank_account_holder);
}

export function hasLegalDocuments(s: PlatformSettings): boolean {
  return Boolean(s.terms_url && s.privacy_url);
}

/** Returns a wa.me link, or null when no number is configured (callers then hide the button). */
export function whatsappLink(number: string | null | undefined, text?: string): string | null {
  let clean = (number || '').replace(/[^0-9]/g, '');
  if (!clean) return null;
  if (clean.startsWith('0')) clean = '62' + clean.slice(1);
  return text ? `https://wa.me/${clean}?text=${encodeURIComponent(text)}` : `https://wa.me/${clean}`;
}
