'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CircleUserRound,
  Camera,
  CheckCircle2,
  AlertCircle,
  Lock,
  Mail,
  Phone,
  User,
  MapPin,
  Building2,
  CreditCard,
  Eye,
  EyeOff,
  LogOut,
  Loader2,
  Calendar,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import regenciesData from '../../../data/indonesia-regencies.json';

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

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatIndonesianDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = MONTH_NAMES_ID[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export default function AgenProfilPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const domisiliRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [agent, setAgent] = useState<AgentProfileData | null>(null);

  // Form Data Diri
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [domisili, setDomisili] = useState<string>('');
  const [domisiliQuery, setDomisiliQuery] = useState<string>('');
  const [domisiliOpen, setDomisiliOpen] = useState<boolean>(false);
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
  const [photoMsg, setPhotoMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Logout Confirmation Modal
  const [showLogoutModal, setShowLogoutModal] = useState<boolean>(false);

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

        if (res.status === 401) {
          localStorage.removeItem('agent_token');
          router.push('/agen/login');
          return;
        }

        if (res.ok) {
          const data = await res.json();
          const ag: AgentProfileData = data.agent || data.data?.agent || data;
          setAgent(ag);

          setName(ag.name || '');
          setPhone(ag.phone || '');
          setEmail(ag.email || '');
          setDomisili(ag.domisili || '');
          setDomisiliQuery(ag.domisili || '');

          setBankName(ag.bank_name || '');
          setBankAccountNumber(ag.bank_account_number || '');
          setBankAccountHolder(ag.bank_account_holder || '');
        }
      } catch (err: any) {
        setProfileMsg({ type: 'error', text: err.message || 'Gagal memuat profil agen' });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [router]);

  // Outside click listener for domisili dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (domisiliRef.current && !domisiliRef.current.contains(e.target as Node)) {
        setDomisiliOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter regencies
  const filteredRegencies =
    domisiliQuery.trim().length >= 2
      ? (regenciesData as Array<{ code: string; name: string }>)
        .filter((item) => item.name.toLowerCase().includes(domisiliQuery.toLowerCase()))
        .slice(0, 15)
      : [];

  const handleSelectDomisili = (item: { code: string; name: string }) => {
    setDomisili(item.name);
    setDomisiliQuery(item.name);
    setDomisiliOpen(false);
  };

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

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal mengunggah foto profil');
      }

      const updated = json.agent || json.data?.agent || json;
      if (updated?.photo_url) {
        setAgent((prev) => (prev ? { ...prev, photo_url: updated.photo_url } : null));
      }
      setPhotoMsg({ type: 'success', text: 'Foto profil berhasil diperbarui' });
    } catch (err: any) {
      setPhotoMsg({ type: 'error', text: err.message || 'Terjadi kesalahan saat upload foto' });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Save Data Diri Handler
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);

    if (!name.trim() || name.trim().length < 2) {
      setProfileMsg({ type: 'error', text: 'Nama lengkap minimal 2 karakter' });
      return;
    }

    if (!phone.trim() || phone.trim().length < 8) {
      setProfileMsg({ type: 'error', text: 'Nomor WhatsApp minimal 8 digit' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email.trim() && !emailRegex.test(email.trim())) {
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
          phone: phone.trim(),
          email: email.trim() || null,
          domisili: domisili.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal menyimpan profil');
      }

      const updated = json.agent || json.data?.agent || json;
      setAgent((prev) => (prev ? { ...prev, ...updated } : null));
      setProfileMsg({ type: 'success', text: 'Data diri berhasil disimpan' });
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err.message || 'Terjadi kesalahan saat menyimpan data diri' });
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
      const res = await fetch('/api/agent/bank-info', {
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

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal menyimpan info rekening');
      }

      const updated = json.agent || json.data?.agent || json;
      setAgent((prev) => (prev ? { ...prev, ...updated } : null));
      setBankMsg({ type: 'success', text: 'Info rekening berhasil disimpan' });
    } catch (err: any) {
      setBankMsg({ type: 'error', text: err.message || 'Terjadi kesalahan saat menyimpan rekening' });
    } finally {
      setSavingBank(false);
    }
  };

  // Save Password Handler
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (!currentPassword) {
      setPasswordMsg({ type: 'error', text: 'Password saat ini wajib diisi' });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
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

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal mengubah password');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({ type: 'success', text: 'Password berhasil diubah' });
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Terjadi kesalahan saat mengubah password' });
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
    router.push('/agen/login');
  };

  return (
    <MobileContainer>
      {/* Top Header Navigation */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backgroundColor: 'var(--tw-background)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Kembali"
          style={{
            background: 'none',
            border: 'none',
            padding: '6px',
            cursor: 'pointer',
            color: 'var(--tw-text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={20} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--tw-text-primary)',
              margin: 0,
              fontFamily: 'var(--tw-font-heading)',
              lineHeight: 1.2,
            }}
          >
            Profil Saya
          </h1>
          <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', lineHeight: 1.3 }}>
            Kelola akun &amp; rekening pencairan
          </span>
        </div>
      </header>

      {/* Main Canvas */}
      <main
        style={{
          backgroundColor: 'var(--tw-page-bg)',
          minHeight: 'calc(100vh - 62px)',
          padding: '14px 16px calc(84px + env(safe-area-inset-bottom)) 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* 1. Header Section: Foto Profil */}
        <section
          aria-label="Foto Profil"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            boxShadow: 'var(--tw-card-shadow)',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            textAlign: 'center',
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
          />

          {/* Avatar Area */}
          <div
            onClick={() => !uploadingPhoto && fileInputRef.current?.click()}
            style={{
              position: 'relative',
              cursor: uploadingPhoto ? 'wait' : 'pointer',
              display: 'inline-block',
            }}
            title="Ketuk untuk ubah foto profil"
          >
            {agent?.photo_url ? (
              <div
                style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '2px solid rgba(0, 0, 0, 0.08)',
                }}
              >
                <img
                  src={agent.photo_url}
                  alt={agent.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ) : (
              <CircleUserRound
                size={90}
                strokeWidth={1.2}
                color="var(--tw-text-muted)"
              />
            )}

            {/* Subtle camera icon overlay */}
            <div
              style={{
                position: 'absolute',
                right: '0px',
                bottom: '2px',
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: 'var(--tw-background)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                boxShadow: 'var(--tw-card-shadow)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--tw-text-primary)',
              }}
            >
              {uploadingPhoto ? (
                <Loader2 size={13} className="tw-animate-spin" />
              ) : (
                <Camera size={13} />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tw-text-primary)', fontFamily: 'var(--tw-font-heading)' }}>
              {agent?.name || 'Mitra Agen'}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--tw-text-muted)' }}>
              Kode Referral: <strong>{agent?.referral_code || '-'}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => !uploadingPhoto && fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: 'var(--tw-page-bg)',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              color: 'var(--tw-text-secondary)',
              cursor: uploadingPhoto ? 'wait' : 'pointer',
            }}
          >
            {uploadingPhoto ? 'Mengunggah...' : 'Ganti Foto Profil'}
          </button>

          {photoMsg && (
            <div
              style={{
                fontSize: '12px',
                padding: '8px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: photoMsg.type === 'success' ? 'var(--tw-badge-success-bg)' : '#fef2f2',
                color: photoMsg.type === 'success' ? 'var(--tw-income)' : '#991b1b',
              }}
            >
              {photoMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{photoMsg.text}</span>
            </div>
          )}
        </section>

        {/* 2. Section: Form Data Diri */}
        <section
          aria-label="Data Diri Agen"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            boxShadow: 'var(--tw-card-shadow)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tw-text-primary)', margin: 0, fontFamily: 'var(--tw-font-heading)' }}>
              Data Diri
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>
              Informasi identitas akun kemitraan Anda
            </span>
          </div>

          {profileMsg && (
            <div
              style={{
                fontSize: '12px',
                padding: '8px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: profileMsg.type === 'success' ? 'var(--tw-badge-success-bg)' : '#fef2f2',
                color: profileMsg.type === 'success' ? 'var(--tw-income)' : '#991b1b',
              }}
            >
              {profileMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{profileMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Nama Lengkap */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)', marginBottom: '5px' }}>
                Nama Lengkap
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama Lengkap"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    fontSize: '13px',
                    color: 'var(--tw-text-primary)',
                    backgroundColor: 'var(--tw-background)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <User size={15} color="var(--tw-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
              </div>
            </div>

            {/* Nomor WhatsApp */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)', marginBottom: '5px' }}>
                Nomor WhatsApp
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="081234567890"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    fontSize: '13px',
                    color: 'var(--tw-text-primary)',
                    backgroundColor: 'var(--tw-background)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <Phone size={15} color="var(--tw-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
              </div>
            </div>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)', marginBottom: '5px' }}>
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    fontSize: '13px',
                    color: 'var(--tw-text-primary)',
                    backgroundColor: 'var(--tw-background)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <Mail size={15} color="var(--tw-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
              </div>
            </div>

            {/* Domisili (Autocomplete) */}
            <div ref={domisiliRef} style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)', marginBottom: '5px' }}>
                Domisili (Kota/Kabupaten)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={domisiliQuery}
                  onChange={(e) => {
                    setDomisiliQuery(e.target.value);
                    setDomisili(e.target.value);
                    setDomisiliOpen(true);
                  }}
                  onFocus={() => setDomisiliOpen(true)}
                  placeholder="Ketik minimal 2 huruf..."
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    fontSize: '13px',
                    color: 'var(--tw-text-primary)',
                    backgroundColor: 'var(--tw-background)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <MapPin size={15} color="var(--tw-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
              </div>

              {domisiliOpen && filteredRegencies.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    zIndex: 20,
                    backgroundColor: 'var(--tw-background)',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    maxHeight: '180px',
                    overflowY: 'auto',
                  }}
                >
                  {filteredRegencies.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => handleSelectDomisili(item)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        border: 'none',
                        borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
                        backgroundColor: 'transparent',
                        textAlign: 'left',
                        fontSize: '13px',
                        color: 'var(--tw-text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              style={{
                marginTop: '2px',
                padding: '10px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 700,
                backgroundColor: 'var(--tw-brand-primary)',
                color: '#FFFFFF',
                border: 'none',
                cursor: savingProfile ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {savingProfile && <Loader2 size={14} className="tw-animate-spin" />}
              <span>Simpan Data Diri</span>
            </button>
          </form>
        </section>

        {/* 3. Section: Info Rekening */}
        <section
          aria-label="Info Rekening Bank"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            boxShadow: 'var(--tw-card-shadow)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tw-text-primary)', margin: 0, fontFamily: 'var(--tw-font-heading)' }}>
              Info Rekening
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>
              Rekening bank tujuan untuk pencairan komisi Anda
            </span>
          </div>

          {bankMsg && (
            <div
              style={{
                fontSize: '12px',
                padding: '8px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: bankMsg.type === 'success' ? 'var(--tw-badge-success-bg)' : '#fef2f2',
                color: bankMsg.type === 'success' ? 'var(--tw-income)' : '#991b1b',
              }}
            >
              {bankMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{bankMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleSaveBank} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Nama Bank */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)', marginBottom: '5px' }}>
                Nama Bank
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Contoh: BCA, Mandiri, BSI"
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    fontSize: '13px',
                    color: 'var(--tw-text-primary)',
                    backgroundColor: 'var(--tw-background)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <Building2 size={15} color="var(--tw-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
              </div>
            </div>

            {/* Nomor Rekening */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)', marginBottom: '5px' }}>
                Nomor Rekening
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="Nomor rekening bank"
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    fontSize: '13px',
                    color: 'var(--tw-text-primary)',
                    backgroundColor: 'var(--tw-background)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <CreditCard size={15} color="var(--tw-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
              </div>
            </div>

            {/* Atas Nama Rekening */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)', marginBottom: '5px' }}>
                Nama Pemilik Rekening
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={bankAccountHolder}
                  onChange={(e) => setBankAccountHolder(e.target.value)}
                  placeholder="Sesuai buku tabungan"
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    fontSize: '13px',
                    color: 'var(--tw-text-primary)',
                    backgroundColor: 'var(--tw-background)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <User size={15} color="var(--tw-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingBank}
              style={{
                marginTop: '2px',
                padding: '10px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 700,
                backgroundColor: 'var(--tw-brand-primary)',
                color: '#FFFFFF',
                border: 'none',
                cursor: savingBank ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {savingBank && <Loader2 size={14} className="tw-animate-spin" />}
              <span>Simpan Info Rekening</span>
            </button>
          </form>
        </section>

        {/* 4. Section: Ubah Password */}
        <section
          aria-label="Ubah Password"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            boxShadow: 'var(--tw-card-shadow)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tw-text-primary)', margin: 0, fontFamily: 'var(--tw-font-heading)' }}>
              Ubah Password
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>
              Pastikan gunakan password yang kuat dan aman
            </span>
          </div>

          {passwordMsg && (
            <div
              style={{
                fontSize: '12px',
                padding: '8px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: passwordMsg.type === 'success' ? 'var(--tw-badge-success-bg)' : '#fef2f2',
                color: passwordMsg.type === 'success' ? 'var(--tw-income)' : '#991b1b',
              }}
            >
              {passwordMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{passwordMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Current Password */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)', marginBottom: '5px' }}>
                Password Saat Ini
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Password saat ini"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    fontSize: '13px',
                    color: 'var(--tw-text-primary)',
                    backgroundColor: 'var(--tw-background)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <Lock size={15} color="var(--tw-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '10px',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--tw-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {showCurrentPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)', marginBottom: '5px' }}>
                Password Baru (Minimal 8 Karakter)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Password baru"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    fontSize: '13px',
                    color: 'var(--tw-text-primary)',
                    backgroundColor: 'var(--tw-background)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <Lock size={15} color="var(--tw-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '10px',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--tw-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)', marginBottom: '5px' }}>
                Konfirmasi Password Baru
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi password baru"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    fontSize: '13px',
                    color: 'var(--tw-text-primary)',
                    backgroundColor: 'var(--tw-background)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <Lock size={15} color="var(--tw-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '10px',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--tw-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {showConfirmPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPassword}
              style={{
                marginTop: '2px',
                padding: '10px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 700,
                backgroundColor: 'var(--tw-brand-primary)',
                color: '#FFFFFF',
                border: 'none',
                cursor: savingPassword ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {savingPassword && <Loader2 size={14} className="tw-animate-spin" />}
              <span>Ubah Password</span>
            </button>
          </form>
        </section>

        {/* 5. Read-only info: Bergabung sejak */}
        {agent?.created_at && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '11px',
              color: 'var(--tw-text-muted)',
              padding: '2px 0',
            }}
          >
            <Calendar size={12} color="var(--tw-text-muted)" />
            <span>Bergabung sejak {formatIndonesianDate(agent.created_at)}</span>
          </div>
        )}

        {/* 6. Tombol Logout (Keluar) */}
        <section
          aria-label="Logout"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            boxShadow: 'var(--tw-card-shadow)',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            style={{
              width: '100%',
              padding: '13px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--tw-expense, #ef4444)',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            <LogOut size={16} color="var(--tw-expense, #ef4444)" />
            <span>Keluar dari Akun</span>
          </button>
        </section>
      </main>

      {/* Confirmation Modal for Logout */}
      {showLogoutModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--tw-background)',
              borderRadius: '14px',
              padding: '20px',
              width: '100%',
              maxWidth: '340px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tw-text-primary)', margin: 0, fontFamily: 'var(--tw-font-heading)' }}>
                Konfirmasi Keluar
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--tw-text-secondary)', margin: 0, lineHeight: 1.4 }}>
                Apakah Anda yakin ingin keluar dari akun kemitraan agen ini?
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '2px' }}>
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'var(--tw-page-bg)',
                  border: '1px solid rgba(0, 0, 0, 0.1)',
                  color: 'var(--tw-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeLogout}
                style={{
                  padding: '9px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: 'var(--tw-expense, #ef4444)',
                  border: 'none',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                }}
              >
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      <AgentBottomNavbar />
    </MobileContainer>
  );
}

function jsonBody(data: Record<string, any>): string {
  return JSON.stringify(data);
}
