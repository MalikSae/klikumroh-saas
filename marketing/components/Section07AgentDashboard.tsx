import React from 'react';
import { Card } from './Card';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent } from '../content/landing';
import './sections.css';

export const Section07AgentDashboard: React.FC = () => {
  const data = landingContent.section07AgentDashboard;

  return (
    <section id="sistem-agen" className="mkt-section mkt-section--alt">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <span className="mkt-eyebrow mkt-eyebrow--teal">{data.eyebrow}</span>
          <h2 className="mkt-headline">{data.headline}</h2>
          <p className="mkt-subheadline">{data.subheadline}</p>
        </div>

        <div className="mkt-positioning-split" style={{ alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
            <ImagePlaceholder description={data.imagePlaceholder} minHeight={420} />
          </div>
        </div>
      </div>
    </section>
  );
};
