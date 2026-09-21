'use client';

import React from 'react';
import { ArrowRight, MessageCircle, Check, Bell, Share2 } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import styles from './MarketingHero.module.css';

export const MarketingHero: React.FC = () => {
  return (
    <section className={styles.heroSection}>
      <div className={styles.container}>
        {/* Left: Hero Copy */}
        <ScrollReveal as="div" className={styles.heroCopy} animation="fade-up" delay={40}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            <span className={styles.eyebrowText}>
              SOFTWARE AKUISISI JAMAAH & AKTIVASI AGEN
            </span>
          </div>

          <h1 className={styles.headline}>
            <span className={styles.headlineHighlight}>
              Bangun Pasukan Agen Umroh.
            </span>{' '}
            Lipatgandakan Closing Jamaah.
          </h1>

          <p className={styles.subheadline}>
            Biro travel Anda mendapatkan website whitelabel resmi, ratusan amunisi konten & script WA siap pakai untuk agen, serta pipeline prospek transparan tanpa takut database tercecer.
          </p>

          <div className={styles.actions}>
            <a href="#harga" className={styles.primaryBtn}>
              <span>Lihat pilihan paket</span>
              <ArrowRight size={16} />
            </a>
            <a
              href="https://wa.me/6281234567890?text=Halo%20KlikUmroh,%20saya%20owner%20travel%20ingin%20konsultasi%20sistem%20agen%20dan%20demo%20platform"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.secondaryBtn}
            >
              <MessageCircle size={16} className={styles.playIcon} />
              <span>Konsultasi Gratis</span>
            </a>
          </div>

          <div className={styles.proofNotes}>
            <div className={styles.proofItem}>
              <Check size={16} className={styles.proofCheck} />
              <span>100% Whitelabel (Brand & Domain Sendiri)</span>
            </div>
            <div className={styles.proofItem}>
              <Check size={16} className={styles.proofCheck} />
              <span>Database Jamaah Terenkripsi & Milik Travel</span>
            </div>
            <div className={styles.proofItem}>
              <Check size={16} className={styles.proofCheck} />
              <span>Siap Pakai 15 Menit Tanpa Instalasi</span>
            </div>
          </div>
        </ScrollReveal>

        {/* Right: Connected Product Preview */}
        <ScrollReveal as="div" className={styles.previewContainer} animation="scale-up" delay={120}>
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
              <button type="button" className={styles.shareBtn} aria-label="Bagikan link referral agen">
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
        </ScrollReveal>
      </div>
    </section>
  );
};
