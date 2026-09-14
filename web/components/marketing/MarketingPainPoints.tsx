'use client';

import React from 'react';
import { UserX, HelpCircle, Clock } from 'lucide-react';
import styles from './MarketingPainPoints.module.css';

const PROBLEMS = [
  {
    num: '01',
    icon: UserX,
    title: 'Rekrut agen masih sulit',
    desc: 'Calon agen tertarik, tetapi takut tidak punya prospek dan tidak bisa closing. Komisi saja belum cukup membuat mereka yakin.',
  },
  {
    num: '02',
    icon: HelpCircle,
    title: 'Agen bingung mulai jualan',
    desc: 'Mereka tidak tahu harus mencari jamaah ke mana, membuka obrolan bagaimana, atau menindaklanjuti sampai closing.',
  },
  {
    num: '03',
    icon: Clock,
    title: 'Prospek rawan terlewat',
    desc: 'Setiap prospek dibayar dengan waktu, relasi, atau biaya iklan. Tanpa progres yang jelas, aset berharga ini mudah hilang sebelum closing.',
  },
];

export const MarketingPainPoints: React.FC = () => {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
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

        <div className={styles.problemList}>
          {PROBLEMS.map((prob) => {
            const IconComponent = prob.icon;
            return (
              <div key={prob.num} className={styles.problemCard}>
                <div className={styles.cardTop}>
                  <span className={styles.cardNumber}>{prob.num}</span>
                  <div className={styles.iconBox}>
                    <IconComponent size={20} className={styles.cardIcon} />
                  </div>
                </div>
                <h3 className={styles.cardTitle}>{prob.title}</h3>
                <p className={styles.cardDesc}>{prob.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
