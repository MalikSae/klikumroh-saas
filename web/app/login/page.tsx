'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { AuthCard, AuthPage, PasswordField, PrimaryButton, TextField } from '@/components/marketing/ui';
import { clearDashboardSession, dashboardUrl, openDashboard, storeDashboardSession } from '@/lib/dashboardSession';
import { isBlankPassword } from '@/lib/passwordRules';
import styles from './login.module.css';

// The server answers in English ("invalid credentials"); the page speaks Indonesian and says what to do next.
function loginErrorText(status: number, serverMessage?: string): string {
  if (status === 401 || serverMessage === 'invalid credentials') {
    return 'Email atau kata sandi salah. Periksa kembali lalu coba masuk lagi.';
  }
  if (status === 429) return 'Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.';
  if (status >= 500) return 'Server sedang bermasalah. Coba lagi beberapa saat lagi.';
  return 'Gagal masuk. Periksa email dan kata sandi Anda, lalu coba lagi.';
}

function LoginForm() {
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        throw new Error(loginErrorText(res.status, data.error));
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
    <AuthPage>
      <AuthCard
        title="Masuk ke Dashboard Travel"
        subtitle="Kelola prospek, sistem agen referral, dan paket umroh travel Anda"
        error={error}
        trust="Koneksi Terenkripsi HTTPS • Data Terisolasi Per-Travel"
        footer={
          <div>
            <span>Belum berlangganan KlikUmroh?</span>
            <Link href="/marketing/checkout">Mulai Berlangganan</Link>
          </div>
        }
      >
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
            <PrimaryButton href={loginSuccess.dashboardUrl}>
              <span>Buka Dashboard Sekarang</span>
              <ArrowRight size={16} />
            </PrimaryButton>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <TextField
              id="login-email"
              type="email"
              label="Email Akun Travel"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@travelanda.com"
              required
              autoComplete="username"
              spellCheck={false}
              readOnly={loading}
            />
            <PasswordField
              id="login-password"
              label="Kata Sandi"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan kata sandi akun"
              required
              autoComplete="current-password"
              readOnly={loading}
            />
            <PrimaryButton type="submit" loading={loading} loadingText="Memverifikasi...">
              <span>Masuk ke Dashboard</span>
              <ArrowRight size={16} />
            </PrimaryButton>
          </form>
        )}
      </AuthCard>
    </AuthPage>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthPage>
          <AuthCard title="" bare>
            <div className={styles.loading}>
              <Loader2 size={32} className={styles.loadingSpinner} />
            </div>
          </AuthCard>
        </AuthPage>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
