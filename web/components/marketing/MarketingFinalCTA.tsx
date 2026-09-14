'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import styles from './MarketingFinalCTA.module.css';

export const MarketingFinalCTA: React.FC = () => {
  return (
    <section id="demo" className={styles.section}>
      <div className={styles.container}>
        <span className={styles.eyebrow}>
          AGEN, PROSPEK, DAN TOOLS MARKETING DALAM SATU ALUR
        </span>

        <h2 className={styles.headline}>
          Mulai bangun jaringan agen yang aktif cari jamaah dan closing
        </h2>

        <p className={styles.body}>
          Dalam demo, Anda akan melihat cara merekrut agen, membekali mereka untuk jualan, dan menangani prospek bersama sampai closing.
        </p>

        <div className={styles.actions}>
          <a
            href="https://wa.me/6281234567890?text=Halo%20KlikUmroh,%20saya%20ingin%20jadwalkan%20sesi%20demo%20platform"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.primaryBtn}
          >
            <span>Lihat demo</span>
            <ArrowRight size={16} />
          </a>
          <a href="#harga" className={styles.secondaryBtn}>
            <span>Lihat harga</span>
          </a>
        </div>
      </div>
    </section>
  );
};
