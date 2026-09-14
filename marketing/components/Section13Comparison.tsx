import React from 'react';
import { landingContent } from '../content/landing';
import './sections.css';

export const Section13Comparison: React.FC = () => {
  const data = landingContent.section13Comparison;

  return (
    <section className="mkt-section mkt-section--alt">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <h2 className="mkt-headline">{data.headline}</h2>
        </div>

        <div className="mkt-comparison-wrapper">
          <table className="mkt-comparison-table">
            <thead>
              <tr>
                <th>{data.tableHeaders.before}</th>
                <th>{data.tableHeaders.after}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.before}>
                  <td>{row.before}</td>
                  <td>{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mkt-supporting-text">{data.supporting}</p>
      </div>
    </section>
  );
};
