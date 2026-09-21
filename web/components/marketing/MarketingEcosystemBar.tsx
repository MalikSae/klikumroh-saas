'use client';

import React from 'react';
import Image from 'next/image';
import { ScrollReveal } from './ScrollReveal';
import styles from './MarketingEcosystemBar.module.css';

interface EcosystemLogo {
  name: string;
  src: string;
  width: number;
  height: number;
}

const ECOSYSTEM_LOGOS: EcosystemLogo[] = [
  {
    name: 'Kementerian Haji dan Umrah RI',
    src: '/images/ecosystem/clean/kemenhaj.png',
    width: 48,
    height: 48,
  },
  {
    name: 'SISKOPATUH Kemenag RI',
    src: '/images/ecosystem/clean/siskopatuh.png',
    width: 100,
    height: 42,
  },
  {
    name: 'AMPHURI',
    src: '/images/ecosystem/clean/amphuri.png',
    width: 110,
    height: 38,
  },
  {
    name: 'HIMPUH',
    src: '/images/ecosystem/clean/himpuh.png',
    width: 42,
    height: 48,
  },
  {
    name: 'ASPHURINDO',
    src: '/images/ecosystem/clean/asphurindo.png',
    width: 46,
    height: 44,
  },
  {
    name: 'SAPUHI',
    src: '/images/ecosystem/clean/sapuhi.png',
    width: 44,
    height: 44,
  },
  {
    name: 'IATA',
    src: '/images/ecosystem/clean/iata.png',
    width: 58,
    height: 36,
  },
];

export const MarketingEcosystemBar: React.FC = () => {
  return (
    <section className={styles.section} aria-label="Kompatibilitas Ekosistem Travel Umroh">
      <div className={styles.container}>
        <ScrollReveal animation="fade-up">
          <div className={styles.header}>
            <span className={styles.eyebrow}>KOMPATIBILITAS EKOSISTEM</span>
            <h2 className={styles.headline}>
              Dirancang Selaras untuk Ekosistem Biro Travel Berizin Resmi
            </h2>
            <p className={styles.subheadline}>
              KlikUmroh berfokus pada aktivasi agen dan akuisisi jamaah, siap mendukung operasional biro perjalanan umroh (PPIU) anggota asosiasi resmi di Indonesia.
            </p>
          </div>
        </ScrollReveal>

        <div className={styles.logoGrid}>
          {ECOSYSTEM_LOGOS.map((logo, idx) => (
            <ScrollReveal
              key={logo.name}
              as="div"
              className={styles.logoItem}
              animation="fade-up"
              delay={idx * 60}
            >
              <Image
                src={logo.src}
                alt={logo.name}
                width={logo.width}
                height={logo.height}
                className={styles.logoImg}
              />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
};
