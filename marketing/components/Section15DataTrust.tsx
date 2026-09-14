import React from 'react';
import { Card } from './Card';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent } from '../content/landing';
import './sections.css';

export const Section15DataTrust: React.FC = () => {
  const data = landingContent.section15DataTrust;

  return (
    <section className="mkt-section mkt-section--alt">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <h2 className="mkt-headline">{data.headline}</h2>
          <p className="mkt-subheadline">{data.body}</p>
        </div>

        <div className="mkt-grid-3" style={{ marginBottom: '32px' }}>
          {data.supportingPoints.map((point) => (
            <Card key={point}>
              <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--mkt-text-primary)', lineHeight: 1.5 }}>
                {point}
              </p>
            </Card>
          ))}
        </div>

        <div>
          <ImagePlaceholder description={data.imagePlaceholder} minHeight={240} />
        </div>
      </div>
    </section>
  );
};
