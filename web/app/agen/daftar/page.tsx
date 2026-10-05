'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus, Check, CheckCircle2, AlertCircle, FileText, X, Eye, EyeOff, ShieldCheck, RefreshCw } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { PublicHeader } from '../../../components/PublicHeader';
import { PublicFooter } from '../../../components/PublicFooter';
import { BrandMark } from '../../../components/BrandMark';
import { Button } from '../../../components/Button';
import regenciesData from '../../../data/indonesia-regencies.json';
import designTokens from '../../../../design-tokens.json';
import { newPasswordError } from '../../../lib/passwordRules';
import { agentPhoneError } from '../../../lib/agentPhone';
import './AgenDaftar.css';

interface RegistrationInfo {
  tenant_name?: string;
  brand_logo_url?: string;
  brand_icon_url?: string;
  brand_primary_color?: string;
  agent_poster_url?: string;
  agent_registration_fee: number;
  registration_benefits?: string;
  agent_registration_terms?: string;
  agent_bank_name?: string;
  agent_bank_account_number?: string;
  agent_bank_account_holder?: string;
  whatsapp_number?: string;
  address?: string;
  phone?: string;
  email?: string;
  ppiu_number?: string;
}

export default function AgenDaftarPage() {
  const router = useRouter();

  const [regInfo, setRegInfo] = useState<RegistrationInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState<boolean>(true);
  // Registration info (fee, terms) could not be loaded: the fee is unknown, so the page must not claim
  // 'gratis' and sign-up waits until a retry succeeds.
  const [infoError, setInfoError] = useState<boolean>(false);
  const [infoAttempt, setInfoAttempt] = useState<number>(0);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [domisili, setDomisili] = useState('');
  const [domisiliQuery, setDomisiliQuery] = useState('');
  const [domisiliOpen, setDomisiliOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [showTermsModal, setShowTermsModal] = useState(false);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const domisiliRef = useRef<HTMLDivElement>(null);

  // Read referral code from URL query (?ref=) or cookie
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the browser after hydration; not available on the server render
        setReferralCode(ref.toUpperCase().trim());
      } else {
        // ref_code is the cookie /ref/[code] and proxy.ts set; the backend falls back to it too, so the
        // field must show it: an applicant should see (and can change) the upline they will be linked to.
        const cookieMatch = document.cookie.match(/(?:^|;\s*)ref_code=([^;]+)/);
        if (cookieMatch && cookieMatch[1]) {
          setReferralCode(decodeURIComponent(cookieMatch[1]).toUpperCase().trim());
        }
      }
    }
  }, []);

  // Fetch registration info & tenant info
  useEffect(() => {
    const fetchInfo = async () => {
      let regLoaded = false;
      try {
        const [regRes, tenantRes] = await Promise.all([
          fetch('/api/public/agent-registration-info'),
          fetch('/api/public/tenant-info'),
        ]);

        let combined: RegistrationInfo = { agent_registration_fee: 0 };
        if (regRes.ok) {
          const regJson = await regRes.json();
          const info = regJson?.data ?? regJson;
          if (info && typeof info === 'object') {
            // null fee from the API means free (mode 'gratis').
            const fee = typeof info.agent_registration_fee === 'number' ? info.agent_registration_fee : 0;
            combined = { ...combined, ...info, agent_registration_fee: fee };
            regLoaded = true;
          }
        }
        if (tenantRes.ok) {
          const tenantJson = await tenantRes.json();
          combined = {
            ...combined,
            tenant_name: combined.tenant_name || tenantJson.name,
            brand_primary_color: combined.brand_primary_color || tenantJson.brand_primary_color,
            brand_logo_url: tenantJson.brand_logo_url || combined.brand_logo_url,
            brand_icon_url: tenantJson.brand_icon_url,
            whatsapp_number: tenantJson.whatsapp_number,
            address: tenantJson.address,
            phone: tenantJson.phone,
            email: tenantJson.email,
            ppiu_number: tenantJson.ppiu_number,
          };
        }
        setRegInfo(combined);
      } catch (err) {
        console.error('Failed to load agent registration info', err);
      } finally {
        setInfoError(!regLoaded);
        setLoadingInfo(false);
      }
    };
    fetchInfo();
  }, [infoAttempt]);

  const retryInfo = () => {
    setLoadingInfo(true);
    setInfoError(false);
    setInfoAttempt((n) => n + 1);
  };

  // Close domisili dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (domisiliRef.current && !domisiliRef.current.contains(e.target as Node)) {
        setDomisiliOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  // Filter regencies
  const filteredRegencies =
    domisiliQuery.trim().length >= 2
      ? (regenciesData as Array<{ code: string; name: string }>)
        .filter((item) =>
          item.name.toLowerCase().includes(domisiliQuery.toLowerCase())
        )
        .slice(0, 15)
      : [];

  const handleSelectDomisili = (item: { code: string; name: string }) => {
    setDomisili(item.name);
    setDomisiliQuery(item.name);
    setDomisiliOpen(false);
    if (errors.domisili) {
      setErrors((prev) => ({ ...prev, domisili: '' }));
    }
  };

  const validate = () => {
    const errs: { [key: string]: string } = {};

    if (!name.trim() || name.trim().length < 2) {
      errs.name = 'Nama lengkap minimal 2 karakter';
    }

    // Same rule as the backend (validateAgentPhone): 08xx / 62xx / +62xx, normalized to 62 + 8-13 digits.
    const phoneErr = agentPhoneError(phone);
    if (phoneErr) {
      errs.phone = phoneErr;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      errs.email = 'Format email tidak valid';
    }

    if (!domisili) {
      errs.domisili = 'Silakan pilih kabupaten/kota domisili dari daftar';
    }

    // Sent as typed (never trimmed); spaces at the ends do not count towards the minimum.
    if (newPasswordError(password)) {
      errs.password = 'Password minimal 8 karakter';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // The fee must be known before signing up (the status page asks for it right after).
    if (loadingInfo || infoError) return;
    if (!validate()) return;

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/public/agents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          password,
          domisili,
          terms_accepted: true,
          // Always sent: "" means "no upline" (the backend falls back to the ref_code cookie only when the
          // key is absent). The field is prefilled from that cookie, so an empty field is the applicant's choice.
          referral_code: referralCode.trim().toUpperCase(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setSubmitError(json.error || 'Email atau nomor telepon sudah terdaftar');
        } else {
          setSubmitError(json.error || 'Gagal mendaftar agen. Silakan coba lagi.');
        }
        return;
      }

      // Auto login
      const token = json.token || json.data?.token;
      if (token) {
        localStorage.setItem('agent_token', token);
        router.push('/agen/status');
      } else {
        router.push('/agen/login');
      }
    } catch (err: unknown) {
      setSubmitError((err instanceof Error && err.message) || 'Terjadi kesalahan koneksi. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRupiah = (val: number) => {
    return 'Rp ' + val.toLocaleString('id-ID');
  };

  const parseBenefits = (text?: string) => {
    if (!text) return { title: 'Benefit & Fasilitas Agen', items: [] as string[] };
    const rawLines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (rawLines.length === 0) return { title: 'Benefit & Fasilitas Agen', items: [] as string[] };

    const firstLineIsTitle =
      /^(benefit|fasilitas|keuntungan|keunggulan)/i.test(rawLines[0]) &&
      !rawLines[0].includes('(') &&
      !/^[-*•\d+.]/.test(rawLines[0]);

    let title = firstLineIsTitle ? rawLines[0] : 'Benefit & Fasilitas Agen';
    if (/benefit\s*&\s*fasilitas\s*pendaftaran\s*agen/i.test(title)) {
      title = 'Benefit & Fasilitas Agen';
    }
    const itemLines = firstLineIsTitle ? rawLines.slice(1) : rawLines;
    const items = itemLines.map((line) => line.replace(/^[-*•\d+.]\s*/, '').trim()).filter(Boolean);

    return { title, items };
  };

  const benefitsData = parseBenefits(regInfo?.registration_benefits);

  const layoutStyle = Object.fromEntries(
    Object.entries(designTokens.publicConversionLayout).map(([key, value]) => ['--cro-' + key, value])
  );
  const brandingStyle = regInfo?.brand_primary_color
    ? ({
      '--tw-brand-primary': regInfo.brand_primary_color,
      '--tw-focus-ring': `color-mix(in srgb, ${regInfo.brand_primary_color} 18%, transparent)`,
    } as React.CSSProperties)
    : undefined;

  return (
    <div
      className="tw-agen-daftar-wrap"
      style={{ ...layoutStyle, ...brandingStyle } as React.CSSProperties}
    >
      <MobileContainer>
        {/* 1. Header Sub-page (Logo strictly Home only) */}
        <PublicHeader
          title="Daftar Mitra Agen"
          showBack={true}
          onBackClick={handleBack}
          backHref="/"
          hideNotification={true}
        />

        <div className="tw-agen-daftar-body">
          {/* 2. Page Header Banner */}
          <div className="tw-agen-daftar-header">
            <BrandMark name={regInfo?.tenant_name} logoUrl={regInfo?.brand_logo_url} iconUrl={regInfo?.brand_icon_url} fallback="Kemitraan Resmi" />
            <h1 className="tw-agen-daftar-title">
              Pendaftaran Mitra Agen
            </h1>
            <p className="tw-agen-daftar-subtitle">
              Mulai syiar paket umroh {regInfo?.tenant_name ? `bersama ${regInfo.tenant_name}` : ''}, dapatkan fasilitas link referral resmi dan komisi berkah.
            </p>
          </div>

          {/* 3. Poster Promosi Agen (Rasio 1:1) jika diupload */}
          {!loadingInfo && regInfo?.agent_poster_url && (
            <div className="tw-agen-daftar-poster-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element -- poster uploaded by the travel, served as-is */}
              <img
                src={regInfo.agent_poster_url}
                alt="Poster Kemitraan Agen"
                className="tw-agen-daftar-poster-img"
              />
            </div>
          )}

          {/* 4. Biaya & keuntungan: main content, straight from Pengaturan > Aturan agen. */}
          {!loadingInfo && infoError && (
            <div className="tw-agen-daftar-alert" role="alert">
              <AlertCircle size={18} className="tw-agen-daftar-alert__icon" aria-hidden="true" />
              <span className="tw-agen-daftar-alert__text">Info biaya pendaftaran belum bisa dimuat. Pendaftaran bisa dilanjutkan setelah info ini tampil.</span>
              <button type="button" className="tw-agen-daftar-alert__retry" onClick={retryInfo}>
                <RefreshCw size={16} aria-hidden="true" />
                Coba lagi
              </button>
            </div>
          )}

          {!loadingInfo && !infoError && regInfo && (
            <section className="tw-agen-daftar-offer" aria-label="Biaya dan keuntungan menjadi agen">
              <div className="tw-agen-daftar-offer__fee">
                {regInfo.agent_registration_fee > 0 ? (
                  <>
                    <span className="tw-agen-daftar-offer__label">Investasi kemitraan</span>
                    <span className="tw-agen-daftar-offer__amount">
                      {formatRupiah(regInfo.agent_registration_fee)}
                      <span className="tw-agen-daftar-offer__unit">sekali bayar</span>
                    </span>
                  </>
                ) : (
                  <span className="tw-agen-daftar-offer__amount">Pendaftaran mitra gratis</span>
                )}
              </div>

              {benefitsData.items.length > 0 && (
                <>
                  <h2 className="tw-agen-daftar-offer__title">{benefitsData.title}</h2>
                  <ul className="tw-agen-daftar-offer__list">
                    {benefitsData.items.map((item, idx) => (
                      <li key={idx} className="tw-agen-daftar-offer__item">
                        <Check size={16} className="tw-agen-daftar-offer__check" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {/* 5. Global Error Banner */}
          {submitError && (
            <div className="tw-agen-daftar-alert" role="alert">
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{submitError}</span>
            </div>
          )}

          {/* 6. Registration Form Card */}
          <form onSubmit={handleSubmit} className="tw-agen-daftar-card">
            {/* Nama Lengkap */}
            <div className="tw-agen-daftar-field">
              <label className="tw-agen-daftar-label" htmlFor="agent-name">
                Nama Lengkap <span className="tw-agen-daftar-required">*</span>
              </label>
              <div className="tw-agen-daftar-input-wrap">
                <input
                  id="agent-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                  }}
                  placeholder="Nama lengkap sesuai KTP"
                  className={`tw-agen-daftar-input ${errors.name ? 'tw-agen-daftar-input--error' : ''}`}
                  disabled={isSubmitting}
                  autoComplete="name"
                  required
                />
              </div>
              {errors.name && <span className="tw-agen-daftar-error-text">{errors.name}</span>}
            </div>

            {/* Nomor WhatsApp */}
            <div className="tw-agen-daftar-field">
              <label className="tw-agen-daftar-label" htmlFor="agent-phone">
                Nomor WhatsApp <span className="tw-agen-daftar-required">*</span>
              </label>
              <div className="tw-agen-daftar-input-wrap">
                <input
                  id="agent-phone"
                  type="tel"
                  inputMode="tel"
                  maxLength={24}
                  value={phone}
                  onChange={(e) => {
                    // Kept as typed: validate() refuses letters with a clear message instead of silently dropping them.
                    setPhone(e.target.value);
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
                  }}
                  placeholder="081234567890"
                  className={`tw-agen-daftar-input ${errors.phone ? 'tw-agen-daftar-input--error' : ''}`}
                  disabled={isSubmitting}
                  autoComplete="tel"
                  required
                />
              </div>
              {errors.phone && <span className="tw-agen-daftar-error-text">{errors.phone}</span>}
            </div>

            {/* Email */}
            <div className="tw-agen-daftar-field">
              <label className="tw-agen-daftar-label" htmlFor="agent-email">
                Alamat Email <span className="tw-agen-daftar-required">*</span>
              </label>
              <div className="tw-agen-daftar-input-wrap">
                <input
                  id="agent-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  placeholder="email@domain.com"
                  className={`tw-agen-daftar-input ${errors.email ? 'tw-agen-daftar-input--error' : ''}`}
                  disabled={isSubmitting}
                  autoComplete="email"
                  required
                />
              </div>
              {errors.email && <span className="tw-agen-daftar-error-text">{errors.email}</span>}
            </div>

            {/* Domisili (Autocomplete 514 Kab/Kota) */}
            <div className="tw-agen-daftar-field" ref={domisiliRef} style={{ position: 'relative' }}>
              <label className="tw-agen-daftar-label" htmlFor="agent-domisili">
                Domisili (Kabupaten / Kota) <span className="tw-agen-daftar-required">*</span>
              </label>
              <div className="tw-agen-daftar-input-wrap">
                <input
                  id="agent-domisili"
                  type="text"
                  value={domisiliQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDomisiliQuery(val);
                    setDomisili(''); // Typing clears the pick: only an option from the list counts.
                    setDomisiliOpen(true);
                    if (errors.domisili) setErrors((prev) => ({ ...prev, domisili: '' }));
                  }}
                  onFocus={() => {
                    if (domisiliQuery.trim().length >= 2) setDomisiliOpen(true);
                  }}
                  placeholder="Ketik minimal 2 huruf kab/kota..."
                  className={`tw-agen-daftar-input ${errors.domisili ? 'tw-agen-daftar-input--error' : ''}`}
                  autoComplete="off"
                  disabled={isSubmitting}
                  required
                />
              </div>
              {errors.domisili && <span className="tw-agen-daftar-error-text">{errors.domisili}</span>}

              {/* Suggestions Dropdown */}
              {domisiliOpen && filteredRegencies.length > 0 && (
                <div className="tw-agen-daftar-dropdown">
                  {filteredRegencies.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => handleSelectDomisili(item)}
                      className="tw-agen-daftar-dropdown-item"
                    >
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Password */}
            <div className="tw-agen-daftar-field">
              <label className="tw-agen-daftar-label" htmlFor="agent-password">
                Password Akun <span className="tw-agen-daftar-required">*</span>
              </label>
              <div className="tw-agen-daftar-input-wrap">
                <input
                  id="agent-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  placeholder="Minimal 8 karakter"
                  className={`tw-agen-daftar-input ${errors.password ? 'tw-agen-daftar-input--error' : ''}`}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="tw-agen-daftar-toggle-pw"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password ? (
                <span className="tw-agen-daftar-error-text">{errors.password}</span>
              ) : (
                <span className="tw-agen-daftar-hint-text">
                  Minimal 8 karakter
                </span>
              )}
            </div>

            {/* Kode Referral Pengajak (Opsional) */}
            <div className="tw-agen-daftar-field">
              <label className="tw-agen-daftar-label" htmlFor="agent-referral-code">
                Kode Referral Pengajak (Opsional)
              </label>
              <div className="tw-agen-daftar-input-wrap">
                <input
                  id="agent-referral-code"
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="Contoh: AHMAD24"
                  maxLength={20}
                  className="tw-agen-daftar-input"
                  disabled={isSubmitting}
                  autoComplete="off"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <span className="tw-agen-daftar-hint-text">
                Terisi otomatis bila Anda datang dari link agen pengajak. Kosongkan jika mendaftar mandiri: akun Anda tidak akan terhubung ke agen mana pun.
              </span>
            </div>

            {/* Implicit Consent Syarat & Ketentuan */}
            {regInfo?.agent_registration_terms && (
              <p className="tw-agen-daftar-terms-text">
                Dengan mendaftar, Anda menyetujui{' '}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowTermsModal(true);
                  }}
                  className="tw-agen-daftar-terms-btn"
                >
                  Syarat & Ketentuan Kemitraan Agen
                </button>
              </p>
            )}

            {/* Submit Button & Security Cue */}
            <div className="tw-agen-daftar-submit-wrap">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isSubmitting || loadingInfo || infoError}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <UserPlus size={18} />
                <span>{isSubmitting ? 'Mendaftarkan Akun...' : 'Daftar Mitra Agen'}</span>
              </Button>
              <div className="tw-agen-daftar-trust-signal">
                <ShieldCheck size={14} className="tw-agen-daftar-trust-icon" />
                <span>Dikirim lewat koneksi terenkripsi (HTTPS)</span>
              </div>
            </div>
          </form>

          {/* 7. Link to Login Card */}
          <div className="tw-agen-daftar-login-card">
            <span>Sudah memiliki akun mitra agen?</span>
            <Link href="/agen/login" className="tw-agen-daftar-login-link">
              Masuk ke Akun
            </Link>
          </div>
        </div>

        {/* Modal Syarat & Ketentuan */}
        {showTermsModal && regInfo?.agent_registration_terms && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'var(--tw-modal-overlay)',
              zIndex: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
            onClick={() => setShowTermsModal(false)}
          >
            <div
              style={{
                backgroundColor: 'var(--tw-background)',
                borderRadius: '12px',
                maxWidth: '400px',
                width: '100%',
                maxHeight: '82vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 30px var(--tw-divider-strong)',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--tw-neutral-200)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={20} style={{ color: 'var(--tw-brand-primary)' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--tw-neutral-900)' }}>
                    Syarat & Ketentuan Agen
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--tw-neutral-400)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label="Tutup"
                >
                  <X size={18} />
                </button>
              </div>
              <div
                style={{
                  padding: '18px 20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <ul className="tw-terms-list">
                  {regInfo.agent_registration_terms
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0)
                    .map((item, idx) => (
                      <li key={idx}>
                        {item.replace(/^[-*•\d+.]\s*/, '')}
                      </li>
                    ))}
                </ul>
              </div>
              <div
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--tw-neutral-200)',
                  display: 'flex',
                }}
              >
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => setShowTermsModal(false)}
                >
                  <CheckCircle2 size={16} />
                  <span>Saya Mengerti & Tutup</span>
                </Button>
              </div>
            </div>
          </div>
        )}
        <PublicFooter
          tenantName={regInfo?.tenant_name}
          address={regInfo?.address}
          phone={regInfo?.phone}
          whatsappNumber={regInfo?.whatsapp_number}
          email={regInfo?.email}
          ppiuNumber={regInfo?.ppiu_number}
        />
      </MobileContainer>
    </div>
  );
}
