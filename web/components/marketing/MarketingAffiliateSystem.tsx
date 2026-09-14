'use client';

import React, { useState } from 'react';
import { Copy, Share2, Check } from 'lucide-react';
import styles from './MarketingAffiliateSystem.module.css';

const CHECKLIST = [
  'Referral unik untuk setiap agen',
  'Portal mobile dengan brand travel',
  'Target, leaderboard, dan riwayat komisi',
  'Pendaftaran agen gratis atau berbayar',
];

export const MarketingAffiliateSystem: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText('travelanda.id/ref/NISA27');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="fitur" className={styles.section}>
      <div className={styles.container}>
        {/* Left: Agent Portal Showcase Phone Mockup */}
        <div className={styles.showcaseWrapper}>
          <div className={styles.haloGlow} />

          <div className={styles.phoneMockup}>
            {/* Phone Header */}
            <div className={styles.phoneHeader}>
              <div>
                <span className={styles.phoneWelcome}>Halo,</span>
                <h4 className={styles.phoneUser}>Nisa Rahma</h4>
              </div>
              <div className={styles.phoneAvatar}>
                <span>NR</span>
              </div>
            </div>

            {/* Monthly Target */}
            <div className={styles.targetCard}>
              <div className={styles.targetLabels}>
                <span className={styles.targetTitle}>Target September</span>
                <span className={styles.targetValue}>6 dari 10 jamaah</span>
              </div>
              <div className={styles.targetTrack}>
                <div className={styles.targetProgress} style={{ width: '60%' }} />
              </div>
            </div>

            {/* Balance Card */}
            <div className={styles.balanceCard}>
              <span className={styles.balanceLabel}>KOMISI SIAP CAIR</span>
              <span className={styles.balanceValue}>Rp 7.500.000</span>
              <span className={styles.pendingBalance}>Potensi berjalan Rp 3.250.000</span>
            </div>

            {/* Referral Card */}
            <div className={styles.referralCard}>
              <span className={styles.referralLabel}>LINK REFERRAL SAYA</span>
              <span className={styles.referralUrl}>travelanda.id/ref/NISA27</span>
              <div className={styles.referralActions}>
                <button type="button" className={styles.actionBtn} onClick={handleCopy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Tersalin' : 'Salin'}</span>
                </button>
                <button type="button" className={styles.actionBtn}>
                  <Share2 size={14} />
                  <span>Bagikan</span>
                </button>
              </div>
            </div>

            {/* Recent Jamaah */}
            <div className={styles.recentSection}>
              <span className={styles.recentLabel}>JAMAAH TERBARU</span>
              <div className={styles.jamaahItem}>
                <span className={styles.jamaahName}>Hj. Maryam</span>
                <span className={styles.statusInterested}>Tertarik</span>
              </div>
              <div className={styles.jamaahItem}>
                <span className={styles.jamaahName}>Bapak Fajar</span>
                <span className={styles.statusContacted}>Dihubungi</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Feature Copy */}
        <div className={styles.featureCopy}>
          <span className={styles.featureNumber}>01  —  AGEN & AFFILIATE</span>
          <h2 className={styles.featureHeadline}>
            Setiap agen punya link, jamaah, dan catatan komisinya sendiri.
          </h2>
          <p className={styles.featureBody}>
            Agen dapat membagikan referral dari HP, melihat jamaah yang mereka bawa, dan mengikuti progres komisi tanpa harus menunggu rekap admin.
          </p>

          <div className={styles.checklist}>
            {CHECKLIST.map((item, idx) => (
              <div key={idx} className={styles.checkItem}>
                <div className={styles.checkIconBox}>
                  <Check size={15} className={styles.checkIcon} />
                </div>
                <span className={styles.checkText}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
