'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Instrument_Serif } from 'next/font/google';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { KlikUmrohBrand } from '@/components/marketing/KlikUmrohBrand';
import { clearDashboardSession, dashboardUrl, openDashboard, storeDashboardSession } from '@/lib/dashboardSession';
import { isBlankPassword } from '@/lib/passwordRules';
import styles from './login.module.css';

// Same display serif as the marketing landing (MarketingV3View) for the headings.
const serif = Instrument_Serif({ weight: '400', subsets: ['latin'], variable: '--km-font-display', display: 'swap' });

function LoginForm() {
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<{
    travelName: string;
    dashboardUrl: string;
    isPending: boolean;
  } | null>(null);

  // Opening the login page ends any session saved on this site. In local dev the dashboard runs on
  // another origin, so its logout cannot clear this copy itself.
  useEffect(() => {
    clearDashboardSession();
  }, []);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The password is sent as typed (never trimmed); only spaces counts as empty.
    if (!email.trim() || isBlankPassword(password)) {
      setError('Email dan kata sandi wajib diisi');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Login gagal, periksa email dan kata sandi Anda');
      }

      // Active and pending travels both go to the dashboard. A pending travel lands on its
      // billing page there (AppFrame redirects it) until the first payment is approved.
      storeDashboardSession(data);
      const targetDashboardUrl = dashboardUrl(data);
      setLoginSuccess({
        travelName: data.user?.tenant_name || 'Travel Anda',
        dashboardUrl: targetDashboardUrl,
        isPending: data.tenant_status === 'pending',
      });
      setTimeout(() => openDashboard(targetDashboardUrl), 1200);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat masuk. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={`${styles.loginPage} ${serif.variable}`}>
      {/* Main Content Area */}
      <div className={styles.contentWrapper}>
        <div className={styles.cardContainer}>
          {/* Brand Presentation */}
          <div className={styles.brandHeader}>
            <Link href="/marketing" className={styles.brandLink} aria-label="KlikUmroh.id">
              <KlikUmrohBrand theme="light" iconSize={34} showBadge={true} />
            </Link>
          </div>

          {/* Login Card */}
          <div className={styles.card}>
            {/* Header Text */}
            <div className={styles.header}>
              <h1 className={styles.title}>Masuk ke Dashboard Travel</h1>
              <p className={styles.subtitle}>
                Kelola prospek, sistem agen referral, dan paket umroh travel Anda
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div className={styles.errorBanner} role="alert">
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>{error}</span>
              </div>
            )}

            {loginSuccess ? (
              <div className={styles.successCard} role="status">
                <div className={styles.successIconWrapper}>
                  <CheckCircle2 size={28} />
                </div>
                <h2 className={styles.successTitle}>Login Berhasil</h2>
                <p className={styles.successDesc}>
                  Selamat datang kembali, <strong>{loginSuccess.travelName}</strong>.{' '}
                  {loginSuccess.isPending ? 'Mengarahkan ke halaman tagihan...' : 'Mengarahkan ke dashboard travel...'}
                </p>
                <a
                  href={loginSuccess.dashboardUrl}
                  className={styles.dashboardRedirectBtn}
                >
                  <span>Buka Dashboard Sekarang</span>
                  <ArrowRight size={16} />
                </a>
              </div>
            ) : (
              /* Login Form */
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="login-email" className={styles.label}>
                    Email Akun Travel
                  </label>
                  <div className={styles.inputWrapper}>
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@travelanda.com"
                      required
                      autoComplete="email"
                      className={styles.input}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className={styles.fieldGroup}>
                  <div className={styles.labelRow}>
                    <label htmlFor="login-password" className={styles.label}>
                      Kata Sandi
                    </label>
                  </div>
                  <div className={styles.inputWrapper}>
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan kata sandi akun"
                      required
                      autoComplete="current-password"
                      className={`${styles.input} ${styles.passwordInput}`}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={styles.togglePasswordBtn}
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={styles.submitBtn}
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className={styles.spinner} />
                      <span>Memverifikasi...</span>
                    </>
                  ) : (
                    <>
                      <span>Masuk ke Dashboard</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Card Footer */}
            <div className={styles.cardFooter}>
              <div className={styles.signupPrompt}>
                <span>Belum berlangganan KlikUmroh?</span>
                <Link href="/marketing/checkout" className={styles.signupLink}>
                  Mulai Berlangganan
                </Link>
              </div>
            </div>
          </div>

          {/* Trust and Security Badge */}
          <div className={styles.trustBadge}>
            <ShieldCheck size={14} className={styles.trustIcon} />
            <span>Koneksi Terenkripsi HTTPS • Data Terisolasi Per-Travel</span>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className={`${styles.loginPage} ${serif.variable}`}>
          <div className={styles.contentWrapper}>
            <div className={styles.cardContainer}>
              <div className={`${styles.card} ${styles.loadingCard}`}>
                <Loader2 size={32} className={styles.loadingSpinner} />
              </div>
            </div>
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
