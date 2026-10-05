// Tagihan: how much to transfer, where, and the transfer proof upload.
import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, ExternalLink, ImagePlus } from 'lucide-react';
import {
  fetchPaymentVerificationDetail,
  fetchPlatformSettings,
  fetchPrivateFileUrl,
  fetchTenantSubscription,
  hasPlatformBankDetails,
  uploadRenewalProof,
  type PaymentVerification,
  type PlatformSettings,
} from '../../services/api';
import { Banner, Button, Pill, fmtDate, fmtRupiah, errorText } from '../../ui';
import { useFrame } from '../../app/AppFrame';
import { invoiceStatus, planTitle } from './BillingSettings';
import './InvoiceScreen.css';
import { MB, fitsUploadLimit } from '../../utils/uploadLimit';

const MAX_PROOF_BYTES = 10 * MB; // server body limit (MaxBytesReader 10<<20)

const CopyValue: React.FC<{ value: string; label: string; children: React.ReactNode }> = ({ value, label, children }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };
  return (
    <span className="st-copy">
      {children}
      <button type="button" className="st-copy__btn" onClick={copy} aria-label={copied ? `${label} tersalin` : `Salin ${label}`} title={copied ? 'Tersalin' : `Salin ${label}`}>
        {copied ? <Check className="ku-icon--sm" aria-hidden="true" /> : <Copy className="ku-icon--sm" aria-hidden="true" />}
      </button>
    </span>
  );
};

