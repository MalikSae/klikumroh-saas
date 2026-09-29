'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Check, ShieldCheck } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import { toPlanTiers, type PlanTier } from '../../lib/pricingPlans';
import styles from './MarketingPricing.module.css';

export type { PlanTier };

// DEPRECATED: hanya dipakai MarketingCheckout.tsx (komponen lama yang tidak dirender di halaman mana pun).
// Landing TIDAK memakai nilai ini lagi — harga selalu dari API (lihat lib/pricingPlans.ts).
export const PLANS_FALLBACK: PlanTier[] = [
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
    price: 2000000,
    monthlyEquivalent: 333333,
    discountLabel: 'PALING POPULER',
    discountBadge: 'Hemat 25%',
    popular: true,
  },
  {
    id: 3,
    name: 'Paket 12 Bulan',
    periodMonths: 12,
    price: 3500000,
    monthlyEquivalent: 291667,
    discountLabel: 'PALING HEMAT',
    discountBadge: 'Hemat 42%',
  },
];

// Kept for backward-compat exports (CheckoutView imports this)
export const PLANS = PLANS_FALLBACK;

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

function formatRp(val: number): string {
  return `Rp${val.toLocaleString('id-ID')}`;
}

export interface MarketingPricingProps {
  /** Plans rendered on the server (ISR) so the initial HTML shows real prices. */
  initialPlans?: PlanTier[];
}

