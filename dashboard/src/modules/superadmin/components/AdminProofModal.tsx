import React, { useState, useEffect, useRef } from 'react';
import {
  X, Check, AlertTriangle, ExternalLink, Phone, Mail,
  SlidersHorizontal, Tag, XCircle, ChevronRight,
} from 'lucide-react';
import {
  type PaymentVerificationItem,
  type PricingPlan,
  type Coupon,
  fetchAffiliatorSettings,
  fetchPricingPlans,
  fetchStaffCoupons,
  updatePaymentVerificationPlan,
  updatePaymentVerificationCoupon,
  PaymentApproveError,
} from '../../../services/staffApi';
import { usePrivateFileURL } from '../../../hooks/usePrivateFile';
import { CustomDropdown } from '../shared/CustomDropdown';
import { discountedPrice, planChangeCouponPercentage, planChangeTotal, proofAmountMismatch } from '../../../utils/billingMath';
import { couponExhausted, couponState, paymentStatusView } from '../shared/statusLabels';
import { formatDateTimeWIB } from '../../../utils/datetime';

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
  // Receives the invoice as shown, so the plan and total the staff member checked go along with the approval.
  onApprove: (item: PaymentVerificationItem) => Promise<void>;
  onReject: (id: number, reason: string) => Promise<void>;
  onPlanUpdated?: (updatedItem: PaymentVerificationItem) => void;
  /** Reloads the invoice after a failed action (it may have been processed by someone else meanwhile). */
  onStale?: (id: number) => Promise<void>;
}

