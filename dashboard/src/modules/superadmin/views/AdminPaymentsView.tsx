import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Eye, Phone, Mail } from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import { AdminDataGrid, type AdminColumn, type AdminTabOption } from '../components/AdminDataGrid';
import { AdminProofModal } from '../components/AdminProofModal';
import {
  fetchStaffPaymentVerifications,
  approvePaymentVerification,
  rejectPaymentVerification,
  type PaymentVerificationItem,
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

export const AdminPaymentsView: React.FC = () => {
  const [items, setItems] = useState<PaymentVerificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('pending');
  const [selectedItem, setSelectedItem] = useState<PaymentVerificationItem | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStaffPaymentVerifications();
      setItems(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat antrean pembayaran');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const approvedCount = items.filter((i) => i.status === 'approved').length;
  const rejectedCount = items.filter((i) => i.status === 'rejected').length;

  const tabs: AdminTabOption[] = [
    { key: 'pending', label: 'Menunggu Review', count: pendingCount },
    { key: 'approved', label: 'Disetujui', count: approvedCount },
    { key: 'rejected', label: 'Ditolak', count: rejectedCount },
    { key: 'all', label: 'Semua Transaksi' },
  ];

  const filteredItems = items.filter((item) => {
    if (activeTab === 'all') return true;
    return item.status === activeTab;
  });

  const handleApprove = async (id: number) => {
    await approvePaymentVerification(id);
    setSuccessMessage(`Pembayaran #${id} berhasil disetujui. Paket travel telah aktif.`);
    loadData();
  };

  const handleReject = async (id: number, reason: string) => {
    await rejectPaymentVerification(id, reason);
    setSuccessMessage(`Pembayaran #${id} telah ditolak.`);
    loadData();
  };

  const columns: AdminColumn<PaymentVerificationItem>[] = [
    {
      key: 'id',
      label: 'ID',
      width: '60px',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--sa-text-muted)', fontSize: '12px' }}>
          #{row.id}
        </span>
      ),
    },
    {
      key: 'tenant_name',
      label: 'Travel Mitra',
      render: (row) => {
        const waClean = cleanWhatsApp(row.tenant_whatsapp);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontWeight: 600, color: 'var(--sa-text)' }}>
              {row.tenant_name}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', flexWrap: 'nowrap' }}>
              {row.tenant_whatsapp ? (
                <a
                  href={`https://wa.me/${waClean}?text=${encodeURIComponent(`Halo ${row.tenant_name}, terkait verifikasi pembayaran paket ${row.plan_name || ''} di KlikUmroh...`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    color: 'var(--sa-green-text)',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                  title="Hubungi via WhatsApp"
                >
                  <Phone size={11} />
                  <span>{row.tenant_whatsapp}</span>
                </a>
              ) : (
                <span style={{ color: 'var(--sa-text-subtle)', fontStyle: 'italic' }}>Tanpa WA</span>
              )}
              {row.tenant_email && (
                <a
                  href={`mailto:${row.tenant_email}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    color: 'var(--sa-text-muted)',
                    textDecoration: 'none',
                  }}
                  title={row.tenant_email}
                >
                  <Mail size={11} />
                  <span>{row.tenant_email}</span>
                </a>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'plan_name',
      label: 'Paket Langganan',
      render: (row) => (
        <span className="sa-badge sa-badge--neutral">
          {row.plan_name}
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'Nominal Transfer',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <strong style={{ color: 'var(--sa-text-primary)', fontFamily: 'var(--sa-font-heading)' }}>
            {formatIDR(row.final_amount || row.amount)}
          </strong>
          {row.coupon_code && (
            <span style={{ fontSize: '11px', color: '#15803D', fontWeight: 600 }}>
              Kupon: {row.coupon_code}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      label: 'Tanggal Upload',
      render: (row) => (
        <span style={{ fontSize: '12px', color: 'var(--sa-text-muted)' }}>
          {formatDate(row.created_at)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span
          className={`sa-badge ${
            row.status === 'approved'
              ? 'sa-badge--active'
              : row.status === 'rejected'
              ? 'sa-badge--expired'
              : 'sa-badge--pending'
          }`}
        >
          {row.status === 'approved'
            ? 'Disetujui'
            : row.status === 'rejected'
            ? 'Ditolak'
            : 'Menunggu Review'}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Aksi',
      align: 'right',
      render: (row) => (
        <button
          type="button"
          className="sa-btn sa-btn--secondary sa-btn--sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedItem(row);
          }}
        >
          <Eye size={13} />
          <span>{row.status === 'pending' ? 'Verifikasi' : 'Lihat Bukti'}</span>
        </button>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Verifikasi Pembayaran"
      subtitle="Antrean bukti transfer bank manual untuk aktivasi paket langganan"
      headerActions={
        <button
          type="button"
          className="sa-btn sa-btn--secondary"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'db-spin' : ''} />
          <span>Segarkan</span>
        </button>
      }
    >
      {successMessage && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: 'var(--sa-radius-sm)',
            color: '#059669',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 'var(--sa-radius-sm)',
            color: '#DC2626',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Integrated Payments Data Grid */}
      <AdminDataGrid
        title="Antrean Transfer"
        data={filteredItems}
        columns={columns}
        loading={loading}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        searchPlaceholder="Cari nama travel..."
        searchKeys={['tenant_name', 'plan_name']}
        onRowClick={(row) => setSelectedItem(row)}
        emptyMessage="Tidak ada antrean pembayaran pada status ini"
      />

      {/* Proof Viewer Modal */}
      <AdminProofModal
        item={selectedItem}
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onPlanUpdated={(updated) => {
          setSelectedItem(updated);
          loadData();
        }}
      />
    </AdminLayout>
  );
};
