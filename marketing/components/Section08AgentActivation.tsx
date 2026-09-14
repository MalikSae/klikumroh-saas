import React from 'react';
import { Card } from './Card';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent } from '../content/landing';
import './sections.css';

export const Section08AgentActivation: React.FC = () => {
  const data = landingContent.section08AgentActivation;

  return (
    <section id="fitur" className="mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <h2 className="mkt-headline">{data.headline}</h2>
          <p className="mkt-subheadline">{data.body}</p>
        </div>

        <div className="mkt-grid-3" style={{ marginBottom: '32px' }}>
          {data.featureCards.map((item) => (
            <Card key={item.title}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--mkt-text-primary)', marginBottom: '8px' }}>
                {item.title}
              </h3>
              <p style={{ fontSize: '15px', color: 'var(--mkt-text-secondary)', lineHeight: 1.6 }}>
                {item.desc}
              </p>
            </Card>
          ))}
        </div>

        <div style={{ marginBottom: '32px' }}>
          <ImagePlaceholder description={data.imagePlaceholder} minHeight={240} />
        </div>

        <div className="mkt-highlight-box">
          {data.highlight}
        </div>
      </div>
    </section>
  );
};