const waLink = (num: string, text: string) => `https://wa.me/${num.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

export const InvoiceScreen: React.FC = () => {
  const { id } = useParams();
  const frame = useFrame();
  const [pv, setPv] = useState<PaymentVerification | null>(null);
  const [platform, setPlatform] = useState<PlatformSettings | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);
  // The travel's open (pending) invoice, if any. A rejected invoice cannot take a new proof while another
  // invoice is open (the backend answers 409), so its transfer details are not shown then.
  const [openInvoice, setOpenInvoice] = useState<PaymentVerification | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const vid = Number(id);
    if (!vid) {
      setError('Tagihan tidak ditemukan.');
      setLoading(false);
      return;
    }
    Promise.all([fetchPaymentVerificationDetail(vid), fetchPlatformSettings(), fetchTenantSubscription(true).catch(() => null)])
      .then(([p, s, sub]) => {
        setPv(p);
        setPlatform(s);
        setOpenInvoice(sub?.pending_verification ?? null);
      })
      .catch((e) => setError(errorText(e, 'Gagal memuat data')))
      .finally(() => setLoading(false));
  }, [id]);

  // The proof is a private file: load it with the session header.
  useEffect(() => {
    if (!pv?.proof_url) return;
    let url: string | null = null;
    fetchPrivateFileUrl(pv.proof_url)
      .then((u) => {
        url = u;
        setProofUrl(u);
      })
      .catch(() => setProofUrl(null));
    return () => {
      if (url) window.URL.revokeObjectURL(url);
    };
  }, [pv?.proof_url]);

  const upload = async (file: File) => {
    if (!pv) return;
    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError('Unggah foto atau tangkapan layar (JPG, PNG, atau WebP).');
      return;
    }
    if (!fitsUploadLimit(file, 'proof_file', MAX_PROOF_BYTES)) {
      setUploadError('Ukuran berkas maksimal 10 MB.');
      return;
    }
    setUploading(true);
    try {
      await uploadRenewalProof(pv.id, file);
      const next = await fetchPaymentVerificationDetail(pv.id);
      setPv(next);
      setJustUploaded(true);
      await fetchTenantSubscription(true).catch(() => null);
      frame?.refreshBadges();
    } catch (e) {
      setUploadError(errorText(e, 'Gagal mengunggah bukti transfer'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading) return <div className="st-loading" aria-busy="true" />;
  if (!pv) {
    return (
      <div className="st-stack">
        <Button variant="ghost" to="/settings/subscription" icon={<ArrowLeft className="ku-icon--sm" />}>
          Kembali ke langganan
        </Button>
        <Banner tone="danger">{error || 'Tagihan tidak ditemukan.'}</Banner>
      </div>
    );
  }

  const status = invoiceStatus(pv);
  const otherOpen = pv.status === 'rejected' && openInvoice && openInvoice.id !== pv.id ? openInvoice : null;
  const canUpload = pv.status === 'pending' || (pv.status === 'rejected' && !otherOpen);
  const needsTransfer = canUpload && pv.final_amount > 0;
  const bank = platform && hasPlatformBankDetails(platform) ? platform : null;
  const planText = planTitle(pv.plan_name, pv.plan_period_months);
  const amountText = Math.round(pv.final_amount).toString();


  return (
    <article className="st-invoice" aria-labelledby="invoice-title">
      <header className="st-invoice__head">
        <div>
          <p className="st-invoice__issuer">KlikUmroh.id</p>
          <h1 id="invoice-title" className="st-invoice__title">Invoice #{pv.id}</h1>
          <p className="st-muted">Diterbitkan {fmtDate(pv.created_at)}</p>
        </div>
        <Pill tone={status.tone}>{status.label}</Pill>
      </header>
      <div className="st-invoice__recipient">
        <span className="st-muted">Ditagihkan kepada</span>
        <strong>{pv.tenant_name || frame?.subscription?.tenant_name || 'Travel Anda'}</strong>
      </div>
      {pv.status === 'rejected' && !otherOpen && <Banner tone="danger"><b>Bukti transfer ditolak.</b> {pv.rejection_reason || 'Bukti belum sesuai dengan tagihan.'} Unggah ulang bukti yang benar.</Banner>}
      {otherOpen && (
        <Banner tone="info">
          <b>Tagihan ini sudah tidak berlaku.</b> Bukti transfernya ditolak dan sekarang ada tagihan #{otherOpen.id} yang masih terbuka. Lakukan pembayaran lewat tagihan tersebut.{' '}
          <Link to={`/settings/subscription/payment/${otherOpen.id}`}>Buka tagihan #{otherOpen.id}</Link>
        </Banner>
      )}
      {pv.status === 'pending' && pv.proof_url && <Banner tone={justUploaded ? 'success' : 'info'}><b>{justUploaded ? 'Bukti transfer terkirim.' : 'Pembayaran sedang diverifikasi.'}</b> Tim KlikUmroh akan memberi notifikasi setelah pemeriksaan selesai.</Banner>}
      {pv.status === 'approved' && <Banner tone="success"><b>Pembayaran diterima</b>{pv.reviewed_at ? ' pada ' + fmtDate(pv.reviewed_at) : ''}. Langganan Anda sudah diperbarui.</Banner>}
      <section aria-label="Rincian tagihan">
        <div className="st-invoice__item-head"><span>Deskripsi</span><span>Jumlah</span></div>
        <div className="st-invoice__item">
          <div><strong>Langganan KlikUmroh</strong><span>{planText}</span></div>
          <strong>{fmtRupiah(pv.amount)}</strong>
        </div>
        <dl className="st-invoice__totals">
          {pv.coupon_code && <div><dt>Diskon kupon {pv.coupon_code}</dt><dd>−{fmtRupiah(Math.max(0, pv.amount - (pv.final_amount - (pv.unique_code ?? 0))))}</dd></div>}
          {(pv.unique_code ?? 0) > 0 && <div><dt>Kode unik</dt><dd>{fmtRupiah(pv.unique_code ?? 0)}</dd></div>}
          <div className="st-invoice__total"><dt>{needsTransfer ? 'Total transfer' : 'Total tagihan'}</dt><dd>{needsTransfer ? <CopyValue value={amountText} label="jumlah transfer">{fmtRupiah(pv.final_amount)}</CopyValue> : fmtRupiah(pv.final_amount)}</dd></div>
        </dl>
      </section>
      <div className="st-invoice__payment">
        {needsTransfer && <section className="st-bank" aria-labelledby="invoice-bank-title">
          <h2 id="invoice-bank-title">Transfer bank</h2>
          {bank ? <dl className="st-bank__list">
            <div><dt>Bank</dt><dd>{bank.bank_name}</dd></div>
            <div><dt>Nomor rekening</dt><dd><CopyValue value={bank.bank_account_number.replace(/\s/g, '')} label="nomor rekening">{bank.bank_account_number}</CopyValue></dd></div>
            <div><dt>Atas nama</dt><dd>{bank.bank_account_holder}</dd></div>
          </dl> : <p className="st-muted">Rekening tujuan belum tersedia. Hubungi tim KlikUmroh sebelum transfer.</p>}
          {(pv.unique_code ?? 0) > 0 && <p className="st-invoice__note">Transfer sesuai total, termasuk kode unik <b>{pv.unique_code}</b>, agar pembayaran dapat dicocokkan.</p>}
        </section>}
        <section className="st-proof" aria-labelledby="invoice-proof-title">
          <h2 id="invoice-proof-title">{canUpload ? 'Konfirmasi pembayaran' : 'Bukti pembayaran'}</h2>
          {pv.proof_url && <div className="st-invoice__proof-preview">
            {proofUrl ? <a href={proofUrl} target="_blank" rel="noopener noreferrer"><img src={proofUrl} alt="Bukti transfer yang diunggah" /><span><ExternalLink className="ku-icon--sm" aria-hidden="true" /> Lihat bukti transfer</span></a> : <p className="st-muted">Bukti transfer telah diunggah.</p>}
          </div>}
          {canUpload && pv.final_amount > 0 ? <>
            <p className="st-proof__intro">Sudah transfer? Unggah bukti pembayaran untuk diverifikasi.</p>
            <Button variant="primary" block className="st-proof__cta" onClick={() => fileRef.current?.click()} disabled={uploading} icon={<ImagePlus className="ku-icon--sm" />}>
              {uploading ? 'Mengunggah...' : pv.proof_url ? 'Ganti bukti transfer' : 'Unggah bukti transfer'}
            </Button>
            <p className="st-invoice__file-hint">JPG, PNG, atau WebP. Maksimal 10 MB.</p>
            {uploadError && <div className="ku-field__error" role="alert">{uploadError}</div>}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="st-hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </> : !pv.proof_url && <p className="st-muted">Tidak ada bukti transfer.</p>}
        </section>
      </div>
      {platform?.whatsapp_number && <footer className="st-invoice__footer"><span>Perlu bantuan dengan tagihan ini?</span><a href={waLink(platform.whatsapp_number, 'Halo KlikUmroh, saya ingin bertanya tentang tagihan #' + pv.id + '.')} target="_blank" rel="noopener noreferrer">Hubungi KlikUmroh</a></footer>}
    </article>
  );
};
