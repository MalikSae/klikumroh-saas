'use client';

import React from 'react';
import { Globe, Link as LinkIcon, ShieldCheck, Download, Building2, Compass, Moon, ArrowUpRight } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import styles from './MarketingWhitelabelTrust.module.css';

const TRUST_POINTS = [
  { icon: Globe, text: 'Website dan portal agen 100% berbrand travel Anda' },
  { icon: LinkIcon, text: 'Gunakan custom domain resmi milik travel' },
  { icon: ShieldCheck, text: 'Database terisolasi ketat antar-tenant & terenkripsi' },
  { icon: Download, text: 'Data prospek & agen dapat diekspor ke Excel/CSV kapan saja' },
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
  const [customName, setCustomName] = React.useState('Al-Barakah Tour');

  const slug = customName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'travelanda';

  const domainSlug = customName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'travelanda';

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        {/* Left: Copy & Checklist */}
        <ScrollReveal as="div" className={styles.whitelabelCopy} animation="fade-up">
          <span className={styles.eyebrow}>TETAP MILIK TRAVEL ANDA</span>
          <h2 className={styles.headline}>
            Jamaah dan agen berinteraksi dengan brand travel Anda.
          </h2>
          <p className={styles.body}>
            KlikUmroh bekerja di belakang layar secara whitelabel. Website publik dan portal agen memakai logo, warna identitas, serta domain resmi biro travel Anda.
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

          <div className={styles.securityCallout}>
            <ShieldCheck size={20} className={styles.securityIcon} />
            <div className={styles.securityTextGroup}>
              <span className={styles.securityTitle}>Jaminan Privasi & Keamanan Data</span>
              <p className={styles.securityDesc}>
                Data jamaah dan prospek adalah aset eksklusif biro travel Anda. KlikUmroh menerapkan arsitektur isolasi multi-tenant ketat — kami tidak pernah mengakses, mengontak, atau membagikan database Anda ke pihak mana pun.
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* Right: Tenant Brands & Live Simulator */}
        <div className={styles.previewColumn}>
          {/* Interactive Live Simulator */}
          <ScrollReveal as="div" className={styles.simulatorCard} animation="scale-up" delay={80}>
            <div className={styles.simulatorHeader}>
              <span className={styles.simulatorBadge}>SIMULASI DOMAIN WHITELABEL</span>
              <span className={styles.simulatorHint}>Coba ketik nama travel Anda:</span>
            </div>
            
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Ketik nama travel Anda..."
              className={styles.simulatorInput}
              maxLength={36}
            />

            <div className={styles.domainPreviewBox}>
              <div className={styles.domainRow}>
                <span className={styles.domainType}>Subdomain Bawaan:</span>
                <div className={styles.domainBadge}>
                  <ShieldCheck size={14} className={styles.sslIcon} />
                  <span className={styles.domainUrl}>https://{slug}.klikumroh.id</span>
                </div>
              </div>

              <div className={styles.domainRow}>
                <span className={styles.domainType}>Custom Domain Sendiri:</span>
                <div className={styles.domainBadge}>
                  <ShieldCheck size={14} className={styles.sslIcon} />
                  <span className={styles.domainUrl}>https://umroh.{domainSlug}.com</span>
                </div>
              </div>
            </div>
          </ScrollReveal>

          <span className={styles.previewCaption}>CONTOH BRANDING LAINNYA</span>
          <div className={styles.tenantList}>
            {TENANTS.map((t, idx) => {
              const IconComp = t.icon;
              return (
                <ScrollReveal
                  key={idx}
                  as="div"
                  className={styles.tenantCard}
                  animation="fade-up"
                  delay={idx * 100}
                >
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
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
