'use client';

// Agent partnership status. One question per visit: "where am I, and what do I do next?". A step bar shows
// the stage (sign up, pay when the travel charges a fee, verification, active); below it only the current
// stage's content: the transfer details and proof upload, the waiting notice, the rejection reason, or the
// referral link once active.
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  ImageUp,
  RefreshCw,
  Share2,
  MessageCircle,
  XCircle,
  PauseCircle,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { PublicHeader } from '../../../components/PublicHeader';
import { PublicFooter } from '../../../components/PublicFooter';
import { whatsappLink } from '../../../lib/usePlatformSettings';
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

// Travel contact data for the footer (public tenant info).
interface FooterInfo {
  name?: string;
  address?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  email?: string | null;
  ppiu_number?: string | null;
  brand_primary_color?: string | null;
}

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const formatRupiah = (val?: number) => 'Rp ' + (val ?? 0).toLocaleString('id-ID');

/* ---------- Step bar ---------- */
type StepState = 'done' | 'current' | 'todo';

const StepBar: React.FC<{ steps: { label: string; state: StepState }[] }> = ({ steps }) => (
  <ol className="tw-st-steps" aria-label="Tahap kemitraan">
    {steps.map((s, i) => (
      <li key={s.label} className={`tw-st-step tw-st-step--${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
        <span className="tw-st-step__dot" aria-hidden="true">
          {s.state === 'done' ? <Check size={12} strokeWidth={3} /> : i + 1}
        </span>
        <span className="tw-st-step__label">{s.label}</span>
      </li>
    ))}
  </ol>
);

/* ---------- Proof upload (custom picker with preview) ---------- */
const ProofUpload: React.FC<{
  submitLabel: string;
  uploading: boolean;
  previewUrl: string | null;
  error: string | null;
  onPick: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
}> = ({ submitLabel, uploading, previewUrl, error, onPick, onSubmit }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <form onSubmit={onSubmit} className="tw-st-upload">
      <input
        ref={inputRef}
        id="proof-file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="tw-st-upload__input"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        disabled={uploading}
      />
      {previewUrl ? (
        <div className="tw-st-upload__preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob URL) of the chosen file */}
          <img src={previewUrl} alt="Pratinjau bukti transfer" />
          <button type="button" className="tw-st-link" onClick={() => inputRef.current?.click()} disabled={uploading}>
            Ganti foto
          </button>
        </div>
      ) : (
        <label htmlFor="proof-file" className="tw-st-upload__drop">
          <ImageUp size={24} aria-hidden="true" />
          <span className="tw-st-upload__title">Pilih foto bukti transfer</span>
          <span className="tw-st-upload__hint">JPG, PNG, atau WebP, maks. 5 MB</span>
        </label>
      )}

      {error && (
        <p className="tw-st-alert tw-st-alert--error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" disabled={uploading || !previewUrl} className="tw-st-submit">
        {uploading ? 'Mengirim...' : submitLabel}
      </Button>
    </form>
  );
};

export default function AgenStatusPage() {
  const router = useRouter();

  const [data, setData] = useState<AgentMeData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [footer, setFooter] = useState<FooterInfo | null>(null);

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

  // The transfer proof is a private file: downloaded with the agent's own token, not from /uploads.
  const proofRef = data?.agent.payment_proof_url || null;
  const [proofSrc, setProofSrc] = useState<string | null>(null);
  // A re-upload keeps the same file path, so bump this after each successful upload to re-download it.
  const [proofVersion, setProofVersion] = useState<number>(0);
  useEffect(() => {
    const token = localStorage.getItem('agent_token');
    if (!proofRef || !token) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetch(`/api/agent/files?path=${encodeURIComponent(proofRef)}&v=${proofVersion}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        objectUrl = URL.createObjectURL(await res.blob());
        setProofSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [proofRef, proofVersion]);

  // Footer: the travel's public contact data.
  useEffect(() => {
    fetch('/api/public/tenant-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json) setFooter(json);
      })
      .catch(() => {});
  }, []);

  const loadAgentMe = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      const res = await fetch('/api/agent/me', {
        headers: { Authorization: `Bearer ${token}` },
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

      setData({
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
          // GET /api/agent/me returns the travel name flat (tenant_name), without a tenant object.
          name: rawTenant.name || rawData.tenant_name || rawAgent.tenant_name || 'Portal Mitra Agen',
          brand_primary_color: rawTenant.brand_primary_color,
          brand_logo_url: rawTenant.brand_logo_url,
          whatsapp_number: rawTenant.whatsapp_number,
        },
        agent_registration_fee: rawData.agent_registration_fee ?? paymentInfo.registration_fee,
        agent_bank_name: rawData.agent_bank_name || paymentInfo.bank_name,
        agent_bank_account_number: rawData.agent_bank_account_number || paymentInfo.bank_account_number,
        agent_bank_account_holder: rawData.agent_bank_account_holder || paymentInfo.bank_account_holder,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Manual refresh ("Cek status terbaru", retry, after an upload).
  const refresh = () => {
    setRefreshing(true);
    setError(null);
    return loadAgentMe();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set when the response lands
    loadAgentMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const pickFile = (file: File | null) => {
    setUploadError(null);
    setUploadSuccess(null);
    if (!file) return;
    if (file.size > MAX_PROOF_BYTES) {
      setUploadError('Ukuran foto maksimal 5 MB.');
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUploadPaymentProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Pilih foto bukti transfer terlebih dahulu.');
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
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error || 'Gagal mengunggah bukti transfer.');
        return;
      }

      setUploadSuccess('Bukti transfer terkirim. Admin travel akan memverifikasinya.');
      setProofVersion((v) => v + 1);
      setSelectedFile(null);
      setPreviewUrl(null);
      await refresh();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Koneksi bermasalah saat mengunggah.');
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
      // /ref/CODE records the click and remembers the agent even if the visitor opens other pages.
      return `${window.location.origin}/ref/${data.agent.referral_code}`;
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

  const layoutStyle = Object.fromEntries(
    Object.entries(designTokens.publicConversionLayout).map(([key, value]) => ['--cro-' + key, value])
  );
  // Travel branding and WhatsApp come from the public tenant info (the agent profile has no tenant object).
  const brandColor = footer?.brand_primary_color || data?.tenant?.brand_primary_color;
  const brandingStyle = brandColor ? { '--tw-brand-primary': brandColor } : {};

  // No travel WhatsApp number -> hide the contact button instead of pointing to a placeholder number.
  const helpWaUrl = whatsappLink(
    footer?.whatsapp_number || data?.tenant?.whatsapp_number,
    `Halo Admin, saya mitra agen ${data?.tenant?.name || 'travel'} ingin menanyakan status kemitraan`
  );

  const footerEl = (
    <PublicFooter
      tenantName={footer?.name || data?.tenant?.name}
      address={footer?.address}
      phone={footer?.phone}
      whatsappNumber={footer?.whatsapp_number || data?.tenant?.whatsapp_number}
      email={footer?.email}
      ppiuNumber={footer?.ppiu_number}
    />
  );

  const shell = (children: React.ReactNode) => (
    <div className="tw-agen-status-wrap tw-st" style={{ ...layoutStyle, ...brandingStyle } as React.CSSProperties}>
      <MobileContainer>
        <PublicHeader title="Status Kemitraan" showBack={true} onBackClick={handleBack} backHref="/" hideNotification={true} />
        {children}
        {footerEl}
      </MobileContainer>
    </div>
  );

  if (loading) {
    return shell(
      <div className="tw-st-center" role="status">
        <span className="tw-st-spinner" aria-hidden="true" />
        <span>Memuat status kemitraan...</span>
      </div>
    );
  }

  if (error || !data) {
    return shell(
      <div className="tw-st-center">
        <AlertCircle size={28} className="tw-st-center__icon" aria-hidden="true" />
        <h1 className="tw-st-title">Status belum bisa dimuat</h1>
        <p className="tw-st-desc">{error}</p>
        <Button variant="secondary" size="md" fullWidth={false} onClick={() => refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          <span>Coba lagi</span>
        </Button>
      </div>
    );
  }

  const { agent, tenant } = data;
  const paid = agent.payment_status !== 'not_applicable';
  const awaitingProof = agent.status === 'pending' && agent.payment_status === 'awaiting_proof';
  const verifying = agent.status === 'pending' && !awaitingProof;

  // Step bar for the normal path; a rejected or paused account shows its notice instead.
  const showSteps = agent.status === 'pending' || agent.status === 'active';
  const stepLabels = ['Daftar', ...(paid ? ['Bayar'] : []), 'Verifikasi', 'Aktif'];
  const currentIdx = agent.status === 'active' ? stepLabels.length : awaitingProof ? 1 : stepLabels.length - 2;
  const steps = stepLabels.map((label, i) => ({
    label,
    state: (i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo') as StepState,
  }));

  const contactButtons = (
    <div className="tw-st-actions">
      {helpWaUrl && (
        <a href={helpWaUrl} target="_blank" rel="noopener noreferrer" className="tw-button tw-button--secondary tw-button--md">
          <MessageCircle size={16} aria-hidden="true" />
          <span>Hubungi admin travel</span>
        </a>
      )}
      <Link href="/" className="tw-st-link tw-st-link--center">
        Kembali ke beranda
      </Link>
    </div>
  );

  return shell(
    <div className="tw-st-body">
      {showSteps && <StepBar steps={steps} />}

      {uploadSuccess && (
        <p className="tw-st-alert tw-st-alert--success" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{uploadSuccess}</span>
        </p>
      )}

      {/* 1. Paid sign-up, proof not sent yet */}
      {awaitingProof && (
        <>
          <section className="tw-st-section">
            <h1 className="tw-st-title">Selesaikan pembayaran</h1>
            <p className="tw-st-desc">Transfer biaya kemitraan ke rekening travel, lalu kirim foto bukti transfernya.</p>

            <div className="tw-st-transfer">
              <span className="tw-st-transfer__label">Jumlah transfer</span>
              <span className="tw-st-transfer__amount">{formatRupiah(data.agent_registration_fee)}</span>
              <dl className="tw-st-bank">
                <div className="tw-st-bank__row">
                  <dt>Bank</dt>
                  <dd>{data.agent_bank_name || '-'}</dd>
                </div>
                <div className="tw-st-bank__row">
                  <dt>No. rekening</dt>
                  <dd className="tw-st-bank__account">
                    <span>{data.agent_bank_account_number || '-'}</span>
                    {data.agent_bank_account_number && (
                      <button
                        type="button"
                        onClick={handleCopyBank}
                        className="tw-st-copy"
                        aria-label={copiedBank ? 'Nomor rekening tersalin' : 'Salin nomor rekening'}
                      >
                        {copiedBank ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                        <span>{copiedBank ? 'Tersalin' : 'Salin'}</span>
                      </button>
                    )}
                  </dd>
                </div>
                <div className="tw-st-bank__row">
                  <dt>Atas nama</dt>
                  <dd>{data.agent_bank_account_holder || '-'}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="tw-st-section">
            <h2 className="tw-st-subtitle">Kirim bukti transfer</h2>
            <ProofUpload
              submitLabel="Kirim bukti transfer"
              uploading={uploading}
              previewUrl={previewUrl}
              error={uploadError}
              onPick={pickFile}
              onSubmit={handleUploadPaymentProof}
            />
          </section>
        </>
      )}

      {/* 2. Waiting for the travel: proof sent, or free sign-up under review */}
      {verifying && (
        <section className="tw-st-section">
          <h1 className="tw-st-title">{paid ? 'Pembayaran sedang diverifikasi' : 'Pendaftaran sedang ditinjau'}</h1>
          <p className="tw-st-desc">
            {paid
              ? 'Bukti transfer Anda sudah diterima. Admin travel memverifikasinya, biasanya dalam 1x24 jam kerja.'
              : 'Data pendaftaran Anda sedang ditinjau travel. Anda akan dihubungi bila ada data yang perlu dilengkapi.'}
          </p>

          {paid && agent.payment_proof_url && (
            <button type="button" onClick={() => setShowProofModal(true)} className="tw-st-proof">
              {proofSrc && (
                // eslint-disable-next-line @next/next/no-img-element -- private file shown from a blob URL
                <img src={proofSrc} alt="" />
              )}
              <span>Lihat bukti yang dikirim</span>
            </button>
          )}

          <Button variant="secondary" size="md" onClick={() => refresh()} disabled={refreshing}>
            <RefreshCw size={16} aria-hidden="true" />
            <span>{refreshing ? 'Memperbarui...' : 'Cek status terbaru'}</span>
          </Button>
        </section>
      )}

      {/* 3. Rejected: reason, contact, and a new proof upload */}
      {agent.status === 'rejected' && (
        <>
          <section className="tw-st-section">
            <h1 className="tw-st-title tw-st-title--icon">
              <XCircle size={22} className="tw-st-icon--danger" aria-hidden="true" />
              Pendaftaran belum disetujui
            </h1>
            <p className="tw-st-desc">Pengajuan kemitraan Anda ditolak oleh travel.</p>
            {agent.rejection_reason && (
              <div className="tw-st-reason">
                <span className="tw-st-reason__label">Alasan dari admin</span>
                <p>{agent.rejection_reason}</p>
              </div>
            )}
            {contactButtons}
          </section>

          {/* Only an agent who registered with a fee has a proof to resend. Gate on the agent's own
              payment_status, not the travel's current fee (it may have changed since sign-up). */}
          {paid && (
            <section className="tw-st-section">
              <h2 className="tw-st-subtitle">Kirim ulang bukti transfer</h2>
              <p className="tw-st-desc">Jika penolakan karena bukti transfer, kirim foto bukti yang baru. Admin akan meninjaunya kembali.</p>
              <ProofUpload
                submitLabel="Kirim ulang bukti transfer"
                uploading={uploading}
                previewUrl={previewUrl}
                error={uploadError}
                onPick={pickFile}
                onSubmit={handleUploadPaymentProof}
              />
            </section>
          )}
        </>
      )}

      {/* 4. Paused by the travel */}
      {agent.status === 'inactive' && (
        <section className="tw-st-section">
          <h1 className="tw-st-title tw-st-title--icon">
            <PauseCircle size={22} className="tw-st-icon--muted" aria-hidden="true" />
            Akun agen dinonaktifkan
          </h1>
          <p className="tw-st-desc">
            Travel menonaktifkan kemitraan Anda. Link referral, daftar jamaah, dan pencairan komisi tidak bisa dipakai sampai
            akun diaktifkan kembali.
          </p>
          {contactButtons}
        </section>
      )}

      {/* 5. Active: referral link */}
      {agent.status === 'active' && (
        <section className="tw-st-section">
          <h1 className="tw-st-title">Kemitraan aktif</h1>
          <p className="tw-st-desc">Bagikan link Anda. Setiap calon jamaah dari link ini tercatat atas nama Anda.</p>

          <div className="tw-st-transfer">
            <span className="tw-st-transfer__label">Kode referral</span>
            <span className="tw-st-transfer__amount">{agent.referral_code}</span>
            <span className="tw-st-reflink">{getReferralUrl()}</span>
          </div>

          <div className="tw-st-actions">
            <Button variant="primary" size="lg" onClick={handleCopyRefLink}>
              {copiedRef ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              <span>{copiedRef ? 'Link tersalin' : 'Salin link referral'}</span>
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Bismillah, mari wujudkan niat ibadah umroh bersama ${tenant?.name || 'kami'}. Info paket dan pendaftaran: ${getReferralUrl()}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tw-button tw-button--secondary tw-button--md"
            >
              <Share2 size={16} aria-hidden="true" />
              <span>Bagikan ke WhatsApp</span>
            </a>
            <Link href="/agen/dashboard" className="tw-st-link tw-st-link--center">
              Buka dasbor agen
            </Link>
          </div>
        </section>
      )}

      {/* Signed-in account, quietly at the end: the page is about the stage, not the profile. */}
      <p className="tw-st-signed">
        Masuk sebagai <b>{agent.name}</b>
        <span aria-hidden="true"> · </span>
        <button type="button" onClick={handleLogout} className="tw-st-link">
          Keluar
        </button>
      </p>

      {/* Proof lightbox */}
      {showProofModal && agent.payment_proof_url && (
        <div className="tw-agen-status-modal-overlay" onClick={() => setShowProofModal(false)}>
          <div className="tw-agen-status-modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Bukti pembayaran">
            <h2 className="tw-st-subtitle">Bukti pembayaran</h2>
            {proofSrc && (
              // eslint-disable-next-line @next/next/no-img-element -- private file shown from a blob URL
              <img src={proofSrc} alt="Bukti transfer" className="tw-agen-status-modal-img" />
            )}
            <Button variant="secondary" size="md" onClick={() => setShowProofModal(false)}>
              Tutup
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
