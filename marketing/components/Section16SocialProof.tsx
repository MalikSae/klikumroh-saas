import React from 'react';
import { Card } from './Card';
import { landingContent } from '../content/landing';
import './sections.css';

export const Section16SocialProof: React.FC = () => {
  const data = landingContent.section16SocialProof;

  return (
    <section className="mkt-section">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <h2 className="mkt-headline">{data.headline}</h2>
          <p className="mkt-subheadline">{data.body}</p>
        </div>

        <div className="mkt-grid-3">
          {/* Card 1 */}
          <Card variant="muted" style={{ minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {/* // TODO: isi testimoni asli dari design partner, jangan pakai data karangan */}
            <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--mkt-text-muted)', marginBottom: '16px' }}>
              {data.placeholderComment}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--mkt-text-muted)' }}>
              Format: {data.formatTemplate}
            </div>
          </Card>

          {/* Card 2 */}
          <Card variant="muted" style={{ minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {/* // TODO: isi testimoni asli dari design partner, jangan pakai data karangan */}
            <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--mkt-text-muted)', marginBottom: '16px' }}>
              {data.placeholderComment}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--mkt-text-muted)' }}>
              Format: {data.formatTemplate}
            </div>
          </Card>

          {/* Card 3 */}
          <Card variant="muted" style={{ minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {/* // TODO: isi testimoni asli dari design partner, jangan pakai data karangan */}
            <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--mkt-text-muted)', marginBottom: '16px' }}>
              {data.placeholderComment}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--mkt-text-muted)' }}>
              Format: {data.formatTemplate}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};
