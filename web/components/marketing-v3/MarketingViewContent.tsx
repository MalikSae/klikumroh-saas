'use client';

import { useEffect } from 'react';
import { trackMetaEvent } from '../../lib/metaPixel';

/** KlikUmroh's own Meta Pixel: the landing page was viewed (a no-op while no pixel is configured). */
export function MarketingViewContent() {
  useEffect(() => {
    trackMetaEvent('ViewContent', { content_name: 'Landing KlikUmroh', content_category: 'klikumroh_signup' });
  }, []);
  return null;
}
