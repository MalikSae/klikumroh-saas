'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Clock,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import styles from './login.module.css';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<{
    travelName: string;
    dashboardUrl: string;
  } | null>(null);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email dan kata sandi wajib diisi');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setPendingNotice(null);

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

      // Store auth session
      if (typeof window !== 'undefined') {
        if (data.token) {
          localStorage.setItem('klikumroh_token', data.token);
          // Also set cookie so middleware or other tabs can read it
          document.cookie = `klikumroh_token=${encodeURIComponent(data.token)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        }
        if (data.user) {
          localStorage.setItem('klikumroh_user', JSON.stringify(data.user));
          if (data.user.tenant_name) {
            localStorage.setItem('klikumroh_travel_name', data.user.tenant_name);
          }
        }
      }

      if (data.tenant_status === 'active') {
        const isLocal =
          typeof window !== 'undefined' &&
          (window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.endsWith('.local'));

        // In local dev, dashboard runs on a different port (5175) so
        // localStorage doesn't transfer cross-origin.  Pass credentials
        // via URL fragment (hash) so the dashboard can pick them up.
        let targetDashboardUrl: string;
        if (isLocal) {
          const authPayload = encodeURIComponent(
            JSON.stringify({ token: data.token, user: data.user })
          );
          targetDashboardUrl = `http://localhost:5175/#auth=${authPayload}`;
        } else {
          targetDashboardUrl = '/';
        }

        setLoginSuccess({
          travelName: data.user?.tenant_name || 'Travel Anda',
          dashboardUrl: targetDashboardUrl,
        });

        // Redirect after brief delay
        setTimeout(() => {
          if (isLocal) {
            window.location.href = targetDashboardUrl;
          } else {
            router.push(targetDashboardUrl);
          }
        }, 1200);
      } else {
        setPendingNotice(
          'Akun Anda sedang menunggu verifikasi pembayaran dari tim KlikUmroh. Akses dashboard akan aktif begitu verifikasi selesai.'
        );
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat masuk. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.loginPage}>
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.logoWrapper}>
            <Image
              src="/klikumroh-logo.png"
              alt="KlikUmroh.id"
              width={160}
              height={44}
              priority
              style={{ objectFit: 'contain' }}
            />
          </div>
          <h1 className={styles.title}>Dashboard Travel KlikUmroh</h1>
          <p className={styles.subtitle}>
            Masuk ke sistem manajemen agen dan travel Anda
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className={styles.errorBanner} role="alert">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{error}</span>
          </div>
        )}

        {/* Pending Notice */}
        {pendingNotice && (
          <div className={styles.pendingBanner} role="status">
            <Clock size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div className={styles.pendingTitle}>Menunggu Verifikasi</div>
              <div>{pendingNotice}</div>
            </div>
          </div>
        )}

        {/* Success State */}
        {loginSuccess ? (
          <div className={styles.successCard}>
            <div className={styles.successIconWrapper}>
              <CheckCircle2 size={32} />
            </div>
            <h2 className={styles.successTitle}>Login Berhasil!</h2>
            <p className={styles.successDesc}>
              Selamat datang kembali, <strong>{loginSuccess.travelName}</strong>.
              Sedang mengarahkan ke dashboard travel...
            </p>
            <a
              href={loginSuccess.dashboardUrl}
              className={styles.dashboardRedirectBtn}
            >
              Buka Dashboard Travel Sekarang
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
              <label htmlFor="login-password" className={styles.label}>
                Kata Sandi
              </label>
              <div className={styles.inputWrapper}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
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
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Memproses...
                </>
              ) : (
                <>
                  Masuk ke Dashboard
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer Links */}
        <div className={styles.footerLinks}>
          <div className={styles.signupPrompt}>
            Belum punya akun travel?{' '}
            <Link href="/checkout" className={styles.signupLink}>
              Daftar langganan
            </Link>
          </div>
          <Link href="/marketing" className={styles.backHomeLink}>
            <ArrowLeft size={14} />
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.loginPage}>
          <div className={`${styles.card} ${styles.loadingCard}`}>
            <Loader2 size={32} className={styles.loadingSpinner} />
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
