'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Instrument_Serif } from 'next/font/google';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { KlikUmrohBrand } from '../KlikUmrohBrand';
import styles from './MarketingUi.module.css';

// Same display serif as the marketing landing (MarketingV3View) for the card title.
const serif = Instrument_Serif({ weight: '400', subsets: ['latin'], variable: '--km-font-display', display: 'swap' });

/** Full-page frame of a marketing sign-in page: grey background, content centred, serif font loaded. */
export const AuthPage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main className={`${styles.authPage} ${serif.variable}`}>
    <div className={styles.authWrapper}>
      <div className={styles.authContainer}>{children}</div>
    </div>
  </main>
);

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  /** Page-level error shown above the form (role="alert"). */
  error?: string | null;
  children: React.ReactNode;
  /** Content under a divider at the bottom of the card (the link to the other page). */
  footer?: React.ReactNode;
  /** Line under the card, for example "Koneksi Terenkripsi HTTPS". */
  trust?: string;
  /** Where the logo links to. */
  brandHref?: string;
  /** Render only the card (for a loading state): no logo, header, or trust line. */
  bare?: boolean;
}

/** Logo above a white card with a serif title, then the form, a divider footer, and a trust line. */
export const AuthCard: React.FC<AuthCardProps> = ({ title, subtitle, error, children, footer, trust, brandHref = '/marketing', bare }) => {
  // A new error takes keyboard focus (GOV.UK validation pattern), so the user is told what went wrong
  // and screen readers read it; role="alert" alone leaves the focus where it was.
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  if (bare) return <div className={styles.card}>{children}</div>;
  return (
    <>
      <div className={styles.brandHeader}>
        <Link href={brandHref} className={styles.brandLink} aria-label="KlikUmroh.id">
          <KlikUmrohBrand theme="light" iconSize={34} showBadge={true} />
        </Link>
      </div>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h1 className={styles.cardTitle}>{title}</h1>
          {subtitle ? <p className={styles.cardSubtitle}>{subtitle}</p> : null}
        </div>
        {error ? (
          <div className={styles.errorBanner} role="alert" tabIndex={-1} ref={errorRef}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
            <span><span className={styles.visuallyHidden}>Kesalahan: </span>{error}</span>
          </div>
        ) : null}
        {children}
        {footer ? <div className={styles.cardFooter}>{footer}</div> : null}
      </div>
      {trust ? (
        <div className={styles.trust}>
          <ShieldCheck size={14} aria-hidden="true" />
          <span>{trust}</span>
        </div>
      ) : null}
    </>
  );
};
