'use client';

import { useEffect, useState } from 'react';

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

// One request per page load, shared by every component that uses the hook.
let settingsRequest: Promise<PlatformSettings> | null = null;

function loadPlatformSettings(): Promise<PlatformSettings> {
  if (!settingsRequest) {
    settingsRequest = fetch('/api/public/platform-settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => ({ ...EMPTY_SETTINGS, ...(data || {}) }))
      .catch(() => {
        settingsRequest = null; // allow a retry on the next mount
        return EMPTY_SETTINGS;
      });
  }
  return settingsRequest;
}

export function usePlatformSettings(): { settings: PlatformSettings; loaded: boolean } {
  const [settings, setSettings] = useState<PlatformSettings>(EMPTY_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    loadPlatformSettings().then((data) => {
      if (active) {
        setSettings(data);
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return { settings, loaded };
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
