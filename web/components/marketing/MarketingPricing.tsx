'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Check, TrendingUp, ShieldCheck } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
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

// Fallback: nilai harus sinkron dengan pengaturan paket di superadmin dashboard.
// Nilai aktual selalu diambil dari API /api/public/pricing-plans saat runtime.
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

export const MarketingPricing: React.FC = () => {
  const [agents, setAgents] = React.useState<number>(20);
  const [plans, setPlans] = React.useState<PlanTier[]>(PLANS_FALLBACK);

  // Fetch harga aktual dari superadmin database agar selalu sinkron
  useEffect(() => {
    fetch('/api/public/pricing-plans')
      .then((res) => {
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.plans) && data.plans.length > 0) {
          const mapped: PlanTier[] = data.plans.map(
            (p: { id: number; name: string; period_months: number; price: number }) => {
              const months = p.period_months || 1;
              const monthlyEq = Math.round(p.price / months);
              let label = 'FLEKSIBEL';
              let badge: string | undefined;
              let popular = false;

              if (months === 6) {
                label = 'PALING POPULER';
                const base6 = plans.find((x) => x.periodMonths === 3);
                if (base6) {
                  const savings = Math.round(
                    ((base6.monthlyEquivalent - monthlyEq) / base6.monthlyEquivalent) * 100
                  );
                  badge = savings > 0 ? `Hemat ${savings}%` : undefined;
                }
                popular = true;
              } else if (months >= 12) {
                label = 'PALING HEMAT';
                const base3 = plans.find((x) => x.periodMonths === 3);
                if (base3) {
                  const savings = Math.round(
                    ((base3.monthlyEquivalent - monthlyEq) / base3.monthlyEquivalent) * 100
                  );
                  badge = savings > 0 ? `Hemat ${savings}%` : undefined;
                }
              }

              const displayName = p.name.toLowerCase().startsWith('paket')
                ? p.name
                : `Paket ${p.name}`;

              return {
                id: p.id,
                name: displayName,
                periodMonths: months,
                price: p.price,
                monthlyEquivalent: monthlyEq,
                discountLabel: label,
                discountBadge: badge,
                popular,
              };
            }
          );
          setPlans(mapped);
        }
      })
      .catch(() => {
        // Fallback ke PLANS_FALLBACK — sudah diset sebagai initial state
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plan3 = plans.find((p) => p.periodMonths === 3) ?? plans[0];
  const plan6 = plans.find((p) => p.periodMonths === 6) ?? plans[1];
  const plan12 = plans.find((p) => p.periodMonths >= 12) ?? plans[2];

  const estProspects = agents * 4;
  const estClosing = Math.max(1, Math.round(agents * 0.15));
  const estProfit = estClosing * 2500000;
  const roiBase = plan6 ? plan6.price : 2000000;
  const roiMultiple = Math.round(estProfit / roiBase);

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

        {/* Interactive ROI Value Anchor Banner */}
        <ScrollReveal as="div" className={styles.roiBanner} animation="scale-up" delay={60}>
          <div className={styles.roiBadge}>
            <TrendingUp size={15} className={styles.roiBadgeIcon} />
            <span>KALKULATOR SIMULASI BALIK MODAL (ROI)</span>
          </div>

          <h3 className={styles.roiHeadline}>
            Hanya butuh 1 closing jamaah tambahan untuk melunasi biaya langganan setahun.
          </h3>

          <div className={styles.sliderContainer}>
            <div className={styles.sliderLabelRow}>
              <span className={styles.sliderLabelText}>Jumlah Agen:</span>
              <span className={styles.sliderValueBadge}>{agents} Agen</span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              step="5"
              value={agents}
              onChange={(e) => setAgents(parseInt(e.target.value, 10))}
              className={styles.rangeSlider}
              aria-label="Jumlah agen aktif travel Anda"
            />
            <div className={styles.sliderTicks}>
              <span>5 Agen</span>
              <span>25 Agen</span>
              <span>50 Agen</span>
              <span>75 Agen</span>
              <span>100 Agen</span>
            </div>
          </div>

          {/* Dynamic Metrics Row */}
          <div className={styles.calcGrid}>
            <div className={styles.calcBox}>
              <span className={styles.calcLabel}>ESTIMASI PROSPEK/BLN</span>
              <span className={styles.calcVal}>~{estProspects}</span>
              <span className={styles.calcSub}>4 prospek per agen</span>
            </div>
            <div className={styles.calcBox}>
              <span className={styles.calcLabel}>POTENSI CLOSING</span>
              <span className={styles.calcVal}>+{estClosing} Jamaah</span>
              <span className={styles.calcSub}>Konversi konservatif ~15%</span>
            </div>
            <div className={styles.calcBoxHighlight}>
              <span className={styles.calcLabelLight}>ESTIMASI LABA TRAVEL</span>
              <span className={styles.calcValLight}>Rp {estProfit.toLocaleString('id-ID')}</span>
              <span className={styles.calcSubLight}>Balik modal {roiMultiple}x lipat biaya sistem!</span>
            </div>
          </div>
        </ScrollReveal>

        {/* Pricing Cards Grid */}
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
