import React from 'react';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent } from '../content/landing';
import './sections.css';

export const Section05BeforeAfter: React.FC = () => {
  const data = landingContent.section05BeforeAfter;

  return (
    <section className="mkt-section mkt-section--alt">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <h2 className="mkt-headline">{data.headline}</h2>
        </div>

        <div className="mkt-before-after">
          <div className="mkt-before-box">
            <span className="mkt-flow-label mkt-flow-label--before">Tanpa Sistem:</span>
            <p className="mkt-flow-text">{data.tanpaSistem}</p>
          </div>

          <div className="mkt-after-box">
            <span className="mkt-flow-label mkt-flow-label--after">Dengan KlikUmroh:</span>
            <p className="mkt-flow-text">{data.denganKlikUmroh}</p>
          </div>
        </div>

        <div style={{ marginBottom: '28px' }}>
          <ImagePlaceholder description={data.imagePlaceholder} minHeight={180} />
        </div>

        <p className="mkt-supporting-text">{data.supporting}</p>
      </div>
    </section>
  );
};
