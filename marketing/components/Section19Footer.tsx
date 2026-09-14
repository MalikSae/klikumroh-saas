'use client';

import React from 'react';
import Link from 'next/link';
import { landingContent } from '../content/landing';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import './sections.css';

export const Section19Footer: React.FC = () => {
  const { whatsappDemoUrl } = usePlatformSettings();
  const data = landingContent.section19Footer;

  return (
    <footer className="mkt-footer">
      <div className="mkt-container">
        <div className="mkt-footer-grid">
          <div className="mkt-footer-brand">
            <h3>KlikUmroh.id</h3>
            <p style={{ maxWidth: '320px', lineHeight: 1.6, fontSize: '14px', color: 'var(--mkt-footer-text)' }}>
              {data.closingLine}
            </p>
          </div>

          <div className="mkt-footer-col">
            <h4>{data.product.title}</h4>
            <ul className="mkt-footer-links">
              {data.product.links.map((link) => (
                <li key={link.label}>
                  {link.href.startsWith('/') ? (
                    <Link href={link.href}>{link.label}</Link>
                  ) : (
                    <a href={link.href}>{link.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="mkt-footer-col">
            <h4>{data.company.title}</h4>
            <ul className="mkt-footer-links">
              {data.company.links.map((link) => {
                const targetHref = link.label === 'Kontak' ? whatsappDemoUrl : link.href;
                return (
                  <li key={link.label}>
                    <a href={targetHref}>{link.label}</a>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mkt-footer-col">
            <h4>{data.legal.title}</h4>
            <ul className="mkt-footer-links">
              {data.legal.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mkt-footer-bottom">
          <p>{data.closingLine}</p>
        </div>
      </div>
    </footer>
  );
};
