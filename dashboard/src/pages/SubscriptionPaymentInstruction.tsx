import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Check,
  Upload,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  FileText,
  RefreshCw,
  Clock,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Card,
  Button,
  Badge,
  Modal,
  getStandardMenuItems,
} from '../components';
import {
  fetchPaymentVerificationDetail,
  uploadRenewalProof,
  fetchPlatformSettings,
  getStoredUser,
  getStoredTravelName,
  type PaymentVerification,
  type PlatformSettings,
  API_BASE,
} from '../services/api';

export const SubscriptionPaymentInstructionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<PaymentVerification | null>(null);
  const [platformBankInfo, setPlatformBankInfo] = useState<PlatformSettings>({
    whatsapp_number: '6281234567890',
    bank_name: 'Bank Syariah Indonesia (BSI)',
    bank_account_number: '7123456789',
    bank_account_holder: 'PT Klik Umroh Digital',
  });

  const [copiedAccount, setCopiedAccount] = useState<boolean>(false);
  const [copiedAmount, setCopiedAmount] = useState<boolean>(false);

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewProofURL, setPreviewProofURL] = useState<string | null>(null);

  const currentUser = getStoredUser();

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [pv, settings] = await Promise.all([
        fetchPaymentVerificationDetail(Number(id)),
        fetchPlatformSettings().catch(() => null),
      ]);
      setVerification(pv);
      if (settings) {
        setPlatformBankInfo(settings);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat rincian tagihan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleCopyAccount = () => {
    const rawAcc = platformBankInfo.bank_account_number.replace(/\s+/g, '');
    navigator.clipboard.writeText(rawAcc);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const handleCopyAmount = () => {
    if (!verification) return;
    navigator.clipboard.writeText(verification.final_amount.toString());
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const handleUploadProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verification || !proofFile) return;

    try {
      setUploading(true);
      setUploadError(null);
      setUploadSuccess(null);

      const res = await uploadRenewalProof(verification.id, proofFile);
      setVerification((prev) => (prev ? { ...prev, proof_url: res.proof_url, status: 'pending', rejection_reason: null } : null));
      setUploadSuccess('Bukti transfer berhasil diunggah. Tim KlikUmroh akan segera memverifikasi pembayaran Anda.');
      setProofFile(null);
      loadData();
    } catch (err: any) {
      setUploadError(err.message || 'Gagal mengunggah bukti transfer');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="db-main-layout">
        <Sidebar
          brandName="KlikUmroh.id"
          menuItems={getStandardMenuItems('settings-subscription')}
          footerContent="KlikUmroh.id 1.0"
        />
        <div className="db-content-area">
          <Topbar
            travelName={getStoredTravelName()}
            userName={currentUser?.name || 'Administrator'}
            userRole="Administrator"
            userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
          />
          <main className="db-page-container" style={{ maxWidth: '860px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '40px 0', color: 'var(--db-text-muted)' }}>
              <RefreshCw size={20} className="db-spin" />
              <span>Memuat instruksi pembayaran tagihan...</span>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error || !verification) {
    return (
      <div className="db-main-layout">
        <Sidebar
          brandName="KlikUmroh.id"
          menuItems={getStandardMenuItems('settings-subscription')}
          footerContent="KlikUmroh.id 1.0"
        />
        <div className="db-content-area">
          <Topbar
            travelName={getStoredTravelName()}
            userName={currentUser?.name || 'Administrator'}
            userRole="Administrator"
            userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
          />
          <main className="db-page-container" style={{ maxWidth: '860px' }}>
            <div className="db-alert db-alert--error">
              <AlertCircle size={18} />
              <span>{error || 'Data tagihan tidak ditemukan'}</span>
            </div>
            <div style={{ marginTop: '16px' }}>
              <Link to="/settings/subscription" style={{ color: 'var(--db-sidebar-active-highlight)', textDecoration: 'none', fontSize: '13px' }}>
                &larr; Kembali ke Pengaturan Langganan
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="db-main-layout">
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={getStandardMenuItems('settings-subscription')}
        footerContent="KlikUmroh.id 1.0"
      />

      <div className="db-content-area">
        <Topbar
          travelName={verification.tenant_name || getStoredTravelName()}
          userName={currentUser?.name || 'Administrator'}
          userRole="Administrator"
          userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
        />

        <main className="db-page-container" style={{ maxWidth: '860px' }}>
          <div style={{ marginBottom: '16px' }}>
            <Link
              to="/settings/subscription"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                color: 'var(--db-text-muted)',
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={15} />
              <span>Kembali ke Pengaturan Langganan</span>
            </Link>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
            <PageHeader
              title={`Instruksi Pembayaran #INV-${verification.id}`}
              subtitle="Selesaikan transfer ke rekening resmi KlikUmroh dan lampirkan bukti pembayaran untuk aktivasi."
            />
            <div style={{ marginBottom: '16px' }}>
              <Badge
                variant={
                  verification.status === 'approved'
                    ? 'positive'
                    : verification.status === 'rejected'
                    ? 'negative'
                    : 'neutral'
                }
              >
                {verification.status === 'approved'
                  ? 'Lunas'
                  : verification.status === 'rejected'
                  ? 'Perlu Perbaikan'
                  : verification.proof_url
                  ? 'Sedang Diverifikasi'
                  : 'Menunggu Pembayaran'}
              </Badge>
            </div>
          </div>

          {uploadSuccess && (
            <div className="db-alert db-alert--success" style={{ marginBottom: '20px' }}>
              <CheckCircle2 size={18} />
              <span>{uploadSuccess}</span>
            </div>
          )}

          {uploadError && (
            <div className="db-alert db-alert--error" style={{ marginBottom: '20px' }}>
              <AlertCircle size={18} />
              <span>{uploadError}</span>
            </div>
          )}

          {verification.status === 'rejected' && (
            <div className="db-alert db-alert--error" style={{ marginBottom: '20px' }}>
              <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>
                  Verifikasi Pembayaran Perlu Perbaikan
                </strong>
                <p style={{ margin: '0 0 10px 0', fontSize: '13px' }}>
                  <strong>Catatan Tim Verifikasi:</strong> {verification.rejection_reason || 'Bukti transfer tidak valid atau nominal transfer tidak sesuai.'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate('/settings/subscription/checkout')}
                    style={{ fontSize: '12px', padding: '6px 14px' }}
                  >
                    Ganti Paket / Buat Tagihan Baru
                  </Button>
                  <span style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>
                    atau unggah ulang bukti transfer yang benar pada formulir di bawah.
                  </span>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 1. Rincian Tagihan */}
            <Card title="Rincian Tagihan Perpanjangan">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '16px',
                  padding: '16px',
                  backgroundColor: 'var(--db-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--db-border)',
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginBottom: '4px' }}>
                    Paket Langganan
                  </div>
                  <strong style={{ fontSize: '15px', color: 'var(--db-text-primary)', display: 'block' }}>
                    {verification.plan_name || `Paket #${verification.plan_id}`}
                  </strong>
                </div>

                <div>
                  <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginBottom: '4px' }}>
                    Harga Paket
                  </div>
                  <span style={{ fontSize: '14px', color: 'var(--db-text-primary)', display: 'block' }}>
                    Rp {Math.round(verification.amount).toLocaleString('id-ID')}
                  </span>
                </div>

                {verification.coupon_code && (
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginBottom: '4px' }}>
                      Kupon Promo
                    </div>
                    <strong style={{ fontSize: '14px', color: 'var(--db-sidebar-active-highlight)', display: 'block' }}>
                      {verification.coupon_code}
                    </strong>
                  </div>
                )}

                {Boolean(verification.unique_code && verification.unique_code > 0) && (
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginBottom: '4px' }}>
                      Kode Unik Transfer
                    </div>
                    <strong style={{ fontSize: '14px', color: 'var(--db-rating-star)', display: 'block' }}>
                      +Rp {verification.unique_code}
                    </strong>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginBottom: '4px' }}>
                    Tanggal Dibuat
                  </div>
                  <span style={{ fontSize: '14px', color: 'var(--db-text-primary)', display: 'block' }}>
                    {new Date(verification.created_at).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginBottom: '4px' }}>
                    Total Ditransfer
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--db-font-heading)',
                        fontSize: '18px',
                        fontWeight: 800,
                        color: 'var(--db-sidebar-active-highlight)',
                      }}
                    >
                      {new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0,
                      }).format(verification.final_amount)}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAmount}
                      style={{
                        background: 'none',
                        border: '1px solid var(--db-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '2px 8px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: 'var(--db-text-primary)',
                      }}
                    >
                      {copiedAmount ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedAmount ? 'Tersalin' : 'Salin'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </Card>

            {/* 2. Petunjuk Transfer Bank */}
            <Card title="Petunjuk Transfer Bank Resmi">
              <div
                style={{
                  padding: '20px',
                  backgroundColor: 'var(--db-card-bg)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--db-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>Bank Tujuan:</span>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--db-text-primary)', marginTop: '2px' }}>
                    {platformBankInfo.bank_name}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>Nomor Rekening Tujuan:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--db-font-heading)',
                        fontSize: '20px',
                        fontWeight: 700,
                        letterSpacing: '1px',
                        color: 'var(--db-text-primary)',
                      }}
                    >
                      {platformBankInfo.bank_account_number}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAccount}
                      style={{
                        background: 'none',
                        border: '1px solid var(--db-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 10px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--db-text-primary)',
                      }}
                    >
                      {copiedAccount ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedAccount ? 'Tersalin!' : 'Salin Rekening'}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>Atas Nama Pemilik Rekening:</span>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--db-text-primary)', marginTop: '2px' }}>
                    {platformBankInfo.bank_account_holder}
                  </div>
                </div>

                <div
                  style={{
                    borderTop: '1px solid var(--db-border)',
                    paddingTop: '12px',
                    fontSize: '12px',
                    color: 'var(--db-text-muted)',
                    lineHeight: 1.6,
                  }}
                >
                  {Boolean(verification.unique_code && verification.unique_code > 0) ? (
                    <span>
                      PENTING: Mohon transfer tepat hingga 3 digit terakhir (termasuk kode unik{' '}
                      <strong style={{ color: 'var(--db-text-primary)' }}>+{verification.unique_code}</strong>) agar verifikasi pembayaran dapat diproses otomatis/lebih cepat. Setelah transfer berhasil, unggah berkas bukti pembayaran di bawah ini.
                    </span>
                  ) : (
                    <span>
                      Pastikan nominal transfer sesuai dengan total tagihan hingga digit terakhir. Setelah transfer berhasil, unggah berkas bukti pembayaran di bawah ini.
                    </span>
                  )}
                </div>
              </div>
            </Card>

            {/* 3. Berkas Bukti Transfer */}
            <Card title="Unggah Bukti Transfer">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: 'var(--db-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--db-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {verification.status === 'rejected' ? (
                      <AlertCircle size={20} style={{ color: 'var(--db-negative)' }} />
                    ) : verification.proof_url ? (
                      <CheckCircle2 size={20} style={{ color: 'var(--db-sidebar-active-highlight)' }} />
                    ) : (
                      <Clock size={20} style={{ color: 'var(--db-rating-star)' }} />
                    )}
                    <div>
                      <strong style={{ fontSize: '14px', color: 'var(--db-text-primary)', display: 'block' }}>
                        {verification.status === 'rejected'
                          ? 'Bukti transfer perlu perbaikan'
                          : verification.proof_url
                          ? 'Bukti transfer telah diterima'
                          : 'Bukti transfer belum diunggah'}
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>
                        {verification.status === 'rejected'
                          ? 'Silakan unggah berkas bukti pembayaran baru yang valid pada formulir di bawah.'
                          : verification.proof_url
                          ? 'Berkas Anda sedang dalam antrean verifikasi tim KlikUmroh (estimasi 15–60 menit).'
                          : 'Silakan transfer tepat hingga 3 digit terakhir lalu lampirkan tangkapan layar / resi di bawah.'}
                      </span>
                    </div>
                  </div>

                  {verification.proof_url && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setPreviewProofURL(`${API_BASE}${verification.proof_url}`)}
                      style={{ fontSize: '12px', padding: '6px 14px' }}
                    >
                      Lihat Bukti Terlampir
                    </Button>
                  )}
                </div>

                {/* Form Upload Bukti */}
                {(verification.status === 'pending' || verification.status === 'rejected') && (
                  <form onSubmit={handleUploadProof} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                      {verification.status === 'rejected'
                        ? 'Unggah Ulang Bukti Pembayaran (Revisi):'
                        : verification.proof_url
                        ? 'Perbarui Berkas Bukti Transfer:'
                        : 'Unggah Berkas Bukti Transfer:'}
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 16px',
                          backgroundColor: 'var(--db-surface)',
                          border: '1px solid var(--db-border)',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 500,
                          color: 'var(--db-text-primary)',
                        }}
                      >
                        <Upload size={16} />
                        <span>Pilih Berkas (JPG, PNG, WebP)</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setProofFile(e.target.files[0]);
                            }
                          }}
                          style={{ display: 'none' }}
                        />
                      </label>

                      {proofFile && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--db-sidebar-active-highlight)' }}>
                          <FileText size={16} />
                          <span>
                            {proofFile.name} ({(proofFile.size / 1024).toFixed(0)} KB)
                          </span>
                        </div>
                      )}

                      {proofFile && (
                        <Button
                          type="submit"
                          variant="primary"
                          disabled={uploading}
                          style={{ fontSize: '13px', padding: '8px 18px' }}
                        >
                          {uploading ? 'Mengunggah...' : 'Simpan Bukti Pembayaran'}
                        </Button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            </Card>

            {/* 4. Konfirmasi Cepat WhatsApp & Bantuan */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                padding: '20px',
                backgroundColor: 'var(--db-card-bg)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--db-border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div>
                <strong style={{ fontSize: '14px', color: 'var(--db-text-primary)', display: 'block' }}>
                  Ingin Verifikasi Lebih Cepat?
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>
                  Hubungi tim customer service KlikUmroh via WhatsApp setelah melakukan transfer.
                </span>
              </div>

              <a
                href={`https://wa.me/${platformBankInfo.whatsapp_number.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  `Halo Tim KlikUmroh, saya ingin konfirmasi pembayaran tagihan perpanjangan software travel:\n\n- Travel: ${
                    verification.tenant_name
                  }\n- Invoice: #INV-${verification.id}\n- Paket: ${
                    verification.plan_name || 'Paket Langganan'
                  }\n- Total: Rp${verification.final_amount.toLocaleString(
                    'id-ID'
                  )}\n\nMohon dibantu verifikasi. Terima kasih.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'var(--db-primary-button)',
                  color: 'white',
                  padding: '10px 18px',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <MessageCircle size={16} />
                <span>Konfirmasi via WhatsApp CS KlikUmroh</span>
              </a>
            </div>
          </div>

          {/* Modal Preview Bukti */}
          <Modal
            isOpen={Boolean(previewProofURL)}
            onClose={() => setPreviewProofURL(null)}
            title="Bukti Transfer Terlampir"
          >
            <div style={{ textAlign: 'center' }}>
              {previewProofURL && (
                <img
                  src={previewProofURL}
                  alt="Bukti Transfer"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '65vh',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--db-border)',
                    objectFit: 'contain',
                  }}
                />
              )}
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setPreviewProofURL(null)}>
                  Tutup
                </Button>
              </div>
            </div>
          </Modal>
        </main>
      </div>
    </div>
  );
};

