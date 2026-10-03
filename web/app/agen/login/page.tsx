'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { PublicHeader } from '../../../components/PublicHeader';
import { PublicFooter } from '../../../components/PublicFooter';
import { BrandMark } from '../../../components/BrandMark';
import { whatsappLink } from '../../../lib/usePlatformSettings';
import { Button } from '../../../components/Button';
import designTokens from '../../../../design-tokens.json';
import './AgenLogin.css';

interface TenantInfo {
  name?: string;
  brand_primary_color?: string;
  brand_logo_url?: string;
  brand_icon_url?: string;
  whatsapp_number?: string;
  ppiu_number?: string;
  address?: string;
  phone?: string;
  email?: string;
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
    } catch (err: unknown) {
      setErrorMessage((err instanceof Error && err.message) || 'Terjadi kesalahan koneksi. Silakan coba lagi.');
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

  // No travel WhatsApp number -> hide the help link instead of pointing to a placeholder number.
  const travelLabel = tenantInfo?.name || 'travel';
  const helpWaUrl = whatsappLink(
    tenantInfo?.whatsapp_number,
    email.trim()
      ? `Halo Admin, saya mitra agen ${travelLabel} lupa password / tidak bisa masuk (email: ${email.trim()})`
      : `Halo Admin, saya mitra agen ${travelLabel} lupa password / tidak bisa masuk`
  );

  return (
    <div className="tw-agen-login-wrap" style={{ ...layoutStyle, ...brandingStyle } as React.CSSProperties}>
      <MobileContainer>
        <PublicHeader title="Masuk Agen" showBack={true} onBackClick={handleBack} backHref="/" hideNotification={true} />

        <div className="tw-agen-login-body">
          <div className="tw-agen-login-header">
            <BrandMark name={tenantInfo?.name} logoUrl={tenantInfo?.brand_logo_url} iconUrl={tenantInfo?.brand_icon_url} fallback="Portal Mitra Agen" />
            <h1 className="tw-agen-login-title">Masuk ke akun agen</h1>
            <p className="tw-agen-login-subtitle">Pantau komisi dan calon jamaah Anda.</p>
          </div>

          {errorMessage && (
            <p className="tw-agen-login-alert" role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <span>{errorMessage}</span>
            </p>
          )}

          <form onSubmit={handleSubmit} className="tw-agen-login-form">
            <div className="tw-agen-login-field">
              <label className="tw-field-label" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="tw-field"
                disabled={isSubmitting}
                autoComplete="email"
                required
              />
            </div>

            <div className="tw-agen-login-field">
              <label className="tw-field-label" htmlFor="login-password">
                Password
              </label>
              <div className="tw-agen-login-pw">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password Anda"
                  className="tw-field tw-field--pw"
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
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting} className="tw-agen-login-submit">
              {isSubmitting ? 'Memproses...' : 'Masuk'}
            </Button>

            {helpWaUrl && (
              <a href={helpWaUrl} target="_blank" rel="noopener noreferrer" className="tw-agen-login-link">
                Lupa password? Hubungi admin
              </a>
            )}
          </form>

          <p className="tw-agen-login-register">
            Belum jadi mitra {tenantInfo?.name || 'kami'}?{' '}
            <Link href="/agen/daftar" className="tw-agen-login-link">
              Daftar sekarang
            </Link>
          </p>
        </div>

        <PublicFooter
          tenantName={tenantInfo?.name}
          address={tenantInfo?.address}
          phone={tenantInfo?.phone}
          whatsappNumber={tenantInfo?.whatsapp_number}
          email={tenantInfo?.email}
          ppiuNumber={tenantInfo?.ppiu_number}
        />
      </MobileContainer>
    </div>
  );
}
