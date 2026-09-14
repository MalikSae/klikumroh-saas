import React from 'react';
import { ChevronDown } from 'lucide-react';
import { landingContent } from '../content/landing';
import './sections.css';

export const Section17FAQ: React.FC = () => {
  const data = landingContent.section17FAQ;

  return (
    <section id="faq" className="mkt-section mkt-section--alt">
      <div className="mkt-container">
        <div className="mkt-section-header mkt-section-header--centered">
          <h2 className="mkt-headline">{data.headline}</h2>
        </div>

        <div className="mkt-faq-list">
          {data.items.map((item) => (
            <details key={item.question} className="mkt-faq-item">
              <summary>
                <span>{item.question}</span>
                <ChevronDown size={18} style={{ flexShrink: 0, color: 'var(--mkt-text-muted)' }} />
              </summary>
              <div className="mkt-faq-answer">
                <p>{item.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};