export const MarketingPricing: React.FC<MarketingPricingProps> = ({ initialPlans = [] }) => {
  const [plans, setPlans] = React.useState<PlanTier[]>(initialPlans || []);

  // Only when the server could not reach the API: retry from the browser. No hardcoded prices.
  useEffect(() => {
    if (initialPlans && initialPlans.length > 0) return;
    fetch('/api/public/pricing-plans')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.plans) && data.plans.length > 0) {
          setPlans(toPlanTiers(data.plans));
        }
      })
      .catch(() => {});
  }, [initialPlans]);

  const planList = plans || [];
  const plan3 = planList.find((p) => p.periodMonths === 3) ?? planList[0];
  const plan6 = planList.find((p) => p.periodMonths === 6) ?? planList[1];
  const plan12 = planList.find((p) => p.periodMonths >= 12) ?? planList[2];
  const plansReady = Boolean(plan3 && plan6 && plan12);

  return (
    <section id="harga" className={styles.section}>
      <div className={styles.container}>
        {/* Header */}
        <ScrollReveal animation="fade-up">
          <div className={styles.header}>
            <span className={styles.eyebrow}>HARGA LANGGANAN</span>
            <h2 className={styles.headline}>Pilih durasi langganan</h2>
            <p className={styles.description}>
              Semua paket mendapatkan fitur lengkap dan jumlah agen tanpa batas.
            </p>
          </div>
        </ScrollReveal>

        {/* Pricing Cards Grid (only real plans from the API — no hardcoded prices) */}
        {!plansReady && (
          <p className={styles.description} role="status">
            Daftar harga sedang tidak dapat dimuat. Silakan muat ulang halaman beberapa saat lagi.
          </p>
        )}
        {plansReady && plan3 && plan6 && plan12 && (
        <div className={styles.pricingGrid}>
          {/* Card 1: 3 Bulan */}
          <ScrollReveal as="div" className={styles.pricingCard} animation="fade-up" delay={0}>
            <div className={styles.badgeWrapper}>
              <span className={styles.planBadge}>{plan3.discountLabel ?? 'FLEKSIBEL'}</span>
            </div>
            <div className={styles.planHeader}>
              <h3 className={styles.planTitle}>{plan3.periodMonths} Bulan</h3>
              <p className={styles.planSummary}>Cocok untuk mencoba satu periode promosi.</p>
            </div>
            <div className={styles.priceBox}>
              <div className={styles.priceRow}>
                <span className={styles.priceAmount}>{formatRp(plan3.monthlyEquivalent)}</span>
                <span className={styles.pricePeriod}>/bln</span>
              </div>
              <span className={styles.priceTotal}>
                Total {formatRp(plan3.price)} untuk {plan3.periodMonths} bulan
              </span>
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

            <Link href={`/marketing/checkout?plan_id=${plan3.id}`} className={styles.ctaBtn}>
              Pilih paket {plan3.periodMonths} bulan
            </Link>
          </ScrollReveal>

          {/* Card 2: 6 Bulan (Popular) */}
          <ScrollReveal
            as="div"
            className={`${styles.pricingCard} ${styles.pricingCardPopular}`}
            animation="fade-up"
            delay={120}
          >
            <div className={styles.badgeWrapper}>
              <span className={styles.popularBadge}>{plan6.discountLabel ?? 'PALING POPULER'}</span>
            </div>
            <div className={styles.planHeader}>
              <h3 className={styles.planTitle}>{plan6.periodMonths} Bulan</h3>
              <p className={styles.planSummary}>Cukup waktu membangun ritme agen.</p>
            </div>
            <div className={styles.priceBox}>
              <div className={styles.priceRow}>
                <span className={styles.priceAmount}>{formatRp(plan6.monthlyEquivalent)}</span>
                <span className={styles.pricePeriod}>/bln</span>
              </div>
              <span className={styles.priceTotal}>
                Total {formatRp(plan6.price)} untuk {plan6.periodMonths} bulan
              </span>
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

            <Link href={`/marketing/checkout?plan_id=${plan6.id}`} className={styles.ctaBtnPopular}>
              Pilih paket {plan6.periodMonths} bulan
            </Link>
          </ScrollReveal>

          {/* Card 3: 12 Bulan */}
          <ScrollReveal as="div" className={styles.pricingCard} animation="fade-up" delay={240}>
            <div className={styles.badgeWrapper}>
              <span className={styles.planBadge}>{plan12.discountLabel ?? 'PALING HEMAT'}</span>
            </div>
            <div className={styles.planHeader}>
              <h3 className={styles.planTitle}>{plan12.periodMonths} Bulan</h3>
              <p className={styles.planSummary}>Kelola jaringan agen sepanjang tahun.</p>
            </div>
            <div className={styles.priceBox}>
              <div className={styles.priceRow}>
                <span className={styles.priceAmount}>{formatRp(plan12.monthlyEquivalent)}</span>
                <span className={styles.pricePeriod}>/bln</span>
              </div>
              <span className={styles.priceTotal}>
                Total {formatRp(plan12.price)} untuk {plan12.periodMonths} bulan
              </span>
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

            <Link href={`/marketing/checkout?plan_id=${plan12.id}`} className={styles.ctaBtn}>
              Pilih paket {plan12.periodMonths} bulan
            </Link>
          </ScrollReveal>
        </div>
        )}

        {/* Guarantee & Reassurance Row */}
        <ScrollReveal as="div" className={styles.reassuranceRow} animation="fade-up" delay={100}>
          <div className={styles.reassuranceItem}>
            <ShieldCheck size={22} className={styles.reassuranceIcon} />
            <div className={styles.reassuranceText}>
              <strong className={styles.reassuranceTitle}>Bebas Tambah Agen Tanpa Batas</strong>
              <span className={styles.reassuranceDesc}>Tidak ada biaya tersembunyi per kursi agen. Tambahkan seluruh agen yang Anda miliki.</span>
            </div>
          </div>
          <div className={styles.reassuranceItem}>
            <Check size={22} className={styles.reassuranceIcon} />
            <div className={styles.reassuranceText}>
              <strong className={styles.reassuranceTitle}>Aktivasi Cepat & Siap Dampingi</strong>
              <span className={styles.reassuranceDesc}>Sistem siap pakai langsung setelah verifikasi transfer. Tim kami siap memandu pengaturan awal.</span>
            </div>
          </div>
          <div className={styles.reassuranceItem}>
            <ShieldCheck size={22} className={styles.reassuranceIcon} />
            <div className={styles.reassuranceText}>
              <strong className={styles.reassuranceTitle}>Database 100% Hak Milik Travel</strong>
              <span className={styles.reassuranceDesc}>Data prospek, riwayat komisi, dan daftar jamaah terisolasi aman serta dapat diekspor kapan saja.</span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};
