'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, RefreshCw, Trash2, CheckCircle2, AlertCircle, Eye, EyeOff, LogOut, Loader2, ChevronRight, Copy, Check, User, Landmark, KeyRound, X } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import { BankField } from '../../../components/BankField';
import { CityField } from '../../../components/CityField';
import { QrCode } from '../../../components/QrCode';
import { HabitBadge } from '../../../components/HabitBadge';
import { fetchHabitSummary } from '../../../lib/agentHabits';
import { jakartaDateLabel } from '../../../lib/jakartaTime';
import { isBlankPassword, newPasswordError } from '../../../lib/passwordRules';
import { agentPhoneError } from '../../../lib/agentPhone';
import { copyToClipboard } from '../../../lib/clipboard';
import { apiErrorMessage } from '../../../lib/safeJson';
import { clearScriptProspectNames } from '../../../lib/scriptProspectName';
import './AgenProfil.css';

interface AgentProfileData {
  id: number;
  tenant_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  domisili: string | null;
  photo_url: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  status: string;
  referral_code: string;
  created_at: string;
}

/** "5 Oktober 2026" in WIB (the travel's calendar), '' for an empty or invalid date. */
function formatIndonesianDate(dateStr: string): string {
  if (!dateStr) return '';
  return jakartaDateLabel(dateStr, { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function AgenProfilPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [, setLoading] = useState<boolean>(true);
  const [agent, setAgent] = useState<AgentProfileData | null>(null);

  // Form Data Diri
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [domisili, setDomisili] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form Info Rekening
  const [bankName, setBankName] = useState<string>('');
  const [bankAccountNumber, setBankAccountNumber] = useState<string>('');
  const [bankAccountHolder, setBankAccountHolder] = useState<string>('');
  const [savingBank, setSavingBank] = useState<boolean>(false);
  const [bankMsg, setBankMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form Password
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showCurrentPass, setShowCurrentPass] = useState<boolean>(false);
  const [showNewPass, setShowNewPass] = useState<boolean>(false);
  const [showConfirmPass, setShowConfirmPass] = useState<boolean>(false);
  const [savingPassword, setSavingPassword] = useState<boolean>(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Photo Upload State
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [removingPhoto, setRemovingPhoto] = useState<boolean>(false);
  const [photoMsg, setPhotoMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);


  // Fetch initial profile
  useEffect(() => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/agent/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // 404: the agent account no longer exists (deleted by the travel): clear the token like an expired
        // one instead of showing an empty form.
        if (res.status === 401 || res.status === 404) {
          localStorage.removeItem('agent_token');
          router.push('/agen/login');
          return;
        }

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const ag: AgentProfileData = data.agent || data.data?.agent || data;
          setAgent(ag);

          setName(ag.name || '');
          setPhone(ag.phone || '');
          setEmail(ag.email || '');
          setDomisili(ag.domisili || '');

          setBankName(ag.bank_name || '');
          setBankAccountNumber(ag.bank_account_number || '');
          setBankAccountHolder(ag.bank_account_holder || '');
        }
      } catch (err: unknown) {
        setProfileMsg({ type: 'error', text: (err instanceof Error && err.message) || 'Gagal memuat profil agen' });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [router]);

  // Upload Photo Handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setPhotoMsg({ type: 'error', text: 'Hanya format JPG, PNG, atau WEBP yang diperbolehkan' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPhotoMsg({ type: 'error', text: 'Ukuran foto maksimal 5 MB' });
      return;
    }

    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setUploadingPhoto(true);
      setPhotoMsg(null);

      const formData = new FormData();
      formData.append('photo', file);

      const res = await fetch('/api/agent/profile/photo', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      // A busy image server (503) or a gateway error may not be JSON: show the server's message when there is one.
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.error ||
            (res.status === 503 ? 'Server sedang sibuk memproses gambar. Coba lagi sebentar.' : 'Gagal mengunggah foto profil')
        );
      }

      const updated = json.agent || json.data?.agent || json;
      if (updated?.photo_url) {
        setAgent((prev) => (prev ? { ...prev, photo_url: updated.photo_url } : null));
      }
      setPhotoMsg({ type: 'success', text: 'Foto profil berhasil diperbarui' });
    } catch (err: unknown) {
      setPhotoMsg({ type: 'error', text: (err instanceof Error && err.message) || 'Terjadi kesalahan saat upload foto' });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Save Data Diri Handler
  const handleRemovePhoto = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setRemovingPhoto(true);
      setPhotoMsg(null);
      const res = await fetch('/api/agent/profile/photo', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Gagal menghapus foto profil');
      }
      setAgent((prev) => (prev ? { ...prev, photo_url: null } : null));
      setPhotoMsg({ type: 'success', text: 'Foto profil dihapus' });
    } catch (err: unknown) {
      setPhotoMsg({ type: 'error', text: err instanceof Error ? err.message : 'Terjadi kesalahan saat menghapus foto' });
    } finally {
      setRemovingPhoto(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);

    if (!name.trim() || name.trim().length < 2) {
      setProfileMsg({ type: 'error', text: 'Nama lengkap minimal 2 karakter' });
      return;
    }

    // The backend re-validates the phone whenever it is sent. Check (and send) it only when the agent changed
    // it, so a legacy number that fails today's rule does not block editing the name, email or domicile.
    const phoneChanged = phone.trim() !== (agent?.phone ?? '').trim();
    if (!phone.trim()) {
      setProfileMsg({ type: 'error', text: 'Nomor WhatsApp wajib diisi' });
      return;
    }
    if (phoneChanged) {
      const phoneErr = agentPhoneError(phone);
      if (phoneErr) {
        setProfileMsg({ type: 'error', text: phoneErr });
        return;
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // Email is the login: the backend keeps the old one when it is sent empty, so clearing is blocked here.
    if (!email.trim()) {
      setProfileMsg({ type: 'error', text: 'Email wajib diisi, dipakai untuk masuk ke portal' });
      return;
    }
    if (!emailRegex.test(email.trim())) {
      setProfileMsg({ type: 'error', text: 'Format email tidak valid' });
      return;
    }

    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setSavingProfile(true);
      const res = await fetch('/api/agent/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: jsonBody({
          name: name.trim(),
          // Omitted (undefined) when unchanged: the backend treats a missing phone as "keep the stored one".
          phone: phoneChanged ? phone.trim() : undefined,
          email: email.trim(),
          // An empty string clears the domicile (null would mean unchanged and silently keep the old one).
          domisili: domisili.trim(),
        }),
      });

      // A gateway error page is not JSON: show a friendly message, never the parser's.
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(res.status, json, 'Gagal menyimpan profil'));
      }

      const updated = json.agent || json.data?.agent || json;
      setAgent((prev) => (prev ? { ...prev, ...updated } : null));
      setProfileMsg({ type: 'success', text: 'Data diri berhasil disimpan' });
    } catch (err: unknown) {
      setProfileMsg({ type: 'error', text: (err instanceof Error && err.message) || 'Terjadi kesalahan saat menyimpan data diri' });
    } finally {
      setSavingProfile(false);
    }
  };

  // Save Bank Info Handler
  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankMsg(null);

    if (!bankName.trim()) {
      setBankMsg({ type: 'error', text: 'Nama bank wajib diisi' });
      return;
    }
    if (!bankAccountNumber.trim()) {
      setBankMsg({ type: 'error', text: 'Nomor rekening wajib diisi' });
      return;
    }
    if (!bankAccountHolder.trim()) {
      setBankMsg({ type: 'error', text: 'Nama pemilik rekening wajib diisi' });
      return;
    }

    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setSavingBank(true);
      // Bank details go through the profile update (only the fields sent are changed); there is no
      // separate bank-info endpoint (that old URL answered 404).
      const res = await fetch('/api/agent/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: jsonBody({
          bank_name: bankName.trim(),
          bank_account_number: bankAccountNumber.trim(),
          bank_account_holder: bankAccountHolder.trim(),
        }),
      });

      // A gateway error page is not JSON: show a friendly message, never the parser's.
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(res.status, json, 'Gagal menyimpan info rekening'));
      }

      const updated = json.agent || json.data?.agent || json;
      setAgent((prev) => (prev ? { ...prev, ...updated } : null));
      setBankMsg({ type: 'success', text: 'Info rekening berhasil disimpan' });
    } catch (err: unknown) {
      setBankMsg({ type: 'error', text: (err instanceof Error && err.message) || 'Terjadi kesalahan saat menyimpan rekening' });
    } finally {
      setSavingBank(false);
    }
  };

  // Save Password Handler
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (isBlankPassword(currentPassword)) {
      setPasswordMsg({ type: 'error', text: 'Password saat ini wajib diisi' });
      return;
    }
    // Sent as typed (never trimmed); spaces at the ends do not count towards the minimum.
    if (newPasswordError(newPassword)) {
      setPasswordMsg({ type: 'error', text: 'Password baru minimal 8 karakter' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Konfirmasi password tidak cocok' });
      return;
    }

    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setSavingPassword(true);
      const res = await fetch('/api/agent/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: jsonBody({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      // A gateway error page is not JSON: show a friendly message, never the parser's.
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(res.status, json, 'Gagal mengubah password'));
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({ type: 'success', text: 'Password berhasil diubah' });
    } catch (err: unknown) {
      setPasswordMsg({ type: 'error', text: (err instanceof Error && err.message) || 'Terjadi kesalahan saat mengubah password' });
    } finally {
      setSavingPassword(false);
    }
  };

  // Confirm Logout Handler
  const executeLogout = async () => {
    const token = localStorage.getItem('agent_token');
    if (token) {
      try {
        await fetch('/api/agent/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // Silently ignore network failure on logout
      }
    }
    localStorage.removeItem('agent_token');
    localStorage.removeItem('klikumroh_agent_tenant_name');
    localStorage.removeItem('klikumroh_agent_name');
    // Shared device: the next agent must not see this agent's jamaah name in Script WA.
    clearScriptProspectNames(localStorage);
    router.push('/agen/login');
  };

  // One sheet at a time: the form for a menu row, or the logout confirmation.
  const [sheet, setSheet] = useState<'profile' | 'bank' | 'password' | 'logout' | null>(null);
  const [refCopied, setRefCopied] = useState<boolean>(false);
  // Referral link shown as a QR code on the ID card (same /ref/{code} route as the share links).
  const referralLink = agent?.referral_code && typeof window !== 'undefined' ? `${window.location.origin}/ref/${agent.referral_code}` : '';
  // Travel name for the ID card.
  const [travelName, setTravelName] = useState<string>('');
  // Highest habit streak badge, shown on the ID card (0 when none).
  const [topBadge, setTopBadge] = useState<number>(0);
  useEffect(() => {
    fetchHabitSummary().then((s) => {
      const days = (s?.badges || []).map((b) => b.days);
      if (days.length > 0) setTopBadge(Math.max(...days));
    });
  }, []);
  useEffect(() => {
    fetch('/api/public/tenant-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.name) setTravelName(json.name);
      })
      .catch(() => {});
  }, []);
  const openSheet = (s: 'profile' | 'bank' | 'password' | 'logout') => {
    setProfileMsg(null);
    setBankMsg(null);
    setPasswordMsg(null);
    setSheet(s);
  };
  // 'Tersalin' only once the code is really copied (in-app browsers may block the clipboard).
  const copyReferral = async () => {
    if (!agent?.referral_code) return;
    if (!(await copyToClipboard(agent.referral_code))) return;
    setRefCopied(true);
    setTimeout(() => setRefCopied(false), 2000);
  };

  const msgBox = (m: { type: 'success' | 'error'; text: string } | null) =>
    m && (
      <p className={`pf-msg pf-msg--${m.type}`} role={m.type === 'error' ? 'alert' : 'status'}>
        {m.type === 'success' ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
        <span>{m.text}</span>
      </p>
    );

  const passwordField = (id: string, label: string, value: string, set: (v: string) => void, shown: boolean, toggle: () => void, autoComplete: string) => (
    <div>
      <label className="tw-field-label" htmlFor={id}>
        {label}
      </label>
      <div className="pf-pass">
        <input id={id} type={shown ? 'text' : 'password'} value={value} onChange={(e) => set(e.target.value)} autoComplete={autoComplete} className="tw-field tw-field--pw" />
        <button type="button" className="pf-pass__toggle" onClick={toggle} aria-label={shown ? 'Sembunyikan password' : 'Tampilkan password'}>
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );

  const bankSummary = agent?.bank_name && agent?.bank_account_number ? `${agent.bank_name} · ${agent.bank_account_number}` : 'Belum diisi';

  return (
    <MobileContainer>
      {/* Tab page (bottom navbar): title only. */}
      <header className="pf-header">
        <h1 className="pf-header__title">Profil</h1>
      </header>

      <div className="pf-page">
        {/* Lanyard ID card: brand band with an Islamic eight-point star pattern and a lanyard slot, round photo,
            name, travel, and a QR code of the agent's referral link (prospects scan it from the agent's phone). */}
        <section className="pf-idcard" aria-label="Kartu mitra agen">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/jpeg,image/png,image/webp" hidden />
          <div className="pf-idcard__band" aria-hidden="true">
            <svg className="pf-idcard__pattern" width="100%" height="100%">
              <defs>
                <pattern id="pf-star" width="28" height="28" patternUnits="userSpaceOnUse">
                  <path d="M14 2l3.5 8.5L26 14l-8.5 3.5L14 26l-3.5-8.5L2 14l8.5-3.5z" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#pf-star)" />
            </svg>
            <span className="pf-idcard__slot" />
          </div>
          <div className="pf-idcard__photo">
            {agent?.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded agent photo, served as-is
              <img src={agent.photo_url} alt={agent.name} />
            ) : (
              <User size={44} className="pf-idcard__icon" aria-hidden="true" />
            )}
            {(uploadingPhoto || removingPhoto) && (
              <span className="pf-idcard__busy">
                <Loader2 size={20} className="tw-animate-spin" aria-label={removingPhoto ? 'Menghapus' : 'Mengunggah'} />
              </span>
            )}
          </div>
          <p className="pf-idcard__name">{agent?.name || 'Mitra Agen'}</p>
          <p className="pf-idcard__role">Mitra Agen · {travelName || 'Travel Umroh'}</p>
          {topBadge > 0 && <HabitBadge days={topBadge} className="pf-idcard__badge" />}
          {referralLink && (
            <div className="pf-idcard__qr">
              <QrCode value={referralLink} size={136} label={`QR link pendaftaran ${agent?.name || ''}`} />
              <span className="pf-muted">Pindai untuk daftar lewat saya</span>
            </div>
          )}
          <button type="button" className="pf-idcard__code" onClick={copyReferral} aria-label={`Salin kode referral ${agent?.referral_code || ''}`}>
            {agent?.referral_code || '-'}
            {refCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          </button>
          {agent?.created_at && <p className="pf-muted">Bergabung sejak {formatIndonesianDate(agent.created_at)}</p>}
        </section>
        <div className="pf-avatar__actions">
          <button type="button" className="pf-link" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto || removingPhoto}>
            {agent?.photo_url ? <RefreshCw size={14} aria-hidden="true" /> : <ImagePlus size={14} aria-hidden="true" />}
            {agent?.photo_url ? 'Ganti foto' : 'Unggah foto'}
          </button>
          {agent?.photo_url && (
            <button type="button" className="pf-link pf-link--muted" onClick={handleRemovePhoto} disabled={uploadingPhoto || removingPhoto}>
              <Trash2 size={14} aria-hidden="true" />
              Hapus foto
            </button>
          )}
        </div>
        {msgBox(photoMsg)}

        {/* Settings as menu rows; each opens its own sheet. */}
        <nav className="pf-menu" aria-label="Pengaturan akun">
          <button type="button" className="pf-row" onClick={() => openSheet('profile')}>
            <User size={20} className="pf-row__icon" aria-hidden="true" />
            <span className="pf-row__text">
              <span className="pf-row__label">Data diri</span>
              <span className="pf-muted">{[agent?.name, agent?.phone].filter(Boolean).join(' · ') || 'Lengkapi data diri'}</span>
            </span>
            <ChevronRight size={18} className="pf-row__go" aria-hidden="true" />
          </button>
          <button type="button" className="pf-row" onClick={() => openSheet('bank')}>
            <Landmark size={20} className="pf-row__icon" aria-hidden="true" />
            <span className="pf-row__text">
              <span className="pf-row__label">Rekening pencairan</span>
              <span className="pf-muted">{bankSummary}</span>
            </span>
            <ChevronRight size={18} className="pf-row__go" aria-hidden="true" />
          </button>
          <button type="button" className="pf-row" onClick={() => openSheet('password')}>
            <KeyRound size={20} className="pf-row__icon" aria-hidden="true" />
            <span className="pf-row__text">
              <span className="pf-row__label">Ubah password</span>
              <span className="pf-muted">Ganti password masuk portal</span>
            </span>
            <ChevronRight size={18} className="pf-row__go" aria-hidden="true" />
          </button>
          <button type="button" className="pf-row pf-row--danger" onClick={() => openSheet('logout')}>
            <LogOut size={20} className="pf-row__icon" aria-hidden="true" />
            <span className="pf-row__text">
              <span className="pf-row__label">Keluar</span>
            </span>
          </button>
        </nav>
      </div>

      {sheet && (
        <div className="pf-sheet" role="presentation" onClick={() => setSheet(null)}>
          <div className="pf-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="pf-sheet-title" onClick={(e) => e.stopPropagation()}>
            <span className="pf-sheet__grip" aria-hidden="true" />
            <div className="pf-sheet__head">
              <h2 id="pf-sheet-title" className="pf-title">
                {sheet === 'profile' ? 'Data diri' : sheet === 'bank' ? 'Rekening pencairan' : sheet === 'password' ? 'Ubah password' : 'Keluar dari akun?'}
              </h2>
              <button type="button" className="pf-icon-btn" onClick={() => setSheet(null)} aria-label="Tutup">
                <X size={20} />
              </button>
            </div>

            {sheet === 'profile' && (
              <form onSubmit={handleSaveProfile} className="pf-form">
                {msgBox(profileMsg)}
                <div>
                  <label className="tw-field-label" htmlFor="pf-name">
                    Nama lengkap
                  </label>
                  <input id="pf-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required className="tw-field" />
                </div>
                <div>
                  <label className="tw-field-label" htmlFor="pf-phone">
                    Nomor WhatsApp
                  </label>
                  <input id="pf-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="081234567890" required className="tw-field" />
                </div>
                <div>
                  <label className="tw-field-label" htmlFor="pf-email">
                    Email
                  </label>
                  <input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" className="tw-field" />
                </div>
                <CityField id="pf-city" label="Domisili (kota/kabupaten)" value={domisili} onChange={setDomisili} openUp labelClassName="tw-field-label" inputClassName="tw-field" />
                <button type="submit" className="pf-btn" disabled={savingProfile}>
                  {savingProfile ? 'Menyimpan...' : 'Simpan'}
                </button>
              </form>
            )}

            {sheet === 'bank' && (
              <form onSubmit={handleSaveBank} className="pf-form">
                {msgBox(bankMsg)}
                <BankField id="pf-bank" value={bankName} onChange={setBankName} />
                <div>
                  <label className="tw-field-label" htmlFor="pf-account">
                    Nomor rekening
                  </label>
                  <input id="pf-account" type="text" inputMode="numeric" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} required className="tw-field" />
                </div>
                <div>
                  <label className="tw-field-label" htmlFor="pf-holder">
                    Nama pemilik rekening
                  </label>
                  <input id="pf-holder" type="text" value={bankAccountHolder} onChange={(e) => setBankAccountHolder(e.target.value)} required className="tw-field" />
                </div>
                <button type="submit" className="pf-btn" disabled={savingBank}>
                  {savingBank ? 'Menyimpan...' : 'Simpan'}
                </button>
              </form>
            )}

            {sheet === 'password' && (
              <form onSubmit={handleSavePassword} className="pf-form">
                {msgBox(passwordMsg)}
                {passwordField('pf-pass-now', 'Password saat ini', currentPassword, setCurrentPassword, showCurrentPass, () => setShowCurrentPass((v) => !v), 'current-password')}
                {passwordField('pf-pass-new', 'Password baru (minimal 8 karakter)', newPassword, setNewPassword, showNewPass, () => setShowNewPass((v) => !v), 'new-password')}
                {passwordField('pf-pass-again', 'Ulangi password baru', confirmPassword, setConfirmPassword, showConfirmPass, () => setShowConfirmPass((v) => !v), 'new-password')}
                <button type="submit" className="pf-btn" disabled={savingPassword}>
                  {savingPassword ? 'Menyimpan...' : 'Simpan password'}
                </button>
              </form>
            )}

            {sheet === 'logout' && (
              <div className="pf-form">
                <p className="pf-text">Anda perlu masuk lagi untuk membuka portal agen.</p>
                <div className="pf-actions">
                  <button type="button" className="pf-btn pf-btn--ghost" onClick={() => setSheet(null)}>
                    Batal
                  </button>
                  <button type="button" className="pf-btn pf-btn--danger" onClick={executeLogout}>
                    Ya, keluar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <AgentBottomNavbar />
    </MobileContainer>
  );
}

function jsonBody(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}
