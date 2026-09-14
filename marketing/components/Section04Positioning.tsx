import React from 'react';
import { ImagePlaceholder } from './ImagePlaceholder';
import { landingContent } from '../content/landing';
import './sections.css';

export const Section04Positioning: React.FC = () => {
  const data = landingContent.section04Positioning;

  return (
    <section className="mkt-section">
      <div className="mkt-container">
        <div className="mkt-positioning-split">
          <div>
            <h2 className="mkt-headline">{data.headline}</h2>
            <p className="mkt-subheadline">{data.body}</p>
            <div className="mkt-highlight-box">
              {data.highlight}
            </div>
          </div>

          <div>
            <ImagePlaceholder description={data.imagePlaceholder} minHeight={260} />
          </div>
        </div>
      </div>
    </section>
  );
};
