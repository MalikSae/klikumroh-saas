'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchPlatformSettings, type PlatformSettings } from '../lib/api';

const DEFAULT_SETTINGS: PlatformSettings = {
  whatsapp_number: '6281234567890',
  bank_name: 'Bank Syariah Indonesia (BSI)',
  bank_account_number: '7123456789',
  bank_account_holder: 'PT Klik Umroh Digital',
};

const DEFAULT_PREFILLED_MESSAGE = 'Halo, saya tertarik dengan KlikUmroh untuk travel saya.';

interface PlatformSettingsContextType {
  settings: PlatformSettings;
  whatsappDemoUrl: string;
  loading: boolean;
}

const PlatformSettingsContext = createContext<PlatformSettingsContextType>({
  settings: DEFAULT_SETTINGS,
  whatsappDemoUrl: `https://wa.me/${DEFAULT_SETTINGS.whatsapp_number}?text=${encodeURIComponent(DEFAULT_PREFILLED_MESSAGE)}`,
  loading: true,
});

export const PlatformSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    fetchPlatformSettings()
      .then((data) => {
        if (mounted) {
          setSettings(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const whatsappDemoUrl = `https://wa.me/${settings.whatsapp_number}?text=${encodeURIComponent(DEFAULT_PREFILLED_MESSAGE)}`;

  return (
    <PlatformSettingsContext.Provider value={{ settings, whatsappDemoUrl, loading }}>
      {children}
    </PlatformSettingsContext.Provider>
  );
};

export const usePlatformSettings = (): PlatformSettingsContextType => {
  return useContext(PlatformSettingsContext);
};
