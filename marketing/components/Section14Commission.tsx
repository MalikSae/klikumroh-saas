import React from 'react';
import { Card } from './Card';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent } from '../content/landing';
import './sections.css';

export const Section14Commission: React.FC = () => {
  const data = landingContent.section14Commission;

  return (
    <section className="mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <h2 className="mkt-headline">{data.headline}</h2>
          <p className="mkt-subheadline">{data.body}</p>
        </div>

        <div className="mkt-positioning-split" style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--mkt-text-primary)', marginBottom: '8px' }}>
                {data.agentViewSiapCair.title}
              </h3>
              <p style={{ fontSize: '15px', color: 'var(--mkt-text-secondary)', lineHeight: 1.6 }}>
                {data.agentViewSiapCair.desc}
              </p>
            </Card>

            <Card>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--mkt-text-primary)', marginBottom: '8px' }}>
                {data.agentViewTertunda.title}
              </h3>
              <p style={{ fontSize: '15px', color: 'var(--mkt-text-secondary)', lineHeight: 1.6 }}>
                {data.agentViewTertunda.desc}
              </p>
            </Card>
          </div>

          <div>
            <ImagePlaceholder description={data.imagePlaceholder} minHeight={240} />
          </div>
        </div>

        <p className="mkt-supporting-text">{data.supporting}</p>
      </div>
    </section>
  );
};
