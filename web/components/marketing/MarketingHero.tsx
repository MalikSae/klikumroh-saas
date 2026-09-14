'use client';

import React from 'react';
import { ArrowRight, Play, Check, Bell, Share2 } from 'lucide-react';
import styles from './MarketingHero.module.css';

export const MarketingHero: React.FC = () => {
  return (
    <section className={styles.heroSection}>
      <div className={styles.container}>
        {/* Left: Hero Copy */}
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            <span className={styles.eyebrowText}>
              PLATFORM AGEN & AFFILIATE TRAVEL UMROH
            </span>
          </div>

          <h1 className={styles.headline}>
            Bangun Pasukan Agen Umroh.{' '}
            <span className={styles.headlineHighlight}>
              Lipatgandakan Closing Jamaah.
            </span>
          </h1>

          <p className={styles.subheadline}>
            Rekrut dan aktifkan agen dengan tools jualan siap pakai. Pantau setiap prospek bersama hingga closing, lalu bayar komisi saat ada hasil.
          </p>

          <div className={styles.actions}>
            <a href="#demo" className={styles.primaryBtn}>
              <span>Lihat demo</span>
              <ArrowRight size={16} />
            </a>
            <a href="#cara-kerja" className={styles.secondaryBtn}>
              <Play size={15} className={styles.playIcon} />
              <span>Cara kerjanya</span>
            </a>
          </div>

          <div className={styles.proofNotes}>
            <div className={styles.proofItem}>
              <Check size={16} className={styles.proofCheck} />
              <span>Khusus travel umroh</span>
            </div>
            <div className={styles.proofItem}>
              <Check size={16} className={styles.proofCheck} />
              <span>Berbrand travel Anda</span>
            </div>
            <div className={styles.proofItem}>
              <Check size={16} className={styles.proofCheck} />
              <span>Nyaman dipakai dari HP</span>
            </div>
          </div>
        </div>

        {/* Right: Connected Product Preview */}
        <div className={styles.previewContainer}>
          {/* Dashboard Preview Card */}
          <div className={styles.dashboardCard}>
            <div className={styles.dashboardTopBar}>
              <span className={styles.dashboardTitle}>Ringkasan channel agen</span>
              <div className={styles.liveBadge}>
                <span className={styles.liveDot} />
                <span className={styles.liveText}>Data contoh</span>
              </div>
            </div>

            {/* Metrics */}
            <div className={styles.metricsGrid}>
              <div className={styles.metricBox}>
                <span className={styles.metricLabel}>Prospek baru</span>
                <span className={styles.metricValue}>48</span>
                <span className={styles.metricDeltaPositive}>+12 minggu ini</span>
              </div>
              <div className={styles.metricBox}>
                <span className={styles.metricLabel}>Agen aktif</span>
                <span className={styles.metricValue}>31</span>
                <span className={styles.metricDeltaMuted}>dari 64 agen</span>
              </div>
              <div className={styles.metricBox}>
                <span className={styles.metricLabel}>Closing</span>
                <span className={styles.metricValue}>15</span>
                <span className={styles.metricDeltaAccent}>31% dari prospek</span>
              </div>
            </div>

            {/* Funnel */}
            <div className={styles.funnelBox}>
              <span className={styles.funnelHeading}>PERGERAKAN PROSPEK</span>
              <div className={styles.funnelBars}>
                <div className={styles.funnelRow}>
                  <span className={styles.funnelStageName}>Baru</span>
                  <div className={styles.funnelTrack}>
                    <div className={styles.funnelBar} style={{ width: '100%' }} />
                  </div>
                  <span className={styles.funnelCount}>48</span>
                </div>
                <div className={styles.funnelRow}>
                  <span className={styles.funnelStageName}>Dihubungi</span>
                  <div className={styles.funnelTrack}>
                    <div className={styles.funnelBar} style={{ width: '75%' }} />
                  </div>
                  <span className={styles.funnelCount}>36</span>
                </div>
                <div className={styles.funnelRow}>
                  <span className={styles.funnelStageName}>Tertarik</span>
                  <div className={styles.funnelTrack}>
                    <div className={styles.funnelBar} style={{ width: '50%' }} />
                  </div>
                  <span className={styles.funnelCount}>24</span>
                </div>
                <div className={styles.funnelRow}>
                  <span className={styles.funnelStageName}>Closing</span>
                  <div className={styles.funnelTrack}>
                    <div className={`${styles.funnelBar} ${styles.funnelBarClosing}`} style={{ width: '31%' }} />
                  </div>
                  <span className={`${styles.funnelCount} ${styles.funnelCountClosing}`}>15</span>
                </div>
              </div>
            </div>
          </div>

          {/* Agent Mobile Portal Card (Overlapping/floating) */}
          <div className={styles.agentPortalCard}>
            <div className={styles.agentGreeting}>
              <div>
                <span className={styles.agentHello}>Assalamu’alaikum,</span>
                <h4 className={styles.agentName}>Bu Nisa</h4>
              </div>
              <div className={styles.agentBellBtn}>
                <Bell size={16} />
              </div>
            </div>

            <div className={styles.agentBalanceBox}>
              <span className={styles.balanceLabel}>KOMISI SIAP CAIR</span>
              <span className={styles.balanceValue}>Rp 7.500.000</span>
            </div>

            <div className={styles.agentReferralBox}>
              <span className={styles.referralLabel}>LINK REFERRAL ANDA</span>
              <span className={styles.referralUrl}>umroh.travelanda.id/ref/NISA27</span>
              <button type="button" className={styles.shareBtn}>
                <Share2 size={13} />
                <span>Bagikan link</span>
              </button>
            </div>

            <div className={styles.agentMiniStats}>
              <div className={styles.miniStat}>
                <span className={styles.miniStatVal}>18</span>
                <span className={styles.miniStatLbl}>Jamaah</span>
              </div>
              <div className={styles.miniStatDivider} />
              <div className={styles.miniStat}>
                <span className={styles.miniStatVal}>6</span>
                <span className={styles.miniStatLbl}>Closing</span>
              </div>
              <div className={styles.miniStatDivider} />
              <div className={styles.miniStat}>
                <span className={styles.miniStatVal}>#3</span>
                <span className={styles.miniStatLbl}>Peringkat</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
