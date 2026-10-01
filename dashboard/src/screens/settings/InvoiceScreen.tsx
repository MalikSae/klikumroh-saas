// Tagihan: how much to transfer, where, and the transfer proof upload.
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, ExternalLink, ImagePlus, MessageCircle, RefreshCw } from 'lucide-react';
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
import '../website/website.css';

const MAX_PROOF_BYTES = 10 * 1024 * 1024;

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
      <button type="button" className="st-copy__btn" onClick={copy} aria-label={`Salin ${label}`}>
        {copied ? <Check className="ku-icon--sm" aria-hidden="true" /> : <Copy className="ku-icon--sm" aria-hidden="true" />}
        {copied ? 'Tersalin' : 'Salin'}
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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const vid = Number(id);
    if (!vid) {
      setError('Tagihan tidak ditemukan.');
      setLoading(false);
      return;
    }
    Promise.all([fetchPaymentVerificationDetail(vid), fetchPlatformSettings()])
      .then(([p, s]) => {
        setPv(p);
        setPlatform(s);
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
    if (file.size > MAX_PROOF_BYTES) {
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
  const canUpload = pv.status === 'pending' || pv.status === 'rejected';
  const needsTransfer = canUpload && pv.final_amount > 0;
  const bank = platform && hasPlatformBankDetails(platform) ? platform : null;
  const planText = planTitle(pv.plan_name, pv.plan_period_months);
  const amountText = Math.round(pv.final_amount).toString();

  return (
    <div className="st-stack st-invoice">
      <div>
        <Button variant="ghost" size="sm" to="/settings/subscription" icon={<ArrowLeft className="ku-icon--sm" />}>
          Langganan
        </Button>
      </div>

      <header className="st-invoice__head">
        <div>
          <h2 className="st-invoice__title">Tagihan #{pv.id}</h2>
          <div className="st-muted">
            {planText} · dibuat {fmtDate(pv.created_at)}
          </div>
        </div>
        <Pill tone={status.tone}>{status.label}</Pill>
      </header>

      {pv.status === 'rejected' && (
        <Banner tone="danger">
          <b>Bukti transfer ditolak.</b> {pv.rejection_reason || 'Bukti belum sesuai dengan tagihan.'} Unggah bukti yang benar di bawah.
        </Banner>
      )}
      {pv.status === 'pending' && pv.proof_url && (
        <Banner tone={justUploaded ? 'success' : 'info'}>
          <b>{justUploaded ? 'Bukti transfer terkirim.' : 'Bukti transfer sedang diverifikasi.'}</b> Tim KlikUmroh sedang memeriksa. Anda mendapat notifikasi saat selesai.
        </Banner>
      )}
      {pv.status === 'approved' && (
        <Banner tone="success">
          <b>Pembayaran diterima</b>
          {pv.reviewed_at ? ` pada ${fmtDate(pv.reviewed_at)}` : ''}. Langganan Anda sudah diperbarui.
        </Banner>
      )}

      <div className="st-invoice__grid">
        <section className="st-pay">
          <div className="st-pay__label">{needsTransfer ? 'Jumlah yang harus ditransfer' : 'Total tagihan'}</div>
          <div className="st-pay__amount">
            {needsTransfer ? <CopyValue value={amountText} label="jumlah transfer">{fmtRupiah(pv.final_amount)}</CopyValue> : fmtRupiah(pv.final_amount)}
          </div>
          {needsTransfer && (pv.unique_code ?? 0) > 0 && (
            <p className="st-pay__note">
              Transfer tepat sampai 3 digit terakhir. Kode unik <b>{pv.unique_code}</b> membantu kami mencocokkan pembayaran Anda.
            </p>
          )}

          <dl className="st-pay__lines">
            <div>
              <dt>{planText || 'Paket langganan'}</dt>
              <dd>{fmtRupiah(pv.amount)}</dd>
            </div>
            {pv.coupon_code && (
              <div>
                <dt>Kupon {pv.coupon_code}</dt>
                <dd>−{fmtRupiah(Math.max(0, pv.amount - (pv.final_amount - (pv.unique_code ?? 0))))}</dd>
              </div>
            )}
            {(pv.unique_code ?? 0) > 0 && (
              <div>
                <dt>Kode unik</dt>
                <dd>{fmtRupiah(pv.unique_code ?? 0)}</dd>
              </div>
            )}
          </dl>

          {needsTransfer && (
            <div className="st-bank">
              <div className="st-pay__label">Transfer ke</div>
              {bank ? (
                <dl className="st-bank__list">
                  <div>
                    <dt>Bank</dt>
                    <dd>{bank.bank_name}</dd>
                  </div>
                  <div>
                    <dt>Nomor rekening</dt>
                    <dd>
                      <CopyValue value={bank.bank_account_number.replace(/\s/g, '')} label="nomor rekening">
                        {bank.bank_account_number}
                      </CopyValue>
                    </dd>
                  </div>
                  <div>
                    <dt>Atas nama</dt>
                    <dd>{bank.bank_account_holder}</dd>
                  </div>
                </dl>
              ) : (
                <p className="st-muted">Rekening tujuan belum tersedia. Hubungi tim KlikUmroh sebelum transfer.</p>
              )}
            </div>
          )}
        </section>

        <section className="st-proof" aria-labelledby="st-proof-title">
          <h3 id="st-proof-title" className="st-section__title">Bukti transfer</h3>
          {pv.proof_url ? (
            <div className="ws-slot ws-slot--proof">
              {proofUrl && <img src={proofUrl} alt="Bukti transfer yang diunggah" />}
              <div className="ws-slot__actions">
                {proofUrl && (
                  <a href={proofUrl} target="_blank" rel="noopener noreferrer" aria-label="Buka bukti transfer" title="Buka ukuran penuh">
                    <ExternalLink className="ku-icon--sm" aria-hidden="true" />
                  </a>
                )}
                {canUpload && (
                  <button type="button" aria-label="Ganti bukti transfer" title="Ganti" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <RefreshCw className="ku-icon--sm" aria-hidden="true" />
                  </button>
                )}
              </div>
              {uploading && <span className="ws-slot__busy">Mengunggah...</span>}
            </div>
          ) : canUpload && pv.final_amount > 0 ? (
            <button type="button" className="ws-slot ws-slot--proof ws-slot--empty" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <ImagePlus className="ku-icon" aria-hidden="true" />
              <span>{uploading ? 'Mengunggah...' : 'Unggah bukti transfer'}</span>
            </button>
          ) : (
            <p className="st-muted">Tidak ada bukti transfer.</p>
          )}
          {canUpload && pv.final_amount > 0 && (
            <>
              <div className="ku-field__hint">Foto atau tangkapan layar bukti transfer. JPG, PNG, atau WebP, maks. 10 MB.</div>
              {uploadError && <div className="ku-field__error" role="alert">{uploadError}</div>}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="st-hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </>
          )}
          {platform?.whatsapp_number && (
            <a className="st-help" href={waLink(platform.whatsapp_number, `Halo KlikUmroh, saya ingin bertanya tentang tagihan #${pv.id}.`)} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="ku-icon--sm" aria-hidden="true" /> Tanya tim KlikUmroh lewat WhatsApp
            </a>
          )}
        </section>
      </div>
    </div>
  );
};
