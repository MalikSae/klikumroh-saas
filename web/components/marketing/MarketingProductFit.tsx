'use client';

import React from 'react';
import { Users, UserPlus, ArrowRight } from 'lucide-react';
import styles from './MarketingProductFit.module.css';

export const MarketingProductFit: React.FC = () => {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        {/* Heading */}
        <div className={styles.headingRow}>
          <div className={styles.headingCopy}>
            <span className={styles.eyebrow}>UNTUK DUA KONDISI TRAVEL</span>
            <h2 className={styles.headline}>
              Pakai untuk jaringan yang sudah berjalan atau mulai merekrut agen baru.
            </h2>
          </div>
          <p className={styles.erpCompatibility}>
            KlikUmroh menangani channel agen dan prospek. Sistem operasional travel yang sudah Anda gunakan tetap berjalan seperti biasa.
          </p>
        </div>

        {/* 2 Cards */}
        <div className={styles.cardsGrid}>
          {/* Card 1: Sudah punya agen */}
          <div className={styles.fitCard}>
            <div className={styles.cardTop}>
              <span className={styles.cardLabel}>SUDAH PUNYA AGEN</span>
              <div className={styles.iconBox}>
                <Users size={20} className={styles.cardIcon} />
              </div>
            </div>
            <h3 className={styles.cardTitle}>Beri sistem pada jaringan yang ada.</h3>
            <p className={styles.cardDesc}>
              Masukkan agen yang sudah bergabung, lalu beri mereka referral, tools marketing, target, dan akses melihat progres sendiri.
            </p>
            <a href="#demo" className={styles.cardAction}>
              <span>Rapikan jaringan agen</span>
              <ArrowRight size={16} />
            </a>
          </div>

          {/* Card 2: Baru mau memulai */}
          <div className={styles.fitCard}>
            <div className={styles.cardTop}>
              <span className={styles.cardLabel}>BARU MAU MEMULAI</span>
              <div className={styles.iconBox}>
                <UserPlus size={20} className={styles.cardIcon} />
              </div>
            </div>
            <h3 className={styles.cardTitle}>Mulai merekrut dengan sistem yang siap.</h3>
            <p className={styles.cardDesc}>
              Buka pendaftaran, atur komisi, lalu bekali agen baru dengan tools marketing siap pakai.
            </p>
            <a href="#harga" className={styles.cardAction}>
              <span>Bangun channel agen</span>
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
