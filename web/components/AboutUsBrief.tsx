'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from './Button';
import './AboutUsBrief.css';

export interface AboutUsBriefProps {
  tenantName?: string;
  tagline?: string | null;
  aboutSummary?: string | null;
}

export const AboutUsBrief: React.FC<AboutUsBriefProps> = ({
  tenantName = 'KlikUmroh Travel',
  tagline,
  aboutSummary,
}) => {
  const handleScrollToSection = () => {
    const el = document.getElementById('tentang-kami');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const paragraphs = aboutSummary
    ? aboutSummary.split('\n\n').filter(Boolean)
    : null;

  return (
    <section id="tentang-kami" className="tw-about-brief">
      <div className="tw-about-brief__card">
        <h2 className="tw-about-brief__title">Tentang {tenantName}</h2>

        {tagline && (
          <p
            style={{
              fontStyle: 'italic',
              color: 'var(--tw-brand-primary)',
              fontWeight: 600,
              fontSize: '14px',
              margin: '-4px 0 12px',
            }}
          >
            &ldquo;{tagline}&rdquo;
          </p>
        )}

        {paragraphs && paragraphs.length > 0 ? (
          paragraphs.map((p, idx) => (
            <p key={idx} className="tw-about-brief__text">
              {p}
            </p>
          ))
        ) : (
          <>
            <p className="tw-about-brief__text">
              {tenantName} adalah penyelenggara resmi perjalanan ibadah umroh dan haji khusus berizin resmi Kementerian Agama RI. Kami berkomitmen memberikan pelayanan terbaik dengan integritas tinggi dan bimbingan ibadah komprehensif.
            </p>
            <p className="tw-about-brief__text">
              Didukung oleh tim profesional dan muthawif berpengalaman, kami memastikan setiap langkah perjalanan ibadah Anda berjalan lancar, aman, dan berkesan penuh berkah.
            </p>
          </>
        )}

        <div className="tw-about-brief__action">
          <Button variant="secondary" size="sm" onClick={handleScrollToSection}>
            <span>Selengkapnya</span>
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </section>
  );
};
