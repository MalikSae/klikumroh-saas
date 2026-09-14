'use client';

import React from 'react';
import { Button } from './Button';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent } from '../content/landing';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import './sections.css';

export const Section06HowItWorks: React.FC = () => {
  const { whatsappDemoUrl } = usePlatformSettings();
  const data = landingContent.section06HowItWorks;

  return (
    <section id="cara-kerja" className="mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <h2 className="mkt-headline">{data.headline}</h2>
        </div>

        <div className="mkt-steps-grid">
          {data.steps.map((item) => (
            <div key={item.step} className="mkt-step-item">
              <h3 className="mkt-step-title">{item.step}</h3>
              <p className="mkt-step-desc">{item.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '32px' }}>
          <ImagePlaceholder description={data.imagePlaceholder} minHeight={220} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            variant="primary"
            size="lg"
            asLink
            href={whatsappDemoUrl}
          >
            {data.cta}
          </Button>
        </div>
      </div>
    </section>
  );
};
