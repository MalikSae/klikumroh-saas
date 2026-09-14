import React from 'react';
import { Card } from './Card';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent } from '../content/landing';
import './sections.css';

export const Section10TravelDashboard: React.FC = () => {
  const data = landingContent.section10TravelDashboard;

  return (
    <section className="mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <h2 className="mkt-headline">{data.headline}</h2>
        </div>

        <div className="mkt-grid-3" style={{ marginBottom: '36px' }}>
          {data.features.map((item) => (
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

        <div>
          <ImagePlaceholder description={data.imagePlaceholder} minHeight={320} />
        </div>
      </div>
    </section>
  );
};
