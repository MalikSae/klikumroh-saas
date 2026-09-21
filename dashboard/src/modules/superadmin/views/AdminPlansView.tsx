import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import { AdminDataGrid, type AdminColumn } from '../components/AdminDataGrid';
import {
  fetchPricingPlans,
  createPricingPlan,
  updatePricingPlan,
  deletePricingPlan,
  type PricingPlan,
  type PricingPlanInput,
} from '../../../services/staffApi';

export const AdminPlansView: React.FC = () => {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PricingPlan | null>(null);
  const [formData, setFormData] = useState<PricingPlanInput>({
    name: '',
    period_months: 1,
    price: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPricingPlans();
      setPlans(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat katalog paket');
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

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setFormData({ name: '', period_months: 1, price: 0 });
    setShowModal(true);
  };

  const handleOpenEdit = (plan: PricingPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      period_months: plan.period_months,
      price: plan.price,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Yakin ingin menghapus paket langganan ini?')) return;
    try {
      setLoading(true);
      await deletePricingPlan(id);
      setSuccessMessage('Paket langganan berhasil dihapus');
      loadData();
    } catch (err: any) {
      alert('Gagal menghapus paket: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.price <= 0 || formData.period_months <= 0) {
      alert('Mohon lengkapi semua field dengan benar');
      return;
    }

    try {
      setSubmitting(true);
      if (editingPlan) {
        await updatePricingPlan(editingPlan.id, formData);
        setSuccessMessage('Paket langganan berhasil diperbarui');
      } else {
        await createPricingPlan(formData);
        setSuccessMessage('Paket langganan baru berhasil ditambahkan');
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      alert('Gagal menyimpan paket: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const columns: AdminColumn<PricingPlan>[] = [
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
      key: 'name',
      label: 'Nama Paket',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--sa-text-primary)' }}>
          {row.name}
        </span>
      ),
    },
    {
      key: 'period_months',
      label: 'Durasi Masa Aktif',
      render: (row) => (
        <span className="sa-badge sa-badge--neutral">
          {row.period_months} Bulan
        </span>
      ),
    },
    {
      key: 'price',
      label: 'Harga Paket',
      render: (row) => (
        <strong style={{ fontFamily: 'var(--sa-font-heading)', color: 'var(--sa-text-primary)' }}>
          {formatIDR(row.price)}
        </strong>
      ),
    },
    {
      key: 'action',
      label: 'Aksi',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            className="sa-btn sa-btn--secondary sa-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEdit(row);
            }}
          >
            <Edit2 size={12} />
            <span>Edit</span>
          </button>
          <button
            type="button"
            className="sa-btn sa-btn--danger sa-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.id);
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Paket Langganan"
      subtitle="Katalog tier harga dan durasi langganan platform KlikUmroh"
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
            onClick={handleOpenCreate}
          >
            <Plus size={14} />
            <span>Tambah Paket</span>
          </button>
        </div>
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

      <AdminDataGrid
        title="Daftar Paket"
        data={plans}
        columns={columns}
        loading={loading}
        searchPlaceholder="Cari nama paket..."
        searchKeys={['name']}
        emptyMessage="Belum ada paket langganan yang dikonfigurasi"
      />

      {/* Modal Tambah / Edit Paket */}
      {showModal && (
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
            padding: '20px',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--sa-radius-md)',
              maxWidth: '420px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700 }}>
              {editingPlan ? 'Ubah Paket Langganan' : 'Tambah Paket Baru'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--sa-text-muted)' }}>
              Konfigurasi nama tier, durasi bulan, dan nominal harga IDR.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Nama Paket:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Paket Pro Tahunan"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    fontSize: '13px',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Durasi Periode (Bulan):
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formData.period_months}
                  onChange={(e) => setFormData({ ...formData, period_months: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    fontSize: '13px',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Harga Langganan (IDR):
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  required
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    fontSize: '13px',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
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
                  {submitting ? 'Menyimpan...' : 'Simpan Paket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
