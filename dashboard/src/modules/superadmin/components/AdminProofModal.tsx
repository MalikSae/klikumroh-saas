import React, { useState, useEffect } from 'react';
import {
  X, Check, AlertTriangle, ExternalLink, Phone, Mail,
  SlidersHorizontal, Tag, XCircle, ChevronRight,
} from 'lucide-react';
import {
  type PaymentVerificationItem,
  type PricingPlan,
  fetchPricingPlans,
  updatePaymentVerificationPlan,
  updatePaymentVerificationCoupon,
} from '../../../services/staffApi';

const cleanWhatsApp = (num?: string | null) => {
  if (!num) return null;
  let clean = num.replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (!clean.startsWith('62')) {
    clean = '62' + clean;
  }
  return clean;
};

const formatIDR = (val: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

export interface AdminProofModalProps {
  item: PaymentVerificationItem | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (id: number) => Promise<void>;
  onReject: (id: number, reason: string) => Promise<void>;
  onPlanUpdated?: (updatedItem: PaymentVerificationItem) => void;
}

export const AdminProofModal: React.FC<AdminProofModalProps> = ({
  item,
  isOpen,
  onClose,
  onApprove,
  onReject,
  onPlanUpdated,
}) => {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upsell Plan State
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [showUpsellForm, setShowUpsellForm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number>(0);
  const [updatingPlan, setUpdatingPlan] = useState(false);

  // Coupon State
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [updatingCoupon, setUpdatingCoupon] = useState(false);

  // Combined success message
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [currentItem, setCurrentItem] = useState<PaymentVerificationItem | null>(item);

  useEffect(() => {
    if (item) {
      setCurrentItem(item);
      setSelectedPlanId(item.plan_id);
      setCouponInput(item.coupon_code || '');
    }
    setShowRejectForm(false);
    setShowUpsellForm(false);
    setShowCouponForm(false);
    setError(null);
    setSuccessMsg(null);
  }, [item, isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchPricingPlans().then(setPlans).catch(() => []);
    }
  }, [isOpen]);

  if (!isOpen || !currentItem) return null;

  const isPending = currentItem.status === 'pending';
  const hasCoupon = !!(currentItem.coupon_code && currentItem.coupon_code.trim() !== '');
  const discountAmount = hasCoupon ? Math.max(0, currentItem.amount - (currentItem.final_amount - (currentItem.unique_code || 0))) : 0;

  const handleApprove = async () => {
    try {
      setProcessing(true);
      setError(null);
      await onApprove(currentItem.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal menyetujui verifikasi');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError('Alasan penolakan wajib diisi');
      return;
    }
    try {
      setProcessing(true);
      setError(null);
      await onReject(currentItem.id, rejectReason.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal menolak verifikasi');
    } finally {
      setProcessing(false);
    }
  };

  const handleSavePlan = async () => {
    if (selectedPlanId === currentItem.plan_id) {
      setShowUpsellForm(false);
      return;
    }
    try {
      setUpdatingPlan(true);
      setError(null);
      setSuccessMsg(null);
      const updated = await updatePaymentVerificationPlan(currentItem.id, selectedPlanId);
      setCurrentItem(updated);
      setCouponInput(updated.coupon_code || '');
      setSuccessMsg(`Paket diubah ke ${updated.plan_name || '-'}. Total tagihan: ${formatIDR(updated.final_amount || updated.amount)}.`);
      setShowUpsellForm(false);
      onPlanUpdated?.(updated);
    } catch (err: any) {
      setError(err.message || 'Gagal mengubah paket');
    } finally {
      setUpdatingPlan(false);
    }
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setError('Kode kupon tidak boleh kosong');
      return;
    }
    try {
      setUpdatingCoupon(true);
      setError(null);
      setSuccessMsg(null);
      const updated = await updatePaymentVerificationCoupon(currentItem.id, code);
      setCurrentItem(updated);
      setSuccessMsg(`Kupon "${code}" berhasil diterapkan. Total tagihan: ${formatIDR(updated.final_amount || updated.amount)}.`);
      setShowCouponForm(false);
      onPlanUpdated?.(updated);
    } catch (err: any) {
      setError(err.message || 'Kupon tidak valid');
    } finally {
      setUpdatingCoupon(false);
    }
  };

  const handleRemoveCoupon = async () => {
    try {
      setUpdatingCoupon(true);
      setError(null);
      setSuccessMsg(null);
      const updated = await updatePaymentVerificationCoupon(currentItem.id, null);
      setCurrentItem(updated);
      setCouponInput('');
      setSuccessMsg(`Kupon dihapus. Total tagihan kembali ke ${formatIDR(updated.final_amount || updated.amount)}.`);
      setShowCouponForm(false);
      onPlanUpdated?.(updated);
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus kupon');
    } finally {
      setUpdatingCoupon(false);
    }
  };

  const waClean = cleanWhatsApp(currentItem.tenant_whatsapp);
  const waMessage = encodeURIComponent(
    `Halo Admin ${currentItem.tenant_name || ''}, kami dari tim verifikasi KlikUmroh.id.\n\n` +
    `Terkait konfirmasi pembayaran paket ${currentItem.plan_name || ''} sebesar ${formatIDR(currentItem.final_amount || currentItem.amount)}, ` +
    `mohon kirimkan foto bukti transfer Anda untuk proses aktivasi. Terima kasih.`
  );

  const targetPlan = plans.find((p) => p.id === selectedPlanId);
  const previewTotal = targetPlan ? targetPlan.price + (currentItem.unique_code || 0) : 0;

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--sa-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
    display: 'block',
  };

  const sectionStyle: React.CSSProperties = {
    padding: '14px 16px',
    borderRadius: 'var(--sa-radius-sm)',
    marginBottom: '12px',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(3px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 'var(--sa-radius-md)',
          maxWidth: '580px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 48px -8px rgba(0, 0, 0, 0.18)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--sa-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, fontFamily: 'var(--sa-font-heading)', color: 'var(--sa-text-primary)' }}>
              Verifikasi Pembayaran #{currentItem.id}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--sa-text-muted)' }}>
              {currentItem.tenant_name}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className={`sa-badge ${
                currentItem.status === 'approved'
                  ? 'sa-badge--active'
                  : currentItem.status === 'rejected'
                  ? 'sa-badge--expired'
                  : 'sa-badge--pending'
              }`}
            >
              {currentItem.status === 'approved' ? 'Disetujui' : currentItem.status === 'rejected' ? 'Ditolak' : 'Menunggu Review'}
            </span>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--sa-text-muted)', borderRadius: 'var(--sa-radius-sm)', display: 'flex' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>

          {/* Global Alert Messages */}
          {error && (
            <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 14px', borderRadius: 'var(--sa-radius-sm)', fontSize: '13px', marginBottom: '14px' }}>
              {error}
            </div>
          )}
          {successMsg && (
            <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D', padding: '10px 14px', borderRadius: 'var(--sa-radius-sm)', fontSize: '13px', marginBottom: '14px' }}>
              {successMsg}
            </div>
          )}

          {/* ── Section 1: Tagihan ── */}
          <div style={{ ...sectionStyle, backgroundColor: 'var(--sa-canvas)', border: '1px solid var(--sa-border)' }}>
            <span style={labelStyle}>Rincian Tagihan</span>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              {/* Left: breakdown */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--sa-text-secondary)', marginBottom: '4px' }}>
                  <span>Paket</span>
                  <span style={{ fontWeight: 500 }}>{currentItem.plan_name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--sa-text-secondary)', marginBottom: '4px' }}>
                  <span>Harga Paket</span>
                  <span>{formatIDR(currentItem.amount)}</span>
                </div>
                {hasCoupon && discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#15803D', marginBottom: '4px' }}>
                    <span>Diskon Kupon ({currentItem.coupon_code})</span>
                    <span>-{formatIDR(discountAmount)}</span>
                  </div>
                )}
                {(currentItem.unique_code || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--sa-text-secondary)', marginBottom: '4px' }}>
                    <span>Kode Unik</span>
                    <span>+Rp {currentItem.unique_code}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, borderTop: '1px solid var(--sa-border)', paddingTop: '8px', marginTop: '4px', color: 'var(--sa-text-primary)' }}>
                  <span>Total Transfer</span>
                  <span style={{ color: 'var(--sa-primary)' }}>{formatIDR(currentItem.final_amount || currentItem.amount)}</span>
                </div>
              </div>
            </div>

            {/* Inline edit actions (only for pending) */}
            {isPending && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--sa-border)', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => { setShowUpsellForm(!showUpsellForm); setShowCouponForm(false); setError(null); }}
                  style={{
                    background: 'none', border: '1px solid var(--sa-border)', padding: '5px 10px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: 600, color: 'var(--sa-text-secondary)', display: 'inline-flex',
                    alignItems: 'center', gap: '4px', borderRadius: 'var(--sa-radius-sm)',
                  }}
                >
                  <SlidersHorizontal size={12} />
                  {showUpsellForm ? 'Batalkan Ubah Paket' : 'Ubah Paket'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCouponForm(!showCouponForm); setShowUpsellForm(false); setError(null); }}
                  style={{
                    background: 'none', border: '1px solid var(--sa-border)', padding: '5px 10px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: 600, color: 'var(--sa-text-secondary)', display: 'inline-flex',
                    alignItems: 'center', gap: '4px', borderRadius: 'var(--sa-radius-sm)',
                  }}
                >
                  <Tag size={12} />
                  {hasCoupon ? 'Kelola Kupon' : 'Tambah Kupon'}
                </button>
              </div>
            )}
          </div>

          {/* ── Expandable: Ubah Paket ── */}
          {showUpsellForm && isPending && (
            <div style={{ border: '1px solid var(--sa-border)', borderRadius: 'var(--sa-radius-sm)', padding: '14px', marginBottom: '12px' }}>
              <span style={labelStyle}>Ubah Paket Langganan</span>
              {plans.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--sa-text-muted)', marginBottom: '10px' }}>
                  Memuat daftar paket...
                </div>
              ) : (
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(Number(e.target.value))}
                  disabled={updatingPlan}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: 'var(--sa-radius-sm)',
                    border: '1px solid var(--sa-border)', backgroundColor: '#FFF', marginBottom: '10px', boxSizing: 'border-box',
                  }}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatIDR(p.price)}
                    </option>
                  ))}
                </select>
              )}

              {targetPlan && selectedPlanId !== currentItem.plan_id && (
                <div style={{ backgroundColor: 'var(--sa-canvas)', padding: '10px 12px', borderRadius: 'var(--sa-radius-sm)', marginBottom: '10px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--sa-text-secondary)' }}>
                    <span>Harga Paket Baru</span><span>{formatIDR(targetPlan.price)}</span>
                  </div>
                  {(currentItem.unique_code || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--sa-text-secondary)' }}>
                      <span>Kode Unik (tetap)</span><span>+Rp {currentItem.unique_code}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--sa-border)', paddingTop: '6px' }}>
                    <span>Total Baru</span>
                    <span style={{ color: 'var(--sa-primary)' }}>{formatIDR(previewTotal)}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="sa-btn sa-btn--secondary" onClick={() => setShowUpsellForm(false)} disabled={updatingPlan} style={{ padding: '6px 12px', fontSize: '12px' }}>Batal</button>
                <button
                  type="button" className="sa-btn sa-btn--primary" onClick={handleSavePlan}
                  disabled={updatingPlan || selectedPlanId === currentItem.plan_id}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  {updatingPlan ? 'Menyimpan...' : 'Simpan Paket'}
                </button>
              </div>
            </div>
          )}

          {/* ── Expandable: Kupon ── */}
          {showCouponForm && isPending && (
            <div style={{ border: '1px solid var(--sa-border)', borderRadius: 'var(--sa-radius-sm)', padding: '14px', marginBottom: '12px' }}>
              <span style={labelStyle}>Kode Kupon Diskon</span>
              {hasCoupon && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--sa-radius-sm)', padding: '8px 12px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#15803D', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Tag size={13} />
                    Kupon aktif: <strong>{currentItem.coupon_code}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    disabled={updatingCoupon}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}
                  >
                    <XCircle size={14} />
                    Hapus
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Masukkan kode kupon..."
                  style={{
                    flex: 1, padding: '8px 12px', fontSize: '13px', border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)', textTransform: 'uppercase', letterSpacing: '0.04em',
                    boxSizing: 'border-box',
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleApplyCoupon(); }}
                />
                <button
                  type="button" className="sa-btn sa-btn--primary" onClick={handleApplyCoupon}
                  disabled={updatingCoupon || !couponInput.trim()}
                  style={{ padding: '8px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                >
                  <ChevronRight size={13} />
                  {updatingCoupon ? 'Memproses...' : (hasCoupon ? 'Ganti Kupon' : 'Terapkan')}
                </button>
              </div>
            </div>
          )}

          {/* ── Section 2: Kontak Mitra ── */}
          <div style={{ ...sectionStyle, backgroundColor: 'var(--sa-surface)', border: '1px solid var(--sa-border)' }}>
            <span style={labelStyle}>Kontak Mitra</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', fontSize: '13px', gap: '4px' }}>
                <span style={{ color: 'var(--sa-text-muted)', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                  <Phone size={11} /> WhatsApp
                </span>
                {currentItem.tenant_whatsapp ? (
                  <a
                    href={`https://wa.me/${waClean}?text=${waMessage}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--sa-green-text)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    {currentItem.tenant_whatsapp}
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  <span style={{ color: 'var(--sa-text-subtle)', fontStyle: 'italic', fontSize: '12px' }}>Belum dicantumkan</span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', fontSize: '13px', gap: '4px' }}>
                <span style={{ color: 'var(--sa-text-muted)', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                  <Mail size={11} /> Email
                </span>
                {currentItem.tenant_email ? (
                  <a href={`mailto:${currentItem.tenant_email}`} style={{ color: 'var(--sa-text)', textDecoration: 'none', fontWeight: 500 }}>
                    {currentItem.tenant_email}
                  </a>
                ) : (
                  <span style={{ color: 'var(--sa-text-subtle)', fontStyle: 'italic', fontSize: '12px' }}>-</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Section 3: Bukti Transfer ── */}
          <div>
            <span style={{ ...labelStyle, marginBottom: '8px' }}>Dokumen Bukti Transfer</span>
            {currentItem.proof_url ? (
              <div>
                <div style={{ textAlign: 'center', borderRadius: 'var(--sa-radius-sm)', overflow: 'hidden', border: '1px solid var(--sa-border)' }}>
                  <img
                    src={currentItem.proof_url}
                    alt="Bukti Transfer"
                    style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                  />
                </div>
                <div style={{ marginTop: '8px', textAlign: 'center' }}>
                  <a
                    href={currentItem.proof_url}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '12px', color: 'var(--sa-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                  >
                    Buka di tab baru
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ padding: '32px 0', textAlign: 'center', backgroundColor: 'var(--sa-canvas)', borderRadius: 'var(--sa-radius-sm)', color: 'var(--sa-text-muted)', fontSize: '13px', border: '1px dashed var(--sa-border)' }}>
                Belum ada file bukti transfer
              </div>
            )}
          </div>

          {/* Reject reason form (inline, above footer) */}
          {showRejectForm && (
            <div style={{ marginTop: '14px' }}>
              <label style={{ ...labelStyle }}>Alasan Penolakan</label>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Contoh: Nominal tidak sesuai, struk tidak terbaca..."
                style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid var(--sa-border)', borderRadius: 'var(--sa-radius-sm)', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
          )}
        </div>

        {/* ── Footer Actions ── */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--sa-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            backgroundColor: 'var(--sa-canvas)',
            flexShrink: 0,
          }}
        >
          <button type="button" className="sa-btn sa-btn--secondary" onClick={onClose} disabled={processing || updatingPlan || updatingCoupon}>
            Tutup
          </button>

          {isPending && (
            <>
              {!showRejectForm ? (
                <button
                  type="button" className="sa-btn sa-btn--danger"
                  onClick={() => { setShowRejectForm(true); setError(null); }}
                  disabled={processing || updatingPlan || updatingCoupon}
                >
                  <AlertTriangle size={14} />
                  <span>Tolak</span>
                </button>
              ) : (
                <button
                  type="button" className="sa-btn sa-btn--danger"
                  onClick={handleReject}
                  disabled={processing || updatingPlan || updatingCoupon || !rejectReason.trim()}
                >
                  <span>Kirim Penolakan</span>
                </button>
              )}

              <button
                type="button" className="sa-btn sa-btn--primary"
                onClick={handleApprove}
                disabled={processing || updatingPlan || updatingCoupon}
              >
                <Check size={14} />
                <span>{processing ? 'Memproses...' : 'Setujui Pembayaran'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
