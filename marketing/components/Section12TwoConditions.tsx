import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent, WHATSAPP_DEMO_URL } from '../content/landing';
import './sections.css';

export const Section12TwoConditions: React.FC = () => {
  const data = landingContent.section12TwoConditions;

  return (
    <section className="mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <h2 className="mkt-headline">{data.headline}</h2>
        </div>

        <div className="mkt-grid-2" style={{ marginBottom: '36px' }}>
          <Card variant="accent-top" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--mkt-text-primary)', marginBottom: '12px' }}>
                {data.card01.title}
              </h3>
              <p style={{ fontSize: '15px', color: 'var(--mkt-text-secondary)', lineHeight: 1.65, marginBottom: '24px' }}>
                {data.card01.desc}
              </p>
            </div>
            <div>
              <Button variant="primary" size="md" asLink href={WHATSAPP_DEMO_URL}>
                {data.card01.cta}
              </Button>
            </div>
          </Card>

          <Card variant="accent-top" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--mkt-text-primary)', marginBottom: '12px' }}>
                {data.card02.title}
              </h3>
              <p style={{ fontSize: '15px', color: 'var(--mkt-text-secondary)', lineHeight: 1.65, marginBottom: '24px' }}>
                {data.card02.desc}
              </p>
            </div>
            <div>
              <Button variant="primary" size="md" asLink href={WHATSAPP_DEMO_URL}>
                {data.card02.cta}
              </Button>
            </div>
          </Card>
        </div>

        <div>
          <ImagePlaceholder description={data.imagePlaceholder} minHeight={240} />
        </div>
      </div>
    </section>
  );
};
