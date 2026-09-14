'use client';

import React from 'react';
import { Button } from './Button';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent } from '../content/landing';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import './sections.css';

export const Section02Hero: React.FC = () => {
  const { whatsappDemoUrl } = usePlatformSettings();
  const data = landingContent.section02Hero;

  return (
    <section className="mkt-hero">
      <div className="mkt-container">
        <div className="mkt-hero__content">
          <span className="mkt-eyebrow">{data.eyebrow}</span>
          <h1 className="mkt-hero__headline">{data.headline}</h1>
          <p className="mkt-hero__subheadline">{data.subheadline}</p>

          <div className="mkt-hero__actions">
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
              href="#cara-kerja"
            >
              {data.ctaSecondary}
            </Button>
          </div>

          <p className="mkt-hero__microcopy">{data.microcopy}</p>
        </div>

        <div className="mkt-hero__visual">
          <ImagePlaceholder
            description={data.imagePlaceholder}
            minHeight={320}
            dark
          />
        </div>
      </div>
    </section>
  );
};
