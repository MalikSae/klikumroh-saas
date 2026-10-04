'use client';

import React from 'react';
import Image from 'next/image';

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

const V3_ECOSYSTEM_LOGOS: EcosystemLogo[] = [
  ...ECOSYSTEM_LOGOS,
  { name: 'Nusuk Umrah', src: '/images/ecosystem/clean/nusuk-umrah.png', width: 1024, height: 285 },
];

export function MarketingEcosystemBar() {
  return (
    <section className={styles.logosSection} aria-label="Ekosistem travel umroh di Indonesia">
      <div className={styles.logosContainer}>
        <p className={styles.logosCaption}>Ekosistem travel umroh di Indonesia</p>
        <div className={styles.compactLogoGrid}>
          {V3_ECOSYSTEM_LOGOS.map(logo => <Image key={logo.name} src={logo.src} alt={logo.name} width={logo.width} height={logo.height} />)}
        </div>
      </div>
    </section>
  );
}
