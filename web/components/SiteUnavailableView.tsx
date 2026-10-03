import React from 'react';
import { CloudOff, Globe, RotateCw } from 'lucide-react';
import { MobileContainer } from './MobileContainer';
import styles from './SiteUnavailableView.module.css';

// Neutral page when a hostname cannot show a travel site. It deliberately shows no KlikUmroh sales content,
// because visitors here are looking for a travel.
// - 'not-found': no active travel for this hostname (unknown subdomain, or a tenant still waiting for activation).
// - 'down': the travel data could not be loaded (API unreachable or a server error); the address is fine,
//   so the visitor is asked to try again rather than to check the address.
export const SiteUnavailableView: React.FC<{ reason?: 'not-found' | 'down' }> = ({ reason = 'not-found' }) => (
  <div className={styles.wrapper}>
    <MobileContainer>
      {reason === 'down' ? (
        <main className={styles.container}>
          <CloudOff size={32} className={styles.icon} aria-hidden="true" />
          <h1 className={styles.title}>Situs sedang gangguan</h1>
          <p className={styles.desc}>
            Halaman travel ini tidak bisa dimuat untuk sementara. Alamatnya sudah benar, silakan coba lagi dalam beberapa menit.
          </p>
          {/* href="" reloads this same address, path and query string included (referral links keep working). */}
          <a href="" className={styles.retry}>
            <RotateCw size={16} aria-hidden="true" />
            Muat ulang
          </a>
        </main>
      ) : (
        <main className={styles.container}>
          <Globe size={32} className={styles.icon} aria-hidden="true" />
          <h1 className={styles.title}>Situs travel belum tersedia</h1>
          <p className={styles.desc}>
            Alamat ini belum terhubung ke website travel yang aktif. Periksa kembali alamat yang Anda buka, atau hubungi travel yang memberikan tautan ini.
          </p>
        </main>
      )}
    </MobileContainer>
  </div>
);
