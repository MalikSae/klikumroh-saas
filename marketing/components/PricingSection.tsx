'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { PricingPlan, fetchPricingPlans, formatRupiah } from '../lib/api';
import { Button } from './Button';
import './PricingSection.css';

interface PricingSectionProps {
  initialPlans?: PricingPlan[];
  title?: string;
  subtitle?: string;
}

const planFeatures = [
  'Website travel whitelabel & custom domain',
  'Sistem referral unik untuk setiap agen',
  'Dashboard travel lengkap (prospek, closing, komisi)',
  'Dashboard agen mobile-first dari smartphone',
  'Katalog paket, form minat, & export CSV',
  'Tools promosi: tips, script WA, bank konten',
  'Target bulanan & leaderboard performa agen',
  'Data terisolasi penuh & access log audit',
];

export const PricingSection: React.FC<PricingSectionProps> = ({
  initialPlans,
  title = 'Pilihan Paket Langganan Travel',
  subtitle = 'Pilih paket yang paling tepat untuk merapikan dan menumbuhkan jaringan agen travel Anda.',
}) => {
  const [plans, setPlans] = useState<PricingPlan[]>(initialPlans || []);
  const [loading, setLoading] = useState<boolean>(!initialPlans || initialPlans.length === 0);

  useEffect(() => {
    if (!initialPlans || initialPlans.length === 0) {
      fetchPricingPlans().then((data) => {
        setPlans(data);
        setLoading(false);
      });
    }
  }, [initialPlans]);

  return (
    <section className="mkt-section" id="harga">
      <div className="mkt-container">
        <div className="mkt-section-header">
          <h2 className="mkt-headline">{title}</h2>
          <p className="mkt-subheadline">{subtitle}</p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--mkt-text-muted)' }}>
            Memuat daftar paket harga...
          </div>
        ) : (
          <div className="mkt-pricing-grid">
            {plans.map((plan) => {
              const isFeatured = plan.period_months === 12;
              const perMonth = Math.round(plan.price / plan.period_months);

              return (
                <div
                  key={plan.id}
                  className={`mkt-pricing-card ${isFeatured ? 'mkt-pricing-card--featured' : ''}`}
                >
                  {isFeatured && (
                    <span className="mkt-pricing-card__badge">Paling Hemat</span>
                  )}

                  <div>
                    <div className="mkt-pricing-card__header">
                      <h3 className="mkt-pricing-card__name">Paket {plan.name}</h3>
                      <p className="mkt-pricing-card__desc">
                        Akses penuh seluruh fitur KlikUmroh selama {plan.period_months} bulan.
                      </p>
                    </div>

                    <div className="mkt-pricing-card__price-wrapper">
                      <div className="mkt-pricing-card__price">
                        {formatRupiah(plan.price)}
                      </div>
                      <div className="mkt-pricing-card__period">
                        Setara {formatRupiah(perMonth)} / bulan
                      </div>
                    </div>

                    <ul className="mkt-pricing-card__features">
                      {planFeatures.map((feat, idx) => (
                        <li key={idx} className="mkt-pricing-card__feature-item">
                          <Check className="mkt-pricing-card__feature-icon" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mkt-pricing-card__action">
                    <Link href={`/daftar?plan=${plan.id}`} style={{ textDecoration: 'none' }}>
                      <Button
                        variant={isFeatured ? 'primary' : 'secondary'}
                        fullWidth
                      >
                        Pilih Plan Ini
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
