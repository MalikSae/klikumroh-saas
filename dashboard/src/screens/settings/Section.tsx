import React from 'react';

/** One settings block: title and one-line purpose on the left, fields on the right. */
export const SettingsSection: React.FC<{ title: string; description?: React.ReactNode; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="st-section">
    <div className="st-section__head">
      <h2 className="st-section__title">{title}</h2>
      {description && <p className="st-section__desc">{description}</p>}
    </div>
    <div className="st-section__body">{children}</div>
  </section>
);
