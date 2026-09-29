import React from 'react';
import { Globe } from 'lucide-react';
import { MobileContainer } from './MobileContainer';
import styles from './SiteUnavailableView.module.css';

// Neutral page for a hostname that has no active travel site yet (unknown
// subdomain, or a tenant still waiting for activation). It deliberately shows
// no KlikUmroh sales content, because visitors here are looking for a travel.
export const SiteUnavailableView: React.FC = () => (
  <div className={styles.wrapper}>
    <MobileContainer>
      <main className={styles.container}>
        <Globe size={32} className={styles.icon} aria-hidden="true" />
        <h1 className={styles.title}>Situs travel belum tersedia</h1>
        <p className={styles.desc}>
          Alamat ini belum terhubung ke website travel yang aktif. Periksa kembali alamat yang Anda buka, atau hubungi travel yang memberikan tautan ini.
        </p>
      </main>
    </MobileContainer>
  </div>
);
