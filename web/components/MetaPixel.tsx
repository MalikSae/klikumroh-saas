'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { ensureFbqStub, flushPendingMetaEvents } from '../lib/metaPixel';

// Pages that are not part of the jamaah-facing site: the agent portal and login pages must not feed
// the travel's ad audiences.
const EXCLUDED_PREFIXES = ['/agen', '/login'];

// A pixel is initialised once per page load; later client-side navigations only send PageView.
const initialisedPixels = new Set<string>();

/** Loads the travel's Meta Pixel and sends PageView on every public page view. */
export function MetaPixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname() || '/';
  const excluded = EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (excluded) return;
    ensureFbqStub();
    const fbq = window.fbq;
    if (!fbq) return;
    if (!initialisedPixels.has(pixelId)) {
      fbq('init', pixelId);
      initialisedPixels.add(pixelId);
    }
    fbq('track', 'PageView');
    flushPendingMetaEvents();
  }, [pixelId, pathname, excluded]);

  if (excluded) return null;
  return <Script id="meta-pixel" src="https://connect.facebook.net/en_US/fbevents.js" strategy="afterInteractive" />;
}
