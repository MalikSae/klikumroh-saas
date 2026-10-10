'use client';

import { usePlatformSettings, whatsappLink } from '../../lib/usePlatformSettings';

// "WhatsApp atau email" for the marketing pages. The WhatsApp number is the CS number set in Pengaturan
// Global (never hardcoded here); without one only the email is shown.
export function SupportContact() {
  const { settings } = usePlatformSettings();
  const wa = whatsappLink(settings.whatsapp_number);
  return (
    <>
      {wa && (
        <>
          <a href={wa}>WhatsApp</a> atau{' '}
        </>
      )}
      <a href="mailto:support@klikumroh.id">support@klikumroh.id</a>
    </>
  );
}
