import React, { useState, useEffect } from 'react';
import { Plus, PowerOff, RefreshCw, AlertCircle, CheckCircle2, Ticket } from 'lucide-react';
import {
  StaffLayout,
  PageHeader,
  Table,
  Button,
  Modal,
  FormInput,
  Badge,
  type Column,
} from '../components';
import {
  fetchStaffCoupons,
  createStaffCoupon,
  deactivateStaffCoupon,
  fetchPricingPlans,
  type Coupon,
  type CouponInput,
  type PricingPlan,
} from '../services/staffApi';

export const StaffCouponsPage: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [formData, setFormData] = useState<CouponInput>({
    code: '',
    discount_percentage: 10,
    max_uses: null,
    expires_at: null,
    plan_id: null,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Deactivate Modal State
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState<boolean>(false);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [deactivating, setDeactivating] = useState<boolean>(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, planList] = await Promise.all([
        fetchStaffCoupons(),
        fetchPricingPlans(),
      ]);
      setCoupons(data);
      setPlans(planList);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar kupon');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAddModal = () => {
    setFormData({
      code: '',
      discount_percentage: 10,
      max_uses: null,
      expires_at: null,
      plan_id: null,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = formData.code.trim().toUpperCase();
    if (!code) {
      setFormError('Kode kupon wajib diisi');
      return;
    }
    if (formData.discount_percentage <= 0 || formData.discount_percentage > 100) {
      setFormError('Persentase diskon harus antara 1% dan 100%');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      await createStaffCoupon({
        code,
        discount_percentage: formData.discount_percentage,
        max_uses: formData.max_uses ? Number(formData.max_uses) : null,
        expires_at: formData.expires_at ? formData.expires_at : null,
        plan_id: formData.plan_id ? Number(formData.plan_id) : null,
      });

      setSuccessMsg(`Kupon "${code}" berhasil dibuat.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal membuat kupon');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!selectedCoupon) return;
    try {
      setDeactivating(true);
      await deactivateStaffCoupon(selectedCoupon.id);
      setSuccessMsg(`Kupon "${selectedCoupon.code}" berhasil dinonaktifkan.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setIsDeactivateModalOpen(false);
      setSelectedCoupon(null);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Gagal menonaktifkan kupon');
    } finally {
      setDeactivating(false);
    }
  };

  const columns: Column<Coupon>[] = [
    {
      key: 'code',
      label: 'Kode Kupon',
      render: (item: Coupon) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Ticket size={16} style={{ color: 'var(--db-primary)' }} />
          <strong style={{ fontFamily: 'monospace', fontSize: '15px', color: 'var(--db-text-primary)' }}>
            {item.code}
          </strong>
        </div>
      ),
    },
    {
      key: 'discount_percentage',
      label: 'Potongan Diskon',
      render: (item: Coupon) => (
        <span style={{ fontWeight: 600, color: 'var(--db-primary)' }}>
          {item.discount_percentage}%
        </span>
      ),
    },
    {
      key: 'plan_name',
      label: 'Berlaku Untuk Plan',
      render: (item: Coupon) => (
        <span style={{ fontSize: '13px', color: item.plan_name ? 'var(--db-text-primary)' : 'var(--db-text-muted)' }}>
          {item.plan_name || 'Semua Plan'}
        </span>
      ),
    },
    {
      key: 'used_count',
      label: 'Pemakaian',
      render: (item: Coupon) => (
        <span>
          {item.used_count} / {item.max_uses !== null ? `${item.max_uses} kali` : 'Tak Terbatas'}
        </span>
      ),
    },
    {
      key: 'expires_at',
      label: 'Berlaku Hingga',
      render: (item: Coupon) => {
        if (!item.expires_at) return <span style={{ color: 'var(--db-text-muted)' }}>Selamanya</span>;
        const d = new Date(item.expires_at);
        const formatted = d.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        const isExpired = new Date() > new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
        return (
          <span style={{ color: isExpired ? 'var(--db-negative)' : 'var(--db-text-primary)' }}>
            {formatted} {isExpired ? '(Kedaluwarsa)' : ''}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (item: Coupon) => (
        <Badge variant={item.status === 'active' ? 'positive' : 'neutral'}>
          {item.status === 'active' ? 'Aktif' : 'Nonaktif'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Aksi',
      render: (item: Coupon) => (
        <div>
          {item.status === 'active' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedCoupon(item);
                setIsDeactivateModalOpen(true);
              }}
              style={{
                color: 'var(--db-negative)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <PowerOff size={14} />
              <span>Nonaktifkan</span>
            </Button>
          ) : (
            <span style={{ fontSize: '13px', color: 'var(--db-text-muted)' }}>Tidak ada aksi</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <StaffLayout title="Kelola Kupon">
      <PageHeader
        title="Kelola Kupon Diskon"
        subtitle="Buat dan pantau kode kupon promosi biaya langganan travel umroh"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
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
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenAddModal}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} />
              <span>Buat Kupon Baru</span>
            </Button>
          </div>
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

      <div
        style={{
          background: 'var(--db-surface)',
          borderRadius: '8px',
          border: '1px solid var(--db-border)',
          overflow: 'hidden',
        }}
      >
        <Table<Coupon>
          columns={columns}
          data={coupons}
          loading={loading}
          emptyMessage="Belum ada kupon diskon. Klik 'Buat Kupon Baru' untuk menambahkan."
        />
      </div>

      {/* Modal Tambah Kupon */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Buat Kupon Diskon Baru"
      >
        <form onSubmit={handleFormSubmit}>
          {formError && (
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
              <span>{formError}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <FormInput
              label="Kode Kupon"
              name="code"
              placeholder="Contoh: RAMADHAN2026"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              required
            />

            <FormInput
              label="Persentase Diskon (%)"
              name="discount_percentage"
              type="number"
              placeholder="10"
              value={String(formData.discount_percentage)}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  discount_percentage: parseFloat(e.target.value) || 0,
                })
              }
              required
            />

            <FormInput
              label="Maksimal Penggunaan (Opsional)"
              name="max_uses"
              type="number"
              placeholder="Kosongkan jika kuota tidak dibatasi"
              value={formData.max_uses !== null ? String(formData.max_uses) : ''}
              onChange={(e) => {
                const val = e.target.value.trim();
                setFormData({
                  ...formData,
                  max_uses: val ? parseInt(val, 10) : null,
                });
              }}
            />

            <FormInput
              label="Tanggal Kedaluwarsa (Opsional)"
              name="expires_at"
              type="date"
              value={formData.expires_at || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  expires_at: e.target.value || null,
                })
              }
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--db-text-primary)' }}>
                Batasan Paket Plan (Opsional)
              </label>
              <select
                style={{
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--db-border)',
                  backgroundColor: 'var(--db-surface)',
                  color: 'var(--db-text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                }}
                value={formData.plan_id !== null && formData.plan_id !== undefined ? String(formData.plan_id) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({
                    ...formData,
                    plan_id: val ? Number(val) : null,
                  });
                }}
              >
                <option value="">Semua Plan (Tanpa Batasan)</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.period_months} Bulan)
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>
                Pilih jika kupon ini hanya berlaku untuk paket langganan tertentu.
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '24px',
            }}
          >
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan Kupon'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Konfirmasi Nonaktifkan Kupon */}
      <Modal
        isOpen={isDeactivateModalOpen}
        onClose={() => setIsDeactivateModalOpen(false)}
        title="Nonaktifkan Kupon"
      >
        <div>
          <p style={{ color: 'var(--db-text-primary)', fontSize: '14px', marginBottom: '20px' }}>
            Apakah Anda yakin ingin menonaktifkan kode kupon{' '}
            <strong style={{ color: 'var(--db-primary)' }}>{selectedCoupon?.code}</strong>? Kupon yang
            sudah dinonaktifkan tidak dapat digunakan lagi oleh travel saat perpanjangan langganan.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsDeactivateModalOpen(false)}
              disabled={deactivating}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleConfirmDeactivate}
              disabled={deactivating}
              style={{ color: 'var(--db-negative)' }}
            >
              {deactivating ? 'Memproses...' : 'Nonaktifkan Kupon'}
            </Button>
          </div>
        </div>
      </Modal>
    </StaffLayout>
  );
};
