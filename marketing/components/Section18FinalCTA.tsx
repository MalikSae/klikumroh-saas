'use client';

import React from 'react';
import { Button } from './Button';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent } from '../content/landing';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import './sections.css';

export const Section18FinalCTA: React.FC = () => {
  const { whatsappDemoUrl } = usePlatformSettings();
  const data = landingContent.section18FinalCTA;

  return (
    <section className="mkt-final-cta">
      <div className="mkt-container">
        <div style={{ maxWidth: '820px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
          <h2 className="mkt-headline">{data.headline}</h2>
          <p className="mkt-subheadline">{data.subheadline}</p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '14px',
              marginBottom: '16px',
            }}
          >
            <Button
              variant="primary"
              size="lg"
              asLink
              href={whatsappDemoUrl}
            >
              {data.ctaPrimary}
            </Button>
            <Button
              variant="outline-light"
              size="lg"
              asLink
              href="#fitur"
            >
              {data.ctaSecondary}
            </Button>
          </div>

          <p className="mkt-microcopy" style={{ color: 'var(--mkt-footer-text)' }}>
            {data.microcopy}
          </p>
        </div>

        <div style={{ marginTop: '48px', position: 'relative', zIndex: 1, opacity: 0.85 }}>
          <ImagePlaceholder description={data.imagePlaceholder} minHeight={180} dark />
        </div>
      </div>
    </section>
  );
};
