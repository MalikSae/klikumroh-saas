import React from 'react';
import { Card } from './Card';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent } from '../content/landing';
import './sections.css';

export const Section03Problem: React.FC = () => {
  const data = landingContent.section03Problem;

  return (
    <section className="mkt-section mkt-section--alt">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <h2 className="mkt-headline">{data.headline}</h2>
          <p className="mkt-problem-intro">{data.intro}</p>
        </div>

        <div className="mkt-grid-4" style={{ marginBottom: '36px' }}>
          {data.painPoints.map((item) => (
            <Card key={item.title}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--mkt-text-primary)', marginBottom: '10px' }}>
                {item.title}
              </h3>
              <p style={{ fontSize: '15px', color: 'var(--mkt-text-secondary)', lineHeight: 1.65 }}>
                {item.desc}
              </p>
            </Card>
          ))}
        </div>

        <div style={{ marginBottom: '32px' }}>
          <ImagePlaceholder description={data.imagePlaceholder} minHeight={200} />
        </div>

        <p className="mkt-problem-closing">{data.closing}</p>
      </div>
    </section>
  );
};
