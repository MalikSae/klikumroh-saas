import { formatDateWIB } from '../../../utils/datetime';
import React, { useState, useEffect } from 'react';
import { Plus, PowerOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import { couponState } from '../shared/statusLabels';
import { AdminDataGrid, type AdminColumn } from '../components/AdminDataGrid';
import {
  fetchStaffCoupons,
  createStaffCoupon,
  deactivateStaffCoupon,
  type Coupon,
  type CouponInput,
} from '../../../services/staffApi';

export const AdminCouponsView: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<CouponInput>({
    code: '',
    discount_percentage: 10,
    max_uses: 100,
    expires_at: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStaffCoupons();
      setCoupons(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat kupon promo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatDate = (dateStr?: string | null) => formatDateWIB(dateStr);

  const handleDeactivate = async (id: number) => {
    if (!window.confirm('Nonaktifkan kupon ini sekarang?')) return;
    try {
      setLoading(true);
      await deactivateStaffCoupon(id);
      setSuccessMessage('Kupon berhasil dinonaktifkan');
      loadData();
    } catch (err: any) {
      alert('Gagal menonaktifkan kupon: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || formData.discount_percentage <= 0) {
      alert('Mohon isi kode kupon dan nilai diskon dengan benar');
      return;
    }

    try {
      setSubmitting(true);
      await createStaffCoupon({
        ...formData,
        code: formData.code.trim().toUpperCase(),
        max_uses: formData.max_uses ? Number(formData.max_uses) : null,
        expires_at: formData.expires_at ? formData.expires_at : null,
      });
      setShowModal(false);
      setSuccessMessage('Kupon promo baru berhasil dibuat');
      loadData();
    } catch (err: any) {
      alert('Gagal membuat kupon: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const columns: AdminColumn<Coupon>[] = [
    {
      key: 'code',
      label: 'Kode Kupon',
      render: (row) => (
        <span
          style={{
            fontFamily: 'var(--sa-font-code)',
            fontWeight: 700,
            fontSize: '13px',
            backgroundColor: 'var(--sa-surface)',
            padding: '2px 8px',
            borderRadius: 'var(--sa-radius-sm)',
            border: '1px solid var(--sa-border)',
          }}
        >
          {row.code}
        </span>
      ),
    },
    {
      key: 'discount_percentage',
      label: 'Diskon',
      render: (row) => (
        <strong style={{ color: 'var(--sa-text)' }}>
          {row.discount_percentage}%
        </strong>
      ),
    },
    {
      key: 'usage',
      label: 'Penggunaan / Kuota',
      render: (row) => (
        <span style={{ fontSize: '13px', color: 'var(--sa-text-secondary)' }}>
          {row.used_count || 0} / {row.max_uses && row.max_uses > 0 ? row.max_uses : 'Tak Terbatas'}
        </span>
      ),
    },
    {
      key: 'expires_at',
      label: 'Berlaku Hingga',
      render: (row) => (
        <span style={{ fontSize: '13px', color: 'var(--sa-text-muted)' }}>
          {formatDate(row.expires_at)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => {
        // Past its expiry day (WIB, like the backend) a coupon is no longer usable even if still "active".
        const st = couponState(row.status, row.expires_at);
        const view = { active: { cls: 'sa-badge--active', label: 'Aktif' }, expired: { cls: 'sa-badge--expired', label: 'Kedaluwarsa' }, inactive: { cls: 'sa-badge--expired', label: 'Nonaktif' } }[st];
        return <span className={`sa-badge ${view.cls}`}>{view.label}</span>;
      },
    },
    {
      key: 'action',
      label: 'Aksi',
      align: 'right',
      render: (row) => (
        row.status === 'active' ? (
          <button
            type="button"
            className="sa-btn sa-btn--danger sa-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDeactivate(row.id);
            }}
            title="Nonaktifkan kupon"
          >
            <PowerOff size={12} />
            <span>Nonaktifkan</span>
          </button>
        ) : (
          <span style={{ fontSize: '13px', color: 'var(--sa-text-muted)' }}>-</span>
        )
      ),
    },
  ];

  return (
    <AdminLayout
      title="Kupon Promo"
      subtitle="Manajemen kode voucher diskon untuk langganan travel mitra"
      headerActions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="sa-btn sa-btn--secondary"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'db-spin' : ''} />
            <span>Segarkan</span>
          </button>
          <button
            type="button"
            className="sa-btn sa-btn--primary"
            onClick={() => {
              setFormData({
                code: '',
                discount_percentage: 10,
                max_uses: 100,
                expires_at: '',
              });
              setShowModal(true);
            }}
          >
            <Plus size={14} />
            <span>Buat Kupon Baru</span>
          </button>
        </div>
      }
    >
      {successMessage && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--sa-green-bg)',
            border: '1px solid var(--sa-green-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--db-status-closing)',
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
            backgroundColor: 'var(--sa-red-bg)',
            border: '1px solid var(--sa-red-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--db-status-lost)',
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

      <AdminDataGrid
        title="Daftar Kupon"
        data={coupons}
        columns={columns}
        loading={loading}
        searchPlaceholder="Cari kode kupon..."
        searchKeys={['code']}
        emptyMessage="Belum ada kupon diskon promo yang dibuat"
      />

      {/* Modal Tambah Kupon */}
      {showModal && (
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
            padding: '20px',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--sa-card)',
              borderRadius: 'var(--sa-radius-md)',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: 'var(--sa-shadow-modal)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700 }}>
              Buat Kupon Diskon Baru
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--sa-text-muted)' }}>
              Atur kode voucher dan persentase potongan harga.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Kode Kupon (Otomatis Huruf Besar):
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: RAMADHANBERKAH"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    fontFamily: 'var(--sa-font-code)',
                    fontSize: 'var(--db-text-input)',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Besar Diskon (%):
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step="any"
                  required
                  value={formData.discount_percentage}
                  onChange={(e) => setFormData({ ...formData, discount_percentage: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 10px',
                    fontSize: 'var(--db-text-input)',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Batas Penggunaan:
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Kosongkan jika unlimited"
                    value={formData.max_uses || ''}
                    onChange={(e) => setFormData({ ...formData, max_uses: e.target.value ? Number(e.target.value) : null })}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 10px',
                      fontSize: 'var(--db-text-input)',
                      border: '1px solid var(--sa-border)',
                      borderRadius: 'var(--sa-radius-sm)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Kedaluwarsa (Opsional):
                  </label>
                  <input
                    type="date"
                    value={formData.expires_at || ''}
                    onChange={(e) => setFormData({ ...formData, expires_at: e.target.value || null })}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 10px',
                      fontSize: 'var(--db-text-input)',
                      border: '1px solid var(--sa-border)',
                      borderRadius: 'var(--sa-radius-sm)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="sa-btn sa-btn--secondary"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="sa-btn sa-btn--primary"
                  disabled={submitting}
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Kupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
