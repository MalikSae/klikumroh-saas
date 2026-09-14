'use client';

import React from 'react';
import { Globe, Link as LinkIcon, ShieldCheck, Download, Building2, Compass, Moon, ArrowUpRight } from 'lucide-react';
import styles from './MarketingWhitelabelTrust.module.css';

const TRUST_POINTS = [
  { icon: Globe, text: 'Website dan portal agen berbrand travel' },
  { icon: LinkIcon, text: 'Gunakan domain milik travel' },
  { icon: ShieldCheck, text: 'Data setiap travel dipisahkan' },
  { icon: Download, text: 'Data prospek dapat diekspor' },
];

const TENANTS = [
  {
    name: 'Al-Barakah Travel',
    domain: 'albarakahumroh.id',
    icon: Building2,
  },
  {
    name: 'Safar Madani',
    domain: 'safarmadani.com',
    icon: Compass,
  },
  {
    name: 'Nabawi Tour',
    domain: 'umroh.nabawitour.id',
    icon: Moon,
  },
];

export const MarketingWhitelabelTrust: React.FC = () => {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        {/* Left: Copy & Checklist */}
        <div className={styles.whitelabelCopy}>
          <span className={styles.eyebrow}>TETAP MILIK TRAVEL ANDA</span>
          <h2 className={styles.headline}>
            Jamaah dan agen berinteraksi dengan brand travel Anda.
          </h2>
          <p className={styles.body}>
            KlikUmroh bekerja di belakang layar. Website publik dan portal agen dapat memakai logo, warna, serta domain resmi travel Anda.
          </p>

          <div className={styles.trustList}>
            {TRUST_POINTS.map((pt, idx) => {
              const IconComp = pt.icon;
              return (
                <div key={idx} className={styles.trustItem}>
                  <div className={styles.trustIconBox}>
                    <IconComp size={16} className={styles.trustIcon} />
                  </div>
                  <span className={styles.trustText}>{pt.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Tenant Brands Preview */}
        <div className={styles.previewColumn}>
          <span className={styles.previewCaption}>CONTOH BRANDING TIGA TRAVEL</span>
          <div className={styles.tenantList}>
            {TENANTS.map((t, idx) => {
              const IconComp = t.icon;
              return (
                <div key={idx} className={styles.tenantCard}>
                  <div className={styles.tenantBrand}>
                    <div className={styles.tenantMark}>
                      <IconComp size={20} className={styles.tenantMarkIcon} />
                    </div>
                    <div className={styles.tenantInfo}>
                      <span className={styles.tenantName}>{t.name}</span>
                      <span className={styles.tenantDomain}>{t.domain}</span>
                    </div>
                  </div>
                  <ArrowUpRight size={18} className={styles.tenantArrow} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
