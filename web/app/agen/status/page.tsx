'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Upload,
  Copy,
  Check,
  LogOut,
  RefreshCw,
  Share2,
  CreditCard,
  MapPin,
  Eye,
  MessageCircle,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { PublicHeader } from '../../../components/PublicHeader';
import { BottomNavbar } from '../../../components/BottomNavbar';
import { Button } from '../../../components/Button';
import designTokens from '../../../../design-tokens.json';
import './AgenStatus.css';

interface AgentMeData {
  agent: {
    id: number;
    tenant_id: number;
    name: string;
    phone: string;
    email: string;
    domisili: string;
    referral_code: string;
    status: 'pending' | 'active' | 'inactive' | 'rejected';
    payment_status: 'not_applicable' | 'awaiting_proof' | 'pending_verification' | 'verified';
    payment_proof_url: string | null;
    rejection_reason?: string | null;
  };
  tenant: {
    name: string;
    brand_primary_color?: string;
    brand_logo_url?: string;
    whatsapp_number?: string;
  };
  agent_registration_fee?: number;
  agent_bank_name?: string;
  agent_bank_account_number?: string;
  agent_bank_account_holder?: string;
}

export default function AgenStatusPage() {
  const router = useRouter();

  const [data, setData] = useState<AgentMeData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Copy feedbacks
  const [copiedBank, setCopiedBank] = useState<boolean>(false);
  const [copiedRef, setCopiedRef] = useState<boolean>(false);

  // Lightbox for proof
  const [showProofModal, setShowProofModal] = useState<boolean>(false);

  const fetchAgentMe = async (isManualRefresh = false) => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

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

      if (!res.ok) {
        throw new Error('Gagal memuat status akun agen');
      }

      const json = await res.json();
      const rawData = json.data || json;
      const rawAgent = rawData.agent || rawData;
      const rawTenant = rawData.tenant || {};
      const paymentInfo = rawAgent.payment_info || rawData.payment_info || {};

      const normalized: AgentMeData = {
        agent: {
          id: rawAgent.id,
          tenant_id: rawAgent.tenant_id,
          name: rawAgent.name,
          phone: rawAgent.phone || '',
          email: rawAgent.email || '',
          domisili: rawAgent.domisili || '',
          referral_code: rawAgent.referral_code || '',
          status: rawAgent.status,
          payment_status: rawAgent.payment_status,
          payment_proof_url: rawAgent.payment_proof_url || null,
          rejection_reason: rawAgent.rejection_reason || null,
        },
        tenant: {
          name: rawTenant.name || 'Portal Mitra Agen',
          brand_primary_color: rawTenant.brand_primary_color,
          brand_logo_url: rawTenant.brand_logo_url,
          whatsapp_number: rawTenant.whatsapp_number,
        },
        agent_registration_fee: rawData.agent_registration_fee ?? paymentInfo.registration_fee,
        agent_bank_name: rawData.agent_bank_name || paymentInfo.bank_name,
        agent_bank_account_number: rawData.agent_bank_account_number || paymentInfo.bank_account_number,
        agent_bank_account_holder: rawData.agent_bank_account_holder || paymentInfo.bank_account_holder,
      };
      setData(normalized);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memuat status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAgentMe();
  }, []);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('agent_token');
    if (token) {
      fetch('/api/agent/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('agent_token');
    router.push('/agen/login');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setUploadSuccess(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setUploadError('Ukuran file maksimal adalah 5MB');
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUploadPaymentProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Silakan pilih file bukti transfer terlebih dahulu');
      return;
    }

    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);
      setUploadSuccess(null);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/agent/payment-proof', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setUploadError(json.error || 'Gagal mengunggah bukti transfer');
        return;
      }

      setUploadSuccess('Bukti transfer berhasil diunggah dan sedang menunggu verifikasi!');
      setSelectedFile(null);
      setPreviewUrl(null);
      await fetchAgentMe(true);
    } catch (err: any) {
      setUploadError(err.message || 'Koneksi bermasalah saat mengunggah');
    } finally {
      setUploading(false);
    }
  };

  const handleCopyBank = () => {
    if (data?.agent_bank_account_number) {
      navigator.clipboard.writeText(data.agent_bank_account_number);
      setCopiedBank(true);
      setTimeout(() => setCopiedBank(false), 2000);
    }
  };

  const getReferralUrl = () => {
    if (typeof window !== 'undefined' && data?.agent?.referral_code) {
      return `${window.location.origin}/?ref=${data.agent.referral_code}`;
    }
    return '';
  };

  const handleCopyRefLink = () => {
    const url = getReferralUrl();
    if (url) {
      navigator.clipboard.writeText(url);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  const formatRupiah = (val?: number) => {
    if (val === undefined || val === null) return 'Rp 0';
    return 'Rp ' + val.toLocaleString('id-ID');
  };

  const layoutStyle = Object.fromEntries(
    Object.entries(designTokens.publicConversionLayout).map(([key, value]) => ['--cro-' + key, value])
  );
  const brandingStyle = data?.tenant?.brand_primary_color
    ? { '--tw-brand-primary': data.tenant.brand_primary_color }
    : {};

  const waNumber = data?.tenant?.whatsapp_number || '6281234567890';
  const helpWaUrl = `https://wa.me/${waNumber}?text=Halo%20Admin%2C%20saya%20mitra%20agen%20${encodeURIComponent(data?.tenant?.name || 'travel')}%20ingin%20menanyakan%20status%20kemitraan`;

  if (loading) {
    return (
      <div
        className="tw-agen-status-wrap"
        style={{ ...layoutStyle, ...brandingStyle } as React.CSSProperties}
      >
        <MobileContainer>
          <PublicHeader
            title="Status Kemitraan"
            showBack={true}
            onBackClick={handleBack}
            backHref="/"
            hideNotification={true}
          />
          <div style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                border: '3px solid #E2E8F0',
                borderTopColor: 'var(--tw-brand-primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ fontSize: '13px', color: '#64748B' }}>
              Memuat status kemitraan agen Anda...
            </span>
            <style jsx>{`
              @keyframes spin {
                to {
                  transform: rotate(360deg);
                }
              }
            `}</style>
          </div>
          <BottomNavbar waNumber={data?.tenant?.whatsapp_number || undefined} />
        </MobileContainer>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="tw-agen-status-wrap"
        style={{ ...layoutStyle, ...brandingStyle } as React.CSSProperties}
      >
        <MobileContainer>
          <PublicHeader
            title="Status Kemitraan"
            showBack={true}
            onBackClick={handleBack}
            backHref="/"
            hideNotification={true}
          />
          <div style={{ padding: '40px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div style={{ color: '#DC2626', background: '#FEF2F2', padding: '14px', borderRadius: '50%' }}>
              <AlertCircle size={32} />
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#0F172A' }}>Gagal Memuat Status</h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>{error}</p>
            <Button variant="primary" size="md" onClick={() => fetchAgentMe()}>
              <RefreshCw size={15} />
              <span>Coba Lagi</span>
            </Button>
          </div>
          <BottomNavbar waNumber={data?.tenant?.whatsapp_number || undefined} />
        </MobileContainer>
      </div>
    );
  }

  const { agent, tenant } = data;

  return (
    <div
      className="tw-agen-status-wrap"
      style={{ ...layoutStyle, ...brandingStyle } as React.CSSProperties}
    >
      <MobileContainer>
        {/* App Bar Header (Back button + Title, Logo strictly Home only) */}
        <PublicHeader
          title="Status Kemitraan"
          showBack={true}
          onBackClick={handleBack}
          backHref="/"
          hideNotification={true}
        />

        <div className="tw-agen-status-body">
          {/* 1. Header Banner */}
          <div className="tw-agen-status-header">
            <span className="tw-agen-status-tag">
              {tenant?.name || 'Portal Mitra Agen'}
            </span>
            <h1 className="tw-agen-status-title">
              Status Kemitraan Agen
            </h1>
            <p className="tw-agen-status-subtitle">
              Pantau perkembangan verifikasi akun dan akses tautan syiar Anda.
            </p>
          </div>

          {/* 2. User Profile Bar */}
          <div className="tw-agen-status-profile-card">
            <div className="tw-agen-status-profile-info">
              <div className="tw-agen-status-avatar">
                {agent.name.charAt(0).toUpperCase()}
              </div>
              <div className="tw-agen-status-profile-text">
                <span className="tw-agen-status-profile-name">{agent.name}</span>
                <span className="tw-agen-status-profile-loc">
                  <MapPin size={11} />
                  <span>{agent.domisili || 'Indonesia'}</span>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="tw-agen-status-btn-logout"
              title="Keluar dari akun"
            >
              <LogOut size={13} />
              <span>Keluar</span>
            </button>
          </div>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              KONDISI 1: BERBAYAR & BELUM UPLOAD BUKTI (awaiting_proof)
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {agent.payment_status === 'awaiting_proof' && agent.status === 'pending' && (
            <>
              {/* Kartu Tagihan Transfer */}
              <div className="tw-agen-status-card">
                <div className="tw-agen-status-card-header">
                  <CreditCard size={18} color="var(--tw-brand-primary)" />
                  <h2 className="tw-agen-status-card-title">
                    Instruksi Pembayaran Registrasi
                  </h2>
                </div>

                <div className="tw-agen-status-amount-box">
                  <span className="tw-agen-status-amount-label">
                    Jumlah yang Harus Ditransfer
                  </span>
                  <div className="tw-agen-status-amount-val">
                    {formatRupiah(data.agent_registration_fee)}
                  </div>
                </div>

                {/* Rincian Rekening Bank */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Tujuan Rekening Bank Travel
                  </span>

                  <div className="tw-agen-status-bank-box">
                    <div className="tw-agen-status-bank-row">
                      <span className="tw-agen-status-bank-label">Bank</span>
                      <span className="tw-agen-status-bank-value">{data.agent_bank_name || '-'}</span>
                    </div>

                    <div className="tw-agen-status-bank-row">
                      <span className="tw-agen-status-bank-label">No. Rekening</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.5px', color: '#0F172A' }}>
                          {data.agent_bank_account_number || '-'}
                        </span>
                        {data.agent_bank_account_number && (
                          <button
                            type="button"
                            onClick={handleCopyBank}
                            className={`tw-agen-status-copy-btn ${copiedBank ? 'tw-agen-status-copy-btn--copied' : ''}`}
                            title="Salin nomor rekening"
                          >
                            {copiedBank ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="tw-agen-status-bank-row">
                      <span className="tw-agen-status-bank-label">Atas Nama</span>
                      <span className="tw-agen-status-bank-value">{data.agent_bank_account_holder || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Upload Bukti Transfer */}
              <form onSubmit={handleUploadPaymentProof} className="tw-agen-status-card">
                <div className="tw-agen-status-card-header">
                  <Upload size={18} color="var(--tw-brand-primary)" />
                  <h3 className="tw-agen-status-card-title">
                    Unggah Bukti Transfer
                  </h3>
                </div>

                <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                  Setelah transfer berhasil, mohon unggah foto atau tangkapan layar struk transfer (maksimal 5MB, format JPG/PNG/WebP).
                </p>

                {uploadError && (
                  <div className="tw-agen-status-alert tw-agen-status-alert--error">
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{uploadError}</span>
                  </div>
                )}

                {uploadSuccess && (
                  <div className="tw-agen-status-alert tw-agen-status-alert--success">
                    <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                    <span>{uploadSuccess}</span>
                  </div>
                )}

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="tw-agen-status-file-input"
                />

                {previewUrl && (
                  <div className="tw-agen-status-preview-box">
                    <img
                      src={previewUrl}
                      alt="Preview Bukti Transfer"
                      className="tw-agen-status-preview-img"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={uploading || !selectedFile}
                >
                  <Upload size={15} />
                  <span>{uploading ? 'Mengunggah Bukti...' : 'Kirim Bukti Transfer'}</span>
                </Button>
              </form>
            </>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              KONDISI 2: BERBAYAR & SUDAH UPLOAD (pending_verification)
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {agent.payment_status === 'pending_verification' && agent.status === 'pending' && (
            <div className="tw-agen-status-card tw-agen-status-card-center">
              <div className="tw-agen-status-icon-badge tw-agen-status-icon-badge--pending">
                <Clock size={30} />
              </div>

              <div>
                <h2 className="tw-agen-status-state-title">
                  Bukti Pembayaran Sedang Diverifikasi
                </h2>
                <p className="tw-agen-status-state-desc">
                  Bukti transfer Anda telah berhasil diterima. Admin travel sedang memverifikasi pembayaran Anda (biasanya dalam 1x24 jam kerja).
                </p>
              </div>

              {agent.payment_proof_url && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                    Bukti yang Diunggah:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowProofModal(true)}
                    className="tw-agen-status-proof-thumb"
                    title="Lihat bukti ukuran penuh"
                  >
                    <img
                      src={agent.payment_proof_url}
                      alt="Bukti Transfer"
                      className="tw-agen-status-proof-thumb-img"
                    />
                    <div className="tw-agen-status-proof-thumb-overlay">
                      <Eye size={18} />
                    </div>
                  </button>
                </div>
              )}

              <Button
                variant="secondary"
                size="md"
                onClick={() => fetchAgentMe(true)}
                disabled={refreshing}
              >
                <RefreshCw size={15} />
                <span>{refreshing ? 'Memperbarui...' : 'Cek Status Terbaru'}</span>
              </Button>
            </div>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              KONDISI 3: GRATIS & MENUNGGU PENINJAUAN (not_applicable & pending)
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {agent.payment_status === 'not_applicable' && agent.status === 'pending' && (
            <div className="tw-agen-status-card tw-agen-status-card-center">
              <div className="tw-agen-status-icon-badge tw-agen-status-icon-badge--pending">
                <Clock size={30} />
              </div>

              <div>
                <h2 className="tw-agen-status-state-title">
                  Pendaftaran Sedang Ditinjau
                </h2>
                <p className="tw-agen-status-state-desc">
                  Terima kasih telah mendaftar sebagai mitra agen. Data pendaftaran Anda sedang ditinjau oleh manajemen travel. Kami akan menghubungi Anda jika ada data tambahan yang diperlukan.
                </p>
              </div>

              <Button
                variant="secondary"
                size="md"
                onClick={() => fetchAgentMe(true)}
                disabled={refreshing}
              >
                <RefreshCw size={15} />
                <span>{refreshing ? 'Memperbarui...' : 'Cek Status Terbaru'}</span>
              </Button>
            </div>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              KONDISI 4: DITOLAK (rejected)
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {agent.status === 'rejected' && (
            <>
              <div className="tw-agen-status-card tw-agen-status-card-center">
                <div className="tw-agen-status-icon-badge tw-agen-status-icon-badge--rejected">
                  <XCircle size={30} />
                </div>

                <div>
                  <h2 className="tw-agen-status-state-title" style={{ color: '#DC2626' }}>
                    Pendaftaran Belum Disetujui
                  </h2>
                  <p className="tw-agen-status-state-desc">
                    Mohon maaf, pengajuan pendaftaran kemitraan agen Anda saat ini ditolak oleh pihak manajemen travel.
                  </p>

                  {agent.rejection_reason && (
                    <div
                      style={{
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FCA5A5',
                        borderRadius: '8px',
                        padding: '12px 14px',
                        marginTop: '12px',
                        fontSize: '13px',
                        color: '#991B1B',
                        textAlign: 'left',
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ display: 'block', marginBottom: '4px', color: '#7F1D1D' }}>
                        Alasan Penolakan dari Admin:
                      </strong>
                      <span>{agent.rejection_reason}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '280px', marginTop: '14px' }}>
                  <a
                    href={helpWaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tw-button tw-button--secondary tw-button--md"
                    style={{ textDecoration: 'none', justifyContent: 'center' }}
                  >
                    <MessageCircle size={15} />
                    <span>Hubungi Admin Travel</span>
                  </a>

                  <Link
                    href="/"
                    className="tw-button tw-button--secondary tw-button--md"
                    style={{ textDecoration: 'none', justifyContent: 'center' }}
                  >
                    <span>Kembali ke Beranda</span>
                  </Link>
                </div>
              </div>

              {/* Form Unggah Ulang Bukti Pembayaran (Agar tidak buntu) */}
              <form onSubmit={handleUploadPaymentProof} className="tw-agen-status-card">
                <div className="tw-agen-status-card-header">
                  <Upload size={18} color="var(--tw-brand-primary)" />
                  <h3 className="tw-agen-status-card-title">
                    Unggah Ulang Bukti Pembayaran
                  </h3>
                </div>

                <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                  Jika penolakan terkait kesalahan bukti transfer, silakan unggah kembali bukti transfer baru yang jelas dan valid. Status akun akan otomatis ditinjau kembali oleh admin.
                </p>

                {uploadError && (
                  <div className="tw-agen-status-alert tw-agen-status-alert--error">
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{uploadError}</span>
                  </div>
                )}

                {uploadSuccess && (
                  <div className="tw-agen-status-alert tw-agen-status-alert--success">
                    <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                    <span>{uploadSuccess}</span>
                  </div>
                )}

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="tw-agen-status-file-input"
                />

                {previewUrl && (
                  <div className="tw-agen-status-preview-box">
                    <img
                      src={previewUrl}
                      alt="Preview Bukti Transfer Baru"
                      className="tw-agen-status-preview-img"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={uploading || !selectedFile}
                >
                  <Upload size={16} />
                  <span>{uploading ? 'Mengunggah...' : 'Kirim Ulang Bukti Transfer'}</span>
                </Button>
              </form>
            </>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              KONDISI 5: AKTIF (active)
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {agent.status === 'active' && (
            <>
              {/* Kartu Status Aktif */}
              <div className="tw-agen-status-card tw-agen-status-card-center">
                <div className="tw-agen-status-icon-badge tw-agen-status-icon-badge--success">
                  <CheckCircle2 size={32} />
                </div>

                <div>
                  <h2 className="tw-agen-status-state-title">
                    Kemitraan Agen Aktif
                  </h2>
                  <p className="tw-agen-status-state-desc">
                    Selamat! Akun kemitraan agen Anda sudah aktif dan siap digunakan untuk menyebarkan syiar umroh.
                  </p>
                </div>
              </div>

              {/* Kartu Tautan Referral */}
              <div className="tw-agen-status-card">
                <div className="tw-agen-status-card-header">
                  <Share2 size={18} color="var(--tw-brand-primary)" />
                  <h3 className="tw-agen-status-card-title">
                    Tautan Syiar & Kode Referral
                  </h3>
                </div>

                {/* Kode Referral */}
                <div className="tw-agen-status-ref-code-box">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                      Kode Referral Anda
                    </span>
                    <span className="tw-agen-status-ref-code-val">
                      {agent.referral_code}
                    </span>
                  </div>
                </div>

                {/* URL Referral */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                    Link Landing Page Travel Anda:
                  </span>
                  <div className="tw-agen-status-ref-link-box">
                    {getReferralUrl()}
                  </div>
                </div>

                {/* Tombol Aksi Bagikan */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Button variant="primary" size="md" onClick={handleCopyRefLink}>
                    {copiedRef ? <Check size={15} /> : <Copy size={15} />}
                    <span>{copiedRef ? 'Tautan Tersalin!' : 'Salin Tautan Referral'}</span>
                  </Button>

                  {typeof window !== 'undefined' && (
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Bismillah, mari wujudkan niat suci ibadah umroh bersama ${tenant?.name || 'kami'}. Info paket lengkap dan pendaftaran: ${getReferralUrl()}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tw-button tw-button--secondary tw-button--md"
                      style={{ textDecoration: 'none', justifyContent: 'center' }}
                    >
                      <Share2 size={15} />
                      <span>Bagikan ke WhatsApp</span>
                    </a>
                  )}

                  <Link
                    href="/agen/dashboard"
                    className="tw-button tw-button--primary tw-button--md"
                    style={{
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>Buka Dasbor Agen</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Preview Bukti Transfer Full */}
        {showProofModal && agent.payment_proof_url && (
          <div
            className="tw-agen-status-modal-overlay"
            onClick={() => setShowProofModal(false)}
          >
            <div
              className="tw-agen-status-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                Bukti Pembayaran
              </h3>
              <img
                src={agent.payment_proof_url}
                alt="Bukti Transfer Penuh"
                className="tw-agen-status-modal-img"
              />
              <Button variant="secondary" size="sm" onClick={() => setShowProofModal(false)}>
                <span>Tutup Pratinjau</span>
              </Button>
            </div>
          </div>
        )}

        {/* Persistent Bottom Navbar */}
        <BottomNavbar waNumber={tenant?.whatsapp_number || undefined} />
      </MobileContainer>
    </div>
  );
}
