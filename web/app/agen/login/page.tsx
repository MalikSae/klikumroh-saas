'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LogIn,
  Lock,
  Mail,
  AlertCircle,
  UserPlus,
  Eye,
  EyeOff,
  MessageCircle,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { PublicHeader } from '../../../components/PublicHeader';
import { BottomNavbar } from '../../../components/BottomNavbar';
import { Button } from '../../../components/Button';
import designTokens from '../../../../design-tokens.json';
import './AgenLogin.css';

interface TenantInfo {
  name?: string;
  brand_primary_color?: string;
  brand_logo_url?: string;
  whatsapp_number?: string;
  ppiu_number?: string;
}

export default function AgenLoginPage() {
  const router = useRouter();

  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/public/tenant-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setTenantInfo(data);
      })
      .catch(() => {});
  }, []);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Silakan isi alamat email dan password Anda');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/agent/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMessage(json.error || 'Email atau password salah');
        return;
      }

      const token = json.token || json.data?.token;
      if (token) {
        localStorage.setItem('agent_token', token);
        const agentData = json.agent || json.data?.agent;
        const resolvedTenantName = agentData?.tenant_name || json.tenant_name || tenantInfo?.name;
        if (resolvedTenantName) {
          localStorage.setItem('klikumroh_agent_tenant_name', resolvedTenantName);
        }
        if (agentData?.name) {
          localStorage.setItem('klikumroh_agent_name', agentData.name);
        }
        const agentStatus = agentData?.status;
        if (agentStatus === 'active') {
          router.push('/agen/dashboard');
        } else {
          router.push('/agen/status');
        }
      } else {
        setErrorMessage('Gagal menerima sesi autentikasi agen');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan koneksi. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const layoutStyle = Object.fromEntries(
    Object.entries(designTokens.publicConversionLayout).map(([key, value]) => ['--cro-' + key, value])
  );
  const brandingStyle = tenantInfo?.brand_primary_color
    ? { '--tw-brand-primary': tenantInfo.brand_primary_color }
    : {};

  const waNumber = tenantInfo?.whatsapp_number || '6281234567890';
  const helpWaUrl = `https://wa.me/${waNumber}?text=Halo%20Admin%2C%20saya%20mitra%20agen%20${encodeURIComponent(tenantInfo?.name || 'travel')}%20butuh%20bantuan%20login%20akun`;

  return (
    <div
      className="tw-agen-login-wrap"
      style={{ ...layoutStyle, ...brandingStyle } as React.CSSProperties}
    >
      <MobileContainer>
        {/* 1. App Bar Header (Back button + Title, Logo is strictly Home only) */}
        <PublicHeader
          title="Akun Saya"
          showBack={true}
          onBackClick={handleBack}
          backHref="/"
          hideNotification={true}
        />

        <div className="tw-agen-login-body">
          {/* 2. Page Header Banner */}
          <div className="tw-agen-login-header">
            <span className="tw-agen-login-tag">
              {tenantInfo?.name || 'Portal Mitra Agen'}
            </span>
            <h1 className="tw-agen-login-title">
              Masuk ke Akun Agen
            </h1>
            <p className="tw-agen-login-subtitle">
              Akses dashboard kemitraan, pantau komisi, dan kelola calon jamaah Anda.
            </p>
          </div>

          {/* 3. Error Alert Banner */}
          {errorMessage && (
            <div className="tw-agen-login-alert" role="alert">
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 4. Login Form Card */}
          <form onSubmit={handleSubmit} className="tw-agen-login-card">
            {/* Email Field */}
            <div className="tw-agen-login-field">
              <label className="tw-agen-login-label" htmlFor="login-email">
                Alamat Email
              </label>
              <div className="tw-agen-login-input-wrap">
                <Mail size={16} className="tw-agen-login-icon-left" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="tw-agen-login-input"
                  disabled={isSubmitting}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="tw-agen-login-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="tw-agen-login-label" htmlFor="login-password" style={{ margin: 0 }}>
                  Password
                </label>
                <a
                  href={`https://wa.me/${waNumber}?text=Halo%20Admin%2C%20saya%20mitra%20agen%20${encodeURIComponent(tenantInfo?.name || 'travel')}%20lupa%20password%20akun%20saya%20(Email%3A%20${encodeURIComponent(email || '-')})`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '12px',
                    color: 'var(--tw-brand-primary, #0D9488)',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  Lupa password?
                </a>
              </div>
              <div className="tw-agen-login-input-wrap">
                <Lock size={16} className="tw-agen-login-icon-left" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password Anda"
                  className="tw-agen-login-input"
                  disabled={isSubmitting}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="tw-agen-login-toggle-pw"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div style={{ marginTop: '4px' }}>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isSubmitting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <LogIn size={18} />
                <span>{isSubmitting ? 'Memproses Masuk...' : 'Masuk ke Dashboard'}</span>
              </Button>
            </div>

            {/* Help Link */}
            <a
              href={helpWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tw-agen-login-help"
            >
              <MessageCircle size={14} />
              <span>Kendala login? Hubungi Admin</span>
            </a>
          </form>

          {/* 5. Registration CTA Card */}
          <div className="tw-agen-login-register-card">
            <h2 className="tw-agen-login-register-title">
              Belum Menjadi Mitra Agen {tenantInfo?.name || 'Kami'}?
            </h2>
            <p className="tw-agen-login-register-desc">
              Daftar sekarang untuk mendapatkan link referral resmi dan potensi komisi per jamaah.
            </p>
            <Link
              href="/agen/daftar"
              className="tw-button tw-button--secondary tw-button--sm"
              style={{
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '4px',
              }}
            >
              <UserPlus size={16} />
              <span>Daftar Jadi Mitra Agen</span>
            </Link>
          </div>
        </div>
      </MobileContainer>

      {/* 6. Persistent Bottom Navigation */}
      <BottomNavbar waNumber={tenantInfo?.whatsapp_number || undefined} />
    </div>
  );
}
