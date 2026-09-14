import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  Eye,
  MessageCircle,
} from 'lucide-react';
import {
  StaffLayout,
  PageHeader,
  Table,
  Button,
  Modal,
  Badge,
  type Column,
} from '../components';
import {
  fetchStaffPaymentVerifications,
  approvePaymentVerification,
  rejectPaymentVerification,
  type PaymentVerificationItem,
} from '../services/staffApi';
import { API_BASE } from '../services/api';

export const StaffPaymentVerificationsPage: React.FC = () => {
  const [verifications, setVerifications] = useState<PaymentVerificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter queue: 'all' | 'pending' | 'approved' | 'rejected'
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  // Approve Modal State
  const [isApproveModalOpen, setIsApproveModalOpen] = useState<boolean>(false);
  const [selectedForApprove, setSelectedForApprove] = useState<PaymentVerificationItem | null>(null);
  const [approving, setApproving] = useState<boolean>(false);

  // Reject Modal State
  const [isRejectModalOpen, setIsRejectModalOpen] = useState<boolean>(false);
  const [selectedForReject, setSelectedForReject] = useState<PaymentVerificationItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<boolean>(false);

  // Image Preview Modal
  const [previewImageURL, setPreviewImageURL] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStaffPaymentVerifications(statusFilter);
      setVerifications(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar verifikasi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const cleanWa = (num?: string | null) => {
    if (!num) return '';
    let digits = num.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = '62' + digits.slice(1);
    }
    return digits;
  };

  const handleOpenApprove = (item: PaymentVerificationItem) => {
    setSelectedForApprove(item);
    setIsApproveModalOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!selectedForApprove) return;
    try {
      setApproving(true);
      await approvePaymentVerification(selectedForApprove.id);
      setSuccessMsg(
        `Pembayaran perpanjangan untuk ${selectedForApprove.tenant_name || 'Travel'} berhasil disetujui.`
      );
      setTimeout(() => setSuccessMsg(null), 4000);
      setIsApproveModalOpen(false);
      setSelectedForApprove(null);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Gagal menyetujui pembayaran');
    } finally {
      setApproving(false);
    }
  };

  const handleOpenReject = (item: PaymentVerificationItem) => {
    setSelectedForReject(item);
    setRejectionReason('');
    setRejectError(null);
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForReject) return;
    const trimmedReason = rejectionReason.trim();
    if (!trimmedReason) {
      setRejectError('Alasan penolakan wajib diisi agar travel memahami kendala pembayaran.');
      return;
    }

    try {
      setRejecting(true);
      setRejectError(null);
      await rejectPaymentVerification(selectedForReject.id, trimmedReason);
      setSuccessMsg(`Permohonan perpanjangan berhasil ditolak.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setIsRejectModalOpen(false);
      setSelectedForReject(null);
      loadData();
    } catch (err: any) {
      setRejectError(err.message || 'Gagal menolak pembayaran');
    } finally {
      setRejecting(false);
    }
  };

  const columns: Column<PaymentVerificationItem>[] = [
    {
      key: 'tenant',
      label: 'Travel',
      render: (item: PaymentVerificationItem) => (
        <div>
          <strong style={{ color: 'var(--db-text-primary)', display: 'block' }}>
            {item.tenant_name || `Tenant #${item.tenant_id}`}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block' }}>
            {item.tenant_slug ? `${item.tenant_slug}.klikumroh.id` : `ID: ${item.tenant_id}`}
          </span>
          {item.tenant_whatsapp && (
            <a
              href={`https://wa.me/${cleanWa(item.tenant_whatsapp)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                color: 'var(--db-positive)',
                fontSize: '12px',
                fontWeight: 600,
                marginTop: '4px',
                textDecoration: 'none',
              }}
              title="Hubungi Travel via WhatsApp"
            >
              <MessageCircle size={12} />
              <span>{item.tenant_whatsapp}</span>
            </a>
          )}
        </div>
      ),
    },
    {
      key: 'plan',
      label: 'Paket Langganan',
      render: (item: PaymentVerificationItem) => (
        <div>
          <span style={{ fontWeight: 500, color: 'var(--db-text-primary)' }}>
            {item.plan_name || `Paket #${item.plan_id}`}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block' }}>
            {item.plan_period_months ? `${item.plan_period_months} Bulan` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'coupon',
      label: 'Kupon',
      render: (item: PaymentVerificationItem) => (
        item.coupon_code ? (
          <Badge variant="neutral">
            {item.coupon_code}
          </Badge>
        ) : (
          <span style={{ color: 'var(--db-text-muted)' }}>-</span>
        )
      ),
    },
    {
      key: 'amount',
      label: 'Total Bayar',
      render: (item: PaymentVerificationItem) => (
        <div>
          <strong style={{ color: 'var(--db-text-primary)', display: 'block' }}>
            {formatIDR(item.final_amount)}
          </strong>
          {Boolean(item.unique_code && item.unique_code > 0) && (
            <span style={{ fontSize: '11px', color: 'var(--db-rating-star)', display: 'block', fontWeight: 600 }}>
              Kode Unik: +{item.unique_code}
            </span>
          )}
          {item.final_amount < item.amount && (
            <span style={{ fontSize: '12px', color: 'var(--db-text-muted)', textDecoration: 'line-through' }}>
              {formatIDR(item.amount)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'proof',
      label: 'Bukti Transfer',
      render: (item: PaymentVerificationItem) => {
        if (!item.proof_url) {
          return <span style={{ fontSize: '13px', color: 'var(--db-text-muted)' }}>Tanpa Bukti (Diskon 100%)</span>;
        }
        const fullURL = `${API_BASE}${item.proof_url}`;
        return (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPreviewImageURL(fullURL)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Eye size={14} />
            <span>Lihat Bukti</span>
          </Button>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (item: PaymentVerificationItem) => {
        if (item.status === 'pending') {
          return (
            <Badge variant="neutral">
              {item.proof_url ? 'Siap Diverifikasi' : 'Menunggu Transfer'}
            </Badge>
          );
        }
        if (item.status === 'approved') {
          return <Badge variant="positive">Lunas</Badge>;
        }
        return <Badge variant="negative">Ditolak</Badge>;
      },
    },
    {
      key: 'created_at',
      label: 'Tanggal Pengajuan',
      render: (item: PaymentVerificationItem) => (
        <span style={{ fontSize: '13px', color: 'var(--db-text-muted)' }}>
          {formatDate(item.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Aksi / Keterangan',
      render: (item: PaymentVerificationItem) => {
        if (item.status === 'pending') {
          return (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleOpenApprove(item)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <CheckCircle2 size={14} />
                <span>Setujui</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleOpenReject(item)}
                style={{
                  color: 'var(--db-negative)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <XCircle size={14} />
                <span>Tolak</span>
              </Button>
            </div>
          );
        }
        if (item.status === 'approved') {
          return (
            <div style={{ fontSize: '12px', color: 'var(--db-positive)' }}>
              Disetujui {formatDate(item.reviewed_at)}
              {item.reviewed_by_name && ` oleh ${item.reviewed_by_name}`}
            </div>
          );
        }
        return (
          <div style={{ fontSize: '12px', color: 'var(--db-negative)' }}>
            <strong>Alasan:</strong> {item.rejection_reason || 'Tidak ada catatan'}
          </div>
        );
      },
    },
  ];

  return (
    <StaffLayout title="Approval Pembayaran">
      <PageHeader
        title="Approval Pembayaran Langganan"
        subtitle="Verifikasi bukti transfer dan perpanjangan masa aktif travel umroh"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={loadData}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'db-spin' : ''} />
            <span>Muat Ulang</span>
          </Button>
        }
      />

      {successMsg && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            backgroundColor: 'var(--db-positive-subtle)',
            color: 'var(--db-positive)',
            borderRadius: '6px',
            border: '1px solid var(--db-positive)',
            fontSize: '14px',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            backgroundColor: 'var(--db-negative-subtle)',
            color: 'var(--db-negative)',
            borderRadius: '6px',
            border: '1px solid var(--db-negative)',
            fontSize: '14px',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Queue Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
          borderBottom: '1px solid var(--db-border)',
          paddingBottom: '12px',
        }}
      >
        {[
          { id: 'pending', label: 'Antrean Verifikasi' },
          { id: 'approved', label: 'Lunas' },
          { id: 'rejected', label: 'Ditolak' },
          { id: 'all', label: 'Semua Transaksi' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: statusFilter === tab.id ? 600 : 400,
              borderRadius: '6px',
              border: statusFilter === tab.id ? '1px solid var(--db-primary)' : '1px solid var(--db-border)',
              backgroundColor: statusFilter === tab.id ? 'var(--db-primary-subtle)' : 'var(--db-surface)',
              color: statusFilter === tab.id ? 'var(--db-primary)' : 'var(--db-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div
        style={{
          background: 'var(--db-surface)',
          borderRadius: '8px',
          border: '1px solid var(--db-border)',
          overflow: 'hidden',
        }}
      >
        <Table<PaymentVerificationItem>
          columns={columns}
          data={verifications}
          loading={loading}
          emptyMessage="Tidak ada antrean verifikasi pembayaran."
        />
      </div>

      {/* Modal Approve Confirmation */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title="Setujui Verifikasi Pembayaran"
      >
        <div>
          <p style={{ color: 'var(--db-text-primary)', fontSize: '14px', marginBottom: '16px' }}>
            Apakah Anda yakin ingin menyetujui perpanjangan langganan untuk{' '}
            <strong style={{ color: 'var(--db-primary)' }}>
              {selectedForApprove?.tenant_name}
            </strong>
            ?
          </p>

          <div
            style={{
              backgroundColor: 'var(--db-surface-hover)',
              padding: '12px 16px',
              borderRadius: '6px',
              border: '1px solid var(--db-border)',
              marginBottom: '20px',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div>
              <span style={{ color: 'var(--db-text-muted)' }}>Paket: </span>
              <strong style={{ color: 'var(--db-text-primary)' }}>
                {selectedForApprove?.plan_name} ({selectedForApprove?.plan_period_months} Bulan)
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--db-text-muted)' }}>Total Nominal: </span>
              <strong style={{ color: 'var(--db-text-primary)' }}>
                {formatIDR(selectedForApprove?.final_amount || 0)}
              </strong>
            </div>
            {Boolean(selectedForApprove?.unique_code && selectedForApprove.unique_code > 0) && (
              <div>
                <span style={{ color: 'var(--db-text-muted)' }}>Kode Unik Transfer: </span>
                <strong style={{ color: 'var(--db-rating-star)' }}>+{selectedForApprove?.unique_code}</strong>
              </div>
            )}
            {selectedForApprove?.coupon_code && (
              <div>
                <span style={{ color: 'var(--db-text-muted)' }}>Kupon Promo: </span>
                <strong style={{ color: 'var(--db-primary)' }}>{selectedForApprove.coupon_code}</strong>
              </div>
            )}
            {selectedForApprove?.tenant_whatsapp && (
              <div>
                <span style={{ color: 'var(--db-text-muted)' }}>WhatsApp Travel: </span>
                <a
                  href={`https://wa.me/${cleanWa(selectedForApprove.tenant_whatsapp)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--db-positive)',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <MessageCircle size={13} />
                  <span>{selectedForApprove.tenant_whatsapp}</span>
                </a>
              </div>
            )}
            <div style={{ color: 'var(--db-text-muted)', fontStyle: 'italic', marginTop: '4px' }}>
              Masa aktif travel akan diperpanjang secara otomatis (non-greedy: melanjutkan tanggal kedaluwarsa sebelumnya jika masih aktif).
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsApproveModalOpen(false)}
              disabled={approving}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmApprove}
              disabled={approving}
            >
              {approving ? 'Menyetujui...' : 'Ya, Setujui Pembayaran'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Reject Form */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Tolak Verifikasi Pembayaran"
      >
        <form onSubmit={handleConfirmReject}>
          {rejectError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                marginBottom: '16px',
                backgroundColor: 'var(--db-negative-subtle)',
                color: 'var(--db-negative)',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              <AlertCircle size={16} />
              <span>{rejectError}</span>
            </div>
          )}

          <p style={{ color: 'var(--db-text-primary)', fontSize: '14px', marginBottom: '16px' }}>
            Menolak perpanjangan untuk{' '}
            <strong style={{ color: 'var(--db-text-primary)' }}>{selectedForReject?.tenant_name}</strong>.
            Silakan masukkan alasan penolakan agar pengelola travel dapat memperbaiki pembayarannya:
          </p>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--db-text-primary)',
                marginBottom: '6px',
              }}
            >
              Alasan Penolakan <span style={{ color: 'var(--db-negative)' }}>*</span>
            </label>
            <textarea
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Contoh: Bukti transfer tidak terbaca / nominal tidak sesuai / mutasi rekening belum masuk."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--db-border)',
                backgroundColor: 'var(--db-surface)',
                color: 'var(--db-text-primary)',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsRejectModalOpen(false)}
              disabled={rejecting}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="secondary"
              disabled={rejecting}
              style={{ color: 'var(--db-negative)' }}
            >
              {rejecting ? 'Menolak...' : 'Tolak Pembayaran'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Preview Bukti Transfer */}
      <Modal
        isOpen={Boolean(previewImageURL)}
        onClose={() => setPreviewImageURL(null)}
        title="Bukti Transfer Pembayaran"
      >
        <div style={{ textAlign: 'center' }}>
          {previewImageURL && (
            <img
              src={previewImageURL}
              alt="Bukti Transfer"
              style={{
                maxWidth: '100%',
                maxHeight: '65vh',
                borderRadius: '6px',
                border: '1px solid var(--db-border)',
                objectFit: 'contain',
              }}
            />
          )}
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setPreviewImageURL(null)}>
              Tutup
            </Button>
          </div>
        </div>
      </Modal>
    </StaffLayout>
  );
};
