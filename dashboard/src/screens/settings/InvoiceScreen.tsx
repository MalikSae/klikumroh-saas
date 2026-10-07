// Tagihan: how much to transfer, where, and the transfer proof upload.
import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CheckCircle2, Copy, ExternalLink, ImageIcon, ImagePlus } from 'lucide-react';
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
// Display serif of the marketing landing, for the invoice title only (founder approval 7 Oct 2026).
import '@fontsource/instrument-serif/400.css';
import { MB, fitsUploadLimit } from '../../utils/uploadLimit';
import { copyText } from '../../utils/clipboard';
import { formatDateTimeWIB } from '../../utils/datetime';

const MAX_PROOF_BYTES = 10 * MB; // server body limit (MaxBytesReader 10<<20)

const CopyValue: React.FC<{ value: string; label: string; children: React.ReactNode }> = ({ value, label, children }) => {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    const ok = await copyText(value);
    setCopied(ok);
    setFailed(!ok);
    window.setTimeout(() => (ok ? setCopied(false) : setFailed(false)), 2000);
  };
  const text = copied ? `${label} tersalin` : failed ? 'Gagal menyalin, salin manual' : `Salin ${label}`;
  return (
    <span className="st-copy">
      {children}
      <button type="button" className="st-copy__btn" onClick={copy} aria-label={text} title={text}>
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
  // Platform settings (bank account, WhatsApp) are extra: when they fail the invoice still opens and can be paid.
  const [platformFailed, setPlatformFailed] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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
    Promise.all([
      fetchPaymentVerificationDetail(vid),
      fetchPlatformSettings().catch(() => {
        setPlatformFailed(true);
        return null;
      }),
      fetchTenantSubscription(true).catch(() => null),
    ])
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
      try {
        await uploadRenewalProof(pv.id, file);
      } catch (e) {
        setUploadError(errorText(e, 'Gagal mengunggah bukti transfer'));
        return;
      }
      // The proof is saved from here on: a failed refresh must not be reported as a failed upload.
      try {
        const next = await fetchPaymentVerificationDetail(pv.id);
        setPv(next);
        // Through the frame, so its banner and redirect use the new state too.
        if (frame) await frame.refreshSubscription();
        else await fetchTenantSubscription(true).catch(() => null);
        frame?.refreshBadges();
      } catch {
        setUploadError('Bukti transfer sudah terkirim, tetapi halaman belum diperbarui. Muat ulang halaman untuk melihat statusnya.');
      }
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
  // Plan promo the invoice was billed with: off the normal price (amount) before the coupon (backend rounding).
  const promoCut = pv.promo_percent ? pv.amount - Math.max(0, Math.round(pv.amount * (1 - pv.promo_percent / 100))) : 0;
  // Proof sent and waiting for review: the payment block shows that state instead of asking to upload again.
  const sent = pv.status === 'pending' && !!pv.proof_url;


  // A new travel lands here straight from the checkout: the signup steps continue there (step 2 of 3).
  // It is already inside its dashboard, so the page says so and, once the activation invoice is approved,
  // where to go next (founder, 7 Oct 2026).
  const subInfo = frame?.subscription;
  const signingUp = subInfo?.status === 'pending';
  const firstInvoiceId = subInfo?.payment_verifications?.length ? Math.min(...subInfo.payment_verifications.map((x) => x.id)) : null;
  const justActivated = !signingUp && subInfo?.status === 'active' && pv.status === 'approved' && pv.id === firstInvoiceId;
  const travelLabel = pv.tenant_name || subInfo?.tenant_name || 'Travel Anda';

  return (
    <>
    {(signingUp || justActivated) && (
      <ol className="st-signup-steps" aria-label="Langkah pendaftaran">
        <li className="st-signup-steps__done"><Check className="ku-icon--sm" aria-hidden="true" />Data travel</li>
        {justActivated ? (
          <>
            <li className="st-signup-steps__done"><Check className="ku-icon--sm" aria-hidden="true" />Pembayaran</li>
            <li className="st-signup-steps__current" aria-current="step"><Check className="ku-icon--sm" aria-hidden="true" />Aktif</li>
          </>
        ) : (
          <>
            <li className="st-signup-steps__current" aria-current="step"><span>2</span>Pembayaran</li>
            <li><span>3</span>Aktif</li>
          </>
        )}
      </ol>
    )}
    {signingUp && (
      <div className="st-signup-note">
        <Banner tone="info">Akun dashboard {travelLabel} sudah dibuat. Dashboard dan website travel terbuka penuh setelah pembayaran diverifikasi.</Banner>
      </div>
    )}
    {justActivated && (
      <div className="st-signup-note">
        <Banner tone="success" action={<Button variant="primary" size="sm" to="/">Buka dashboard</Button>}>
          <b>{travelLabel} sudah aktif.</b> Lanjutkan di dashboard: lengkapi website dan tambahkan paket.
        </Banner>
      </div>
    )}
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
      {pv.status === 'approved' && !justActivated && <Banner tone="success"><b>Pembayaran diterima</b>{pv.reviewed_at ? ' pada ' + fmtDate(pv.reviewed_at) : ''}. Langganan Anda sudah diperbarui.</Banner>}
      <section aria-label="Rincian tagihan">
        <div className="st-invoice__item-head"><span>Deskripsi</span><span>Jumlah</span></div>
        <div className="st-invoice__item">
          <div><strong>Langganan KlikUmroh</strong><span>{planText}</span></div>
          <strong>{fmtRupiah(pv.amount)}</strong>
        </div>
        <dl className="st-invoice__totals">
          {promoCut > 0 && <div><dt>Promo {pv.promo_percent}%</dt><dd>−{fmtRupiah(promoCut)}</dd></div>}
          {pv.coupon_code && <div><dt>Diskon kupon {pv.coupon_code}</dt><dd>−{fmtRupiah(Math.max(0, pv.amount - promoCut - (pv.final_amount - (pv.unique_code ?? 0))))}</dd></div>}
          {(pv.unique_code ?? 0) > 0 && <div><dt>Kode unik</dt><dd>{fmtRupiah(pv.unique_code ?? 0)}</dd></div>}
          <div className="st-invoice__total"><dt>{needsTransfer ? 'Total transfer' : 'Total tagihan'}</dt><dd>{needsTransfer ? <CopyValue value={amountText} label="jumlah transfer">{fmtRupiah(pv.final_amount)}</CopyValue> : fmtRupiah(pv.final_amount)}</dd></div>
        </dl>
      </section>
      <div className="st-invoice__payment">
        {needsTransfer && !sent && <section className="st-bank" aria-labelledby="invoice-bank-title">
          <h2 id="invoice-bank-title">Transfer bank</h2>
          {bank ? <dl className="st-bank__list">
            <div><dt>Bank</dt><dd>{bank.bank_name}</dd></div>
            <div><dt>Nomor rekening</dt><dd><CopyValue value={bank.bank_account_number.replace(/\s/g, '')} label="nomor rekening">{bank.bank_account_number}</CopyValue></dd></div>
            <div><dt>Atas nama</dt><dd>{bank.bank_account_holder}</dd></div>
          </dl> : <p className="st-muted">{platformFailed ? 'Rekening tujuan gagal dimuat. Muat ulang halaman sebelum transfer.' : 'Rekening tujuan belum tersedia. Hubungi tim KlikUmroh sebelum transfer.'}</p>}
          {(pv.unique_code ?? 0) > 0 && <p className="st-invoice__note">Transfer sesuai total, termasuk kode unik <b>{pv.unique_code}</b>, agar pembayaran dapat dicocokkan.</p>}
        </section>}
        <section className="st-proof" aria-labelledby="invoice-proof-title">
          <h2 id="invoice-proof-title">{sent ? 'Bukti transfer' : canUpload ? 'Konfirmasi pembayaran' : 'Bukti pembayaran'}</h2>
          {pv.proof_url && (
            <div className={sent ? 'st-proof__file st-proof__file--sent' : 'st-proof__file'} role={sent ? 'status' : undefined}>
              {proofUrl ? (
                <a className="st-proof__thumb" href={proofUrl} target="_blank" rel="noopener noreferrer" aria-label="Lihat bukti transfer">
                  <img src={proofUrl} alt="" />
                </a>
              ) : (
                <span className="st-proof__thumb st-proof__thumb--empty" aria-hidden="true"><ImageIcon className="ku-icon--sm" /></span>
              )}
              <div className="st-proof__meta">
                {sent ? (
                  <strong className="st-proof__ok"><CheckCircle2 className="ku-icon--sm" aria-hidden="true" />Bukti transfer terkirim</strong>
                ) : (
                  <strong>{pv.status === 'rejected' ? 'Bukti sebelumnya ditolak' : 'Bukti transfer'}</strong>
                )}
                <span>Diunggah {formatDateTimeWIB(pv.updated_at)}</span>
                {sent && <span>Diverifikasi maksimal 24 jam</span>}
                {proofUrl && <a href={proofUrl} target="_blank" rel="noopener noreferrer">Lihat bukti <ExternalLink className="ku-icon--sm" aria-hidden="true" /></a>}
              </div>
            </div>
          )}
          {canUpload && pv.final_amount > 0 ? <>
            {sent ? (
              <Button size="sm" className="st-proof__replace" onClick={() => fileRef.current?.click()} disabled={uploading} icon={<ImagePlus className="ku-icon--sm" />}>
                {uploading ? 'Mengunggah...' : 'Ganti bukti'}
              </Button>
            ) : <>
              <p className="st-proof__intro">Sudah transfer? Unggah bukti pembayaran untuk diverifikasi.</p>
              <Button variant="primary" block className="st-proof__cta" onClick={() => fileRef.current?.click()} disabled={uploading} icon={<ImagePlus className="ku-icon--sm" />}>
                {uploading ? 'Mengunggah...' : pv.proof_url ? 'Unggah ulang bukti transfer' : 'Unggah bukti transfer'}
              </Button>
              <p className="st-invoice__file-hint">JPG, PNG, atau WebP. Maksimal 10 MB.</p>
            </>}
            {uploadError && <div className="ku-field__error" role="alert">{uploadError}</div>}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="st-hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </> : !pv.proof_url && <p className="st-muted">Tidak ada bukti transfer.</p>}
        </section>
      </div>
      {platform?.whatsapp_number && <footer className="st-invoice__footer"><span>Perlu bantuan dengan tagihan ini?</span><a href={waLink(platform.whatsapp_number, 'Halo KlikUmroh, saya ingin bertanya tentang tagihan #' + pv.id + '.')} target="_blank" rel="noopener noreferrer">Hubungi KlikUmroh</a></footer>}
    </article>
    </>
  );
};
