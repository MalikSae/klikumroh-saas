'use client';

import React from 'react';
import { UserX, HelpCircle, Clock } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import styles from './MarketingPainPoints.module.css';

const PROBLEMS = [
  {
    num: '01',
    icon: UserX,
    title: 'Rekrut banyak agen, tapi ujungnya pasif & tidak closing',
    desc: 'Calon agen semangat saat mendaftar, tapi langsung mundur saat harus jualan karena tidak tahu cara menawarkan dan takut ditolak.',
  },
  {
    num: '02',
    icon: HelpCircle,
    title: 'Agen bingung cari jamaah & malu membuka obrolan',
    desc: 'Tanpa bekal materi promosi dan script pesan teruji, agen hanya mengandalkan lingkaran keluarga dekat lalu berhenti bergerak.',
  },
  {
    num: '03',
    icon: Clock,
    title: 'Database prospek tercecer di chat pribadi & rawan konflik',
    desc: 'Prospek yang masuk ke WA pribadi agen tidak terpantau pusat. Rawan lupa di-follow up, hilang tanpa jejak, atau memicu konflik komisi saat closing.',
  },
];

export const MarketingPainPoints: React.FC = () => {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <ScrollReveal animation="fade-up">
          <div className={styles.headerRow}>
            <div className={styles.headingCopy}>
              <span className={styles.eyebrow}>YANG TERJADI DI BANYAK TRAVEL</span>
              <h2 className={styles.headline}>
                Membangun channel agen sering tersendat di tiga titik.
              </h2>
            </div>
            <p className={styles.intro}>
              Hambatannya muncul saat merekrut, membekali agen untuk jualan, dan memastikan setiap prospek ditindaklanjuti.
            </p>
          </div>
        </ScrollReveal>

        <div className={styles.problemList}>
          {PROBLEMS.map((prob, index) => {
            const IconComponent = prob.icon;
            return (
              <ScrollReveal
                key={prob.num}
                as="div"
                className={styles.problemCard}
                animation="fade-up"
                delay={index * 140}
              >
                <div className={styles.cardTop}>
                  <span className={styles.cardNumber}>{prob.num}</span>
                  <div className={styles.iconBox}>
                    <IconComponent size={20} className={styles.cardIcon} />
                  </div>
                </div>
                <h3 className={styles.cardTitle}>{prob.title}</h3>
                <p className={styles.cardDesc}>{prob.desc}</p>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};
