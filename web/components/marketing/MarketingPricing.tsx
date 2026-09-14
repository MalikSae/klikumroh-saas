'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Gift } from 'lucide-react';
import styles from './MarketingPricing.module.css';

export interface PlanTier {
  id: number;
  name: string;
  periodMonths: number;
  price: number;
  monthlyEquivalent: number;
  discountLabel?: string;
  discountBadge?: string;
  popular?: boolean;
}

export const PLANS: PlanTier[] = [
  {
    id: 1,
    name: 'Paket 3 Bulan',
    periodMonths: 3,
    price: 1500000,
    monthlyEquivalent: 500000,
    discountLabel: 'FLEKSIBEL',
  },
  {
    id: 2,
    name: 'Paket 6 Bulan',
    periodMonths: 6,
    price: 2700000,
    monthlyEquivalent: 450000,
    discountLabel: 'PALING POPULER',
    discountBadge: 'Hemat 10%',
    popular: true,
  },
  {
    id: 3,
    name: 'Paket 12 Bulan',
    periodMonths: 12,
    price: 4800000,
    monthlyEquivalent: 400000,
    discountLabel: 'PALING HEMAT',
    discountBadge: 'Hemat 20%',
  },
];

const PLATFORM_FEATURES = [
  'Website whitelabel',
  'Custom domain',
  'Sistem agen & affiliate',
  'Manajemen prospek',
];

const TOOLS_FEATURES = [
  '99 ide sumber jamaah',
  '152 konten promosi siap sebar',
  '213 script chat WhatsApp',
];

export const MarketingPricing: React.FC = () => {
  return (
    <section id="harga" className={styles.section}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.eyebrow}>HARGA LANGGANAN</span>
          <h2 className={styles.headline}>Pilih durasi langganan</h2>
          <p className={styles.description}>
            Semua paket mendapatkan fitur lengkap dan jumlah agen tanpa batas.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className={styles.pricingGrid}>
          {/* Card 1: 3 Bulan */}
          <div className={styles.pricingCard}>
            <div className={styles.badgeWrapper}>
              <span className={styles.planBadge}>FLEKSIBEL</span>
            </div>
            <div className={styles.planHeader}>
              <h3 className={styles.planTitle}>3 Bulan</h3>
              <p className={styles.planSummary}>Cocok untuk mencoba satu periode promosi.</p>
            </div>
            <div className={styles.priceBox}>
              <div className={styles.priceRow}>
                <span className={styles.priceAmount}>Rp500.000</span>
                <span className={styles.pricePeriod}>/bln</span>
              </div>
              <span className={styles.priceTotal}>Total Rp1.500.000 untuk 3 bulan</span>
            </div>

            <div className={styles.divider} />

            <div className={styles.featureGroup}>
              <span className={styles.groupLabel}>FITUR PLATFORM</span>
              <ul className={styles.featureList}>
                {PLATFORM_FEATURES.map((f, i) => (
                  <li key={i} className={styles.featureItem}>
                    <Check size={16} className={styles.checkIcon} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.featureGroup}>
              <span className={styles.groupLabel}>TOOLS MARKETING SIAP PAKAI</span>
              <ul className={styles.featureList}>
                {TOOLS_FEATURES.map((f, i) => (
                  <li key={i} className={styles.featureItem}>
                    <Check size={16} className={styles.checkIcon} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Link href="/marketing/checkout?plan_id=1" className={styles.ctaBtn}>
              Pilih paket 3 bulan
            </Link>
          </div>

          {/* Card 2: 6 Bulan (Popular) */}
          <div className={`${styles.pricingCard} ${styles.pricingCardPopular}`}>
            <div className={styles.badgeWrapper}>
              <span className={styles.popularBadge}>PALING POPULER</span>
            </div>
            <div className={styles.planHeader}>
              <h3 className={styles.planTitle}>6 Bulan</h3>
              <p className={styles.planSummary}>Cukup waktu membangun ritme agen.</p>
            </div>
            <div className={styles.priceBox}>
              <div className={styles.priceRow}>
                <span className={styles.priceAmount}>Rp450.000</span>
                <span className={styles.pricePeriod}>/bln</span>
              </div>
              <span className={styles.priceTotal}>Total Rp2.700.000 untuk 6 bulan</span>
            </div>

            <div className={styles.divider} />

            <div className={styles.featureGroup}>
              <span className={styles.groupLabel}>FITUR PLATFORM</span>
              <ul className={styles.featureList}>
                {PLATFORM_FEATURES.map((f, i) => (
                  <li key={i} className={styles.featureItem}>
                    <Check size={16} className={styles.checkIcon} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.featureGroup}>
              <span className={styles.groupLabel}>TOOLS MARKETING SIAP PAKAI</span>
              <ul className={styles.featureList}>
                {TOOLS_FEATURES.map((f, i) => (
                  <li key={i} className={styles.featureItem}>
                    <Check size={16} className={styles.checkIcon} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Link href="/marketing/checkout?plan_id=2" className={styles.ctaBtnPopular}>
              Pilih paket 6 bulan
            </Link>
          </div>

          {/* Card 3: 12 Bulan */}
          <div className={styles.pricingCard}>
            <div className={styles.badgeWrapper}>
              <span className={styles.planBadge}>PALING HEMAT</span>
            </div>
            <div className={styles.planHeader}>
              <h3 className={styles.planTitle}>12 Bulan</h3>
              <p className={styles.planSummary}>Kelola jaringan agen sepanjang tahun.</p>
            </div>
            <div className={styles.priceBox}>
              <div className={styles.priceRow}>
                <span className={styles.priceAmount}>Rp400.000</span>
                <span className={styles.pricePeriod}>/bln</span>
              </div>
              <span className={styles.priceTotal}>Total Rp4.800.000 untuk 12 bulan</span>
            </div>

            <div className={styles.divider} />

            <div className={styles.featureGroup}>
              <span className={styles.groupLabel}>FITUR PLATFORM</span>
              <ul className={styles.featureList}>
                {PLATFORM_FEATURES.map((f, i) => (
                  <li key={i} className={styles.featureItem}>
                    <Check size={16} className={styles.checkIcon} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.featureGroup}>
              <span className={styles.groupLabel}>TOOLS MARKETING SIAP PAKAI</span>
              <ul className={styles.featureList}>
                {TOOLS_FEATURES.map((f, i) => (
                  <li key={i} className={styles.featureItem}>
                    <Check size={16} className={styles.checkIcon} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.bonusBox}>
              <Gift size={20} className={styles.bonusIcon} />
              <div className={styles.bonusCopy}>
                <span className={styles.bonusLabel}>BONUS PAKET TAHUNAN</span>
                <span className={styles.bonusTitle}>Strategi Rekrut 1.000 Agen dalam 100 Hari</span>
              </div>
            </div>

            <Link href="/marketing/checkout?plan_id=3" className={styles.ctaBtn}>
              Pilih paket 12 bulan
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