export const AdminProofModal: React.FC<AdminProofModalProps> = ({
  item,
  isOpen,
  onClose,
  onApprove,
  onReject,
  onPlanUpdated,
  onStale,
}) => {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  // Approval is irreversible (activates the travel and extends the subscription), so it needs a second click.
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
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
  // Guards Enter pressed again while a coupon request is in flight (state is not updated yet then).
  const couponBusy = useRef(false);
  const [confirmRemoveCoupon, setConfirmRemoveCoupon] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);
  // Current program discount of affiliator coupons (they are not in the staff coupon list).
  const [affiliatorCouponDiscount, setAffiliatorCouponDiscount] = useState<number | null>(null);

  // Combined success message
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [currentItem, setCurrentItem] = useState<PaymentVerificationItem | null>(item);
  // Transfer proofs are private files: downloaded with the staff token, not from /uploads.
  const proofFile = usePrivateFileURL(isOpen ? currentItem?.proof_url : null, 'staff');

  // The parent hands back a new item object after every plan/coupon change (onPlanUpdated). Only a different
  // invoice or reopening resets the forms and messages, so the "Paket diubah ..." confirmation stays visible
  // and a rejection reason typed for one payment never carries over to the next.
  const lastResetKey = useRef<string | null>(null);
  useEffect(() => {
    if (item) {
      setCurrentItem(item);
      setSelectedPlanId(item.plan_id);
      setCouponInput(item.coupon_code || '');
    }
    const key = isOpen && item ? String(item.id) : null;
    if (key === lastResetKey.current) return;
    lastResetKey.current = key;
    setRejectReason('');
    setShowRejectForm(false);
    setShowApproveConfirm(false);
    setShowUpsellForm(false);
    setShowCouponForm(false);
    setConfirmRemoveCoupon(false);
    setError(null);
    setSuccessMsg(null);
  }, [item, isOpen]);

  // Discount of a staff coupon on the invoice, so the "Ubah Paket" preview re-applies it like the backend.
  const [staffCoupons, setStaffCoupons] = useState<Coupon[]>([]);
  useEffect(() => {
    if (isOpen) {
      fetchStaffCoupons().then(setStaffCoupons).catch(() => setStaffCoupons([]));
    }
  }, [isOpen]);

  // State is only set when the request settles, so the effect below does not set state synchronously.
  const fetchPlans = () =>
    fetchPricingPlans()
      .then((p) => {
        setPlans(p);
        setPlansError(null);
      })
      .catch((err: unknown) => setPlansError(err instanceof Error && err.message ? err.message : 'Gagal memuat daftar paket'))
      .finally(() => setPlansLoading(false));

  const retryPlans = () => {
    setPlansLoading(true);
    setPlansError(null);
    void fetchPlans();
  };

  useEffect(() => {
    if (isOpen) {
      void fetchPlans();
      fetchAffiliatorSettings()
        .then((s) => setAffiliatorCouponDiscount(s.coupon_discount))
        .catch(() => setAffiliatorCouponDiscount(null));
    }
  }, [isOpen]);

  if (!isOpen || !currentItem) return null;

  const isPending = currentItem.status === 'pending';
  const payableAmount = currentItem.final_amount ?? currentItem.amount;
  const missingProof = !currentItem.proof_url && payableAmount > 0;
  // The proof was uploaded for another total (staff changed the plan or coupon afterwards). Approving stays
  // allowed: staff check the bank statement and decide (keputusan pendiri 6 Okt 2026).
  const proofMismatch = isPending && proofAmountMismatch(currentItem.proof_url, currentItem.proof_final_amount, currentItem.final_amount);
  const hasCoupon = !!(currentItem.coupon_code && currentItem.coupon_code.trim() !== '');
  const discountAmount = hasCoupon ? Math.max(0, currentItem.amount - (currentItem.final_amount - (currentItem.unique_code || 0))) : 0;

  // The invoice may have been processed by someone else: reload it so the modal shows the real status.
  const refreshAfterError = async () => {
    try {
      await onStale?.(currentItem.id);
    } catch {
      // the error from the action itself stays visible
    }
  };

  const handleApprove = async () => {
    try {
      setProcessing(true);
      setError(null);
      await onApprove(currentItem);
      onClose();
    } catch (err: any) {
      // A 409 means the invoice changed (the parent has already reloaded it): close the confirmation so
      // the staff member checks the fresh plan and total before approving again.
      if (err instanceof PaymentApproveError && err.status === 409) {
        setShowApproveConfirm(false);
      }
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
      await refreshAfterError();
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
      setSuccessMsg(`Paket diubah ke ${updated.plan_name || '-'}. Total tagihan: ${formatIDR(updated.final_amount ?? updated.amount)}.`);
      setShowUpsellForm(false);
      onPlanUpdated?.(updated);
    } catch (err: any) {
      setError(err.message || 'Gagal mengubah paket');
      await refreshAfterError();
    } finally {
      setUpdatingPlan(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (couponBusy.current) return;
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setError('Kode kupon tidak boleh kosong');
      return;
    }
    couponBusy.current = true;
    try {
      setUpdatingCoupon(true);
      setError(null);
      setSuccessMsg(null);
      const updated = await updatePaymentVerificationCoupon(currentItem.id, code);
      setCurrentItem(updated);
      setSuccessMsg(`Kupon "${code}" berhasil diterapkan. Total tagihan: ${formatIDR(updated.final_amount ?? updated.amount)}.`);
      setShowCouponForm(false);
      onPlanUpdated?.(updated);
    } catch (err: any) {
      setError(err.message || 'Kupon tidak valid');
      await refreshAfterError();
    } finally {
      couponBusy.current = false;
      setUpdatingCoupon(false);
    }
  };

  const handleRemoveCoupon = async () => {
    if (couponBusy.current) return;
    couponBusy.current = true;
    setConfirmRemoveCoupon(false);
    try {
      setUpdatingCoupon(true);
      setError(null);
      setSuccessMsg(null);
      const updated = await updatePaymentVerificationCoupon(currentItem.id, null);
      setCurrentItem(updated);
      setCouponInput('');
      setSuccessMsg(`Kupon dihapus. Total tagihan kembali ke ${formatIDR(updated.final_amount ?? updated.amount)}.`);
      setShowCouponForm(false);
      onPlanUpdated?.(updated);
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus kupon');
      await refreshAfterError();
    } finally {
      couponBusy.current = false;
      setUpdatingCoupon(false);
    }
  };

  const waClean = cleanWhatsApp(currentItem.tenant_whatsapp);
  const waMessage = encodeURIComponent(
    `Halo Admin ${currentItem.tenant_name || ''}, kami dari tim verifikasi KlikUmroh.id.\n\n` +
    `Terkait konfirmasi pembayaran paket ${currentItem.plan_name || ''} sebesar ${formatIDR(currentItem.final_amount ?? currentItem.amount)}, ` +
    `mohon kirimkan foto bukti transfer Anda untuk proses aktivasi. Terima kasih.`
  );

  const targetPlan = plans.find((p) => p.id === selectedPlanId);
  // The backend keeps the invoice's coupon on a plan change and re-applies it (UpdateVerificationPlan)
  // with the coupon's current percentage. Staff coupons give it exactly; an affiliator coupon is not in the
  // staff list, so the current program discount is used (staff may have changed it since the invoice).
  const invoiceCoupon = hasCoupon
    ? staffCoupons.find((c) => c.code.toUpperCase() === currentItem.coupon_code!.trim().toUpperCase())
    : undefined;
  const couponPreview = hasCoupon
    ? planChangeCouponPercentage(invoiceCoupon?.discount_percentage, affiliatorCouponDiscount, currentItem.amount, currentItem.final_amount, currentItem.unique_code)
    : null;
  const couponPercentage = couponPreview ? couponPreview.percentage : null;
  // Removing a coupon reprices the invoice at once; re-entering the same code is refused when the staff
  // coupon is no longer usable, or when it is an affiliator code (its affiliator may have replaced it).
  const couponNotReapplicable = hasCoupon && (!invoiceCoupon || couponState(invoiceCoupon.status, invoiceCoupon.expires_at) !== 'active' || couponExhausted(invoiceCoupon.used_count, invoiceCoupon.max_uses));
  const badge = paymentStatusView(currentItem.status, currentItem.proof_url, payableAmount);
  const couponPlanMismatch = !!(targetPlan && invoiceCoupon?.plan_id && invoiceCoupon.plan_id !== targetPlan.id);
  const previewTotal = targetPlan ? planChangeTotal(targetPlan.price, couponPercentage, currentItem.unique_code) : 0;

  const labelStyle: React.CSSProperties = {
    fontSize: '13px',
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
        backgroundColor: 'var(--sa-overlay-modal)',
        backdropFilter: 'blur(3px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={() => {
        // Never close mid-request: a late 409 would otherwise reopen the modal by itself.
        if (!(processing || updatingPlan || updatingCoupon)) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--sa-card)',
          borderRadius: 'var(--sa-radius-md)',
          maxWidth: '580px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--sa-shadow-modal-lg)',
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
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, fontFamily: 'var(--sa-font-display)', color: 'var(--sa-text)' }}>
              Verifikasi Pembayaran #{currentItem.id}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--sa-text-muted)' }}>
              {currentItem.tenant_name}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Same label as the Payments list (Perlu Verifikasi / Menunggu Transfer). */}
            <span className={`sa-badge ${badge.cls}`}>{badge.label}</span>
            <button
              type="button"
              onClick={onClose}
              disabled={processing || updatingPlan || updatingCoupon}
              aria-label="Tutup"
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
            <div style={{ backgroundColor: 'var(--sa-red-bg)', border: '1px solid var(--sa-red-border)', color: 'var(--sa-red-text)', padding: '10px 14px', borderRadius: 'var(--sa-radius-sm)', fontSize: '13px', marginBottom: '14px' }}>
              {error}
            </div>
          )}
          {successMsg && (
            <div style={{ backgroundColor: 'var(--sa-green-bg)', border: '1px solid var(--sa-green-border)', color: 'var(--sa-green-text)', padding: '10px 14px', borderRadius: 'var(--sa-radius-sm)', fontSize: '13px', marginBottom: '14px' }}>
              {successMsg}
            </div>
          )}

          {/* Who processed the invoice, and why it was rejected (staff side of the review). */}
          {!isPending && (currentItem.rejection_reason || currentItem.reviewed_by_name || currentItem.reviewed_at) && (
            <div className={`sa-proof-review${currentItem.status === 'rejected' ? ' sa-proof-review--rejected' : ''}`}>
              {currentItem.status === 'rejected' && currentItem.rejection_reason && (
                <div>
                  Alasan penolakan: <strong>{currentItem.rejection_reason}</strong>
                </div>
              )}
              {(currentItem.reviewed_by_name || currentItem.reviewed_at) && (
                <div>
                  {currentItem.status === 'approved' ? 'Disetujui' : currentItem.status === 'rejected' ? 'Ditolak' : 'Diproses'}
                  {currentItem.reviewed_by_name ? ` oleh ${currentItem.reviewed_by_name}` : ''}
                  {currentItem.reviewed_at ? `, ${formatDateTimeWIB(currentItem.reviewed_at)}` : ''}
                </div>
              )}
            </div>
          )}

          {/* ── Section 1: Tagihan ── */}
          <div style={{ ...sectionStyle, backgroundColor: 'var(--sa-surface)', border: '1px solid var(--sa-border)' }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--sa-green-text)', marginBottom: '4px' }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, borderTop: '1px solid var(--sa-border)', paddingTop: '8px', marginTop: '4px', color: 'var(--sa-text)' }}>
                  <span>Total Transfer</span>
                  <span style={{ color: 'var(--sa-text)' }}>{formatIDR(currentItem.final_amount ?? currentItem.amount)}</span>
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
                    fontSize: '13px', fontWeight: 600, color: 'var(--sa-text-secondary)', display: 'inline-flex',
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
                    fontSize: '13px', fontWeight: 600, color: 'var(--sa-text-secondary)', display: 'inline-flex',
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
              {plansError ? (
                <div className="sa-proof-confirm">
                  <span className="sa-note sa-note--danger">{plansError}</span>
                  <div className="sa-proof-confirm__actions">
                    <button type="button" className="sa-btn sa-btn--secondary sa-btn--sm" onClick={retryPlans} disabled={plansLoading}>
                      {plansLoading ? 'Memuat...' : 'Coba lagi'}
                    </button>
                  </div>
                </div>
              ) : plans.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--sa-text-muted)', marginBottom: '10px' }}>
                  {plansLoading ? 'Memuat daftar paket...' : 'Belum ada paket.'}
                </div>
              ) : (
                <div style={{ marginBottom: '10px' }}>
                  <CustomDropdown
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(Number(e.target.value))}
                    disabled={updatingPlan}
                    options={plans.map((p) => ({ value: p.id, label: `${p.name} — ${formatIDR(p.price)}` }))}
                  />
                </div>
              )}

              {targetPlan && selectedPlanId !== currentItem.plan_id && (
                <div style={{ backgroundColor: 'var(--sa-surface)', padding: '10px 12px', borderRadius: 'var(--sa-radius-sm)', marginBottom: '10px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--sa-text-secondary)' }}>
                    <span>Harga Paket Baru</span><span>{formatIDR(targetPlan.price)}</span>
                  </div>
                  {hasCoupon && couponPercentage !== null && couponPercentage > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--sa-text-secondary)' }}>
                      <span>Kupon {currentItem.coupon_code} (tetap dipakai)</span>
                      <span>-{formatIDR(targetPlan.price - discountedPrice(targetPlan.price, couponPercentage))}</span>
                    </div>
                  )}
                  {hasCoupon && couponPreview?.estimated && (
                    <div className="sa-note">
                      Perkiraan. Diskon kupon affiliator {currentItem.coupon_code} akan dihitung ulang oleh server saat paket disimpan.
                    </div>
                  )}
                  {couponPlanMismatch && (
                    <div style={{ marginBottom: '4px', color: 'var(--sa-red-text)' }}>
                      Kupon {currentItem.coupon_code} hanya berlaku untuk paket {invoiceCoupon?.plan_name || 'lain'}. Hapus kupon dulu sebelum mengganti paket.
                    </div>
                  )}
                  {(currentItem.unique_code || 0) > 0 && previewTotal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--sa-text-secondary)' }}>
                      <span>Kode Unik (tetap)</span><span>+Rp {currentItem.unique_code}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--sa-border)', paddingTop: '6px' }}>
                    <span>Total Baru</span>
                    <span style={{ color: 'var(--sa-text)' }}>{formatIDR(previewTotal)}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="sa-btn sa-btn--secondary" onClick={() => setShowUpsellForm(false)} disabled={updatingPlan} style={{ padding: '6px 12px', fontSize: '13px' }}>Batal</button>
                <button
                  type="button" className="sa-btn sa-btn--primary" onClick={handleSavePlan}
                  disabled={updatingPlan || selectedPlanId === currentItem.plan_id}
                  style={{ padding: '6px 12px', fontSize: '13px' }}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--sa-green-bg)', border: '1px solid var(--sa-green-border)', borderRadius: 'var(--sa-radius-sm)', padding: '8px 12px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--sa-green-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Tag size={13} />
                    Kupon aktif: <strong>{currentItem.coupon_code}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveCoupon(true)}
                    disabled={updatingCoupon || confirmRemoveCoupon}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sa-red-text)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 600 }}
                  >
                    <XCircle size={14} />
                    Hapus
                  </button>
                </div>
              )}
              {hasCoupon && confirmRemoveCoupon && (
                <div className="sa-proof-confirm">
                  <span>
                    Hapus kupon {currentItem.coupon_code}? Total tagihan langsung kembali ke harga penuh.
                    {couponNotReapplicable && (
                      <strong className="sa-note--danger">
                        {' '}
                        {invoiceCoupon
                          ? 'Kupon ini sudah tidak berlaku (nonaktif, kedaluwarsa, atau kuotanya habis), jadi tidak bisa dipasang lagi.'
                          : 'Ini kupon affiliator; bila affiliator sudah mengganti kodenya, kupon ini tidak bisa dipasang lagi.'}
                      </strong>
                    )}
                  </span>
                  <div className="sa-proof-confirm__actions">
                    <button type="button" className="sa-btn sa-btn--secondary sa-btn--sm" onClick={() => setConfirmRemoveCoupon(false)} disabled={updatingCoupon}>
                      Batal
                    </button>
                    <button type="button" className="sa-btn sa-btn--danger sa-btn--sm" onClick={() => void handleRemoveCoupon()} disabled={updatingCoupon}>
                      {updatingCoupon ? 'Menghapus...' : 'Ya, hapus kupon'}
                    </button>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Masukkan kode kupon..."
                  style={{
                    flex: 1, padding: '8px 12px', fontSize: 'var(--db-text-input)', border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)', textTransform: 'uppercase', letterSpacing: '0.04em',
                    boxSizing: 'border-box',
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    if (!updatingCoupon) void handleApplyCoupon();
                  }}
                />
                <button
                  type="button" className="sa-btn sa-btn--primary" onClick={handleApplyCoupon}
                  disabled={updatingCoupon || !couponInput.trim()}
                  style={{ padding: '8px 14px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
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
                <span style={{ color: 'var(--sa-text-muted)', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
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
                  <span style={{ color: 'var(--sa-text-subtle)', fontStyle: 'italic', fontSize: '13px' }}>Belum dicantumkan</span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', fontSize: '13px', gap: '4px' }}>
                <span style={{ color: 'var(--sa-text-muted)', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
                  <Mail size={11} /> Email
                </span>
                {currentItem.tenant_email ? (
                  <a href={`mailto:${currentItem.tenant_email}`} style={{ color: 'var(--sa-text)', textDecoration: 'none', fontWeight: 500 }}>
                    {currentItem.tenant_email}
                  </a>
                ) : (
                  <span style={{ color: 'var(--sa-text-subtle)', fontStyle: 'italic', fontSize: '13px' }}>-</span>
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
                    src={proofFile.url || undefined}
                    alt="Bukti Transfer"
                    style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                  />
                </div>
                <div style={{ marginTop: '8px', textAlign: 'center' }}>
                  <a
                    href={proofFile.url || undefined}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '13px', color: 'var(--sa-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                  >
                    Buka di tab baru
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ padding: '32px 0', textAlign: 'center', backgroundColor: 'var(--sa-surface)', borderRadius: 'var(--sa-radius-sm)', color: 'var(--sa-text-muted)', fontSize: '13px', border: '1px dashed var(--sa-border)' }}>
                Belum ada file bukti transfer
              </div>
            )}
          </div>

          {/* Proof uploaded for a different total: warn above the approve action, without blocking it. */}
          {proofMismatch && (
            <div
              role="alert"
              style={{
                marginTop: '14px',
                padding: '12px 14px',
                borderRadius: 'var(--sa-radius-sm)',
                backgroundColor: 'var(--sa-amber-bg)',
                border: '1px solid var(--sa-amber-border)',
                color: 'var(--sa-amber-text)',
                fontSize: '13px',
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                Bukti transfer diunggah untuk tagihan <strong>{formatIDR(currentItem.proof_final_amount ?? 0)}</strong>. Total tagihan sekarang{' '}
                <strong>{formatIDR(currentItem.final_amount)}</strong> - cek mutasi sebelum menyetujui.
              </span>
            </div>
          )}

          {/* Approve confirmation (inline, above footer) */}
          {/* A paid invoice without a transfer proof cannot be approved (the backend refuses it too). */}
          {showApproveConfirm && isPending && !missingProof && (
            <div
              style={{
                marginTop: '14px',
                padding: '12px 14px',
                borderRadius: 'var(--sa-radius-sm)',
                backgroundColor: 'var(--sa-surface)',
                border: '1px solid var(--sa-border)',
                color: 'var(--sa-text-secondary)',
                fontSize: '13px',
                lineHeight: 1.5,
              }}
            >
              Setujui pembayaran <strong>{formatIDR(payableAmount)}</strong> dari <strong>{currentItem.tenant_name}</strong> untuk paket{' '}
              <strong>{currentItem.plan_name}</strong>? Travel langsung aktif dan masa langganan diperpanjang. Tindakan ini tidak bisa dibatalkan.
            </div>
          )}

          {/* Reject reason form (inline, above footer) */}
          {showRejectForm && isPending && (
            <div style={{ marginTop: '14px' }}>
              <label style={{ ...labelStyle }}>Alasan Penolakan</label>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Contoh: Nominal tidak sesuai, struk tidak terbaca..."
                style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--db-text-input)', border: '1px solid var(--sa-border)', borderRadius: 'var(--sa-radius-sm)', boxSizing: 'border-box', resize: 'vertical' }}
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
            backgroundColor: 'var(--sa-surface)',
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
                  onClick={() => { setShowRejectForm(true); setShowApproveConfirm(false); setError(null); }}
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

              {missingProof ? null : !showApproveConfirm ? (
                <button
                  type="button" className="sa-btn sa-btn--primary"
                  onClick={() => { setShowApproveConfirm(true); setShowRejectForm(false); setError(null); }}
                  disabled={processing || updatingPlan || updatingCoupon}
                >
                  <Check size={14} />
                  <span>Setujui Pembayaran</span>
                </button>
              ) : (
                <>
                  <button
                    type="button" className="sa-btn sa-btn--secondary"
                    onClick={() => setShowApproveConfirm(false)}
                    disabled={processing}
                  >
                    Batal
                  </button>
                  <button
                    type="button" className="sa-btn sa-btn--primary"
                    onClick={handleApprove}
                    disabled={processing || updatingPlan || updatingCoupon}
                  >
                    <Check size={14} />
                    <span>{processing ? 'Memproses...' : 'Ya, Setujui & Aktifkan'}</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
