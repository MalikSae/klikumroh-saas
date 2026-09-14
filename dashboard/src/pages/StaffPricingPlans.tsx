import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  StaffLayout,
  PageHeader,
  Table,
  Button,
  Modal,
  FormInput,
  type Column,
} from '../components';
import {
  fetchPricingPlans,
  createPricingPlan,
  updatePricingPlan,
  deletePricingPlan,
  type PricingPlan,
  type PricingPlanInput,
} from '../services/staffApi';

export const StaffPricingPlansPage: React.FC = () => {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingPlan, setEditingPlan] = useState<PricingPlan | null>(null);
  const [formData, setFormData] = useState<PricingPlanInput>({
    name: '',
    period_months: 3,
    price: 0,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deletingPlan, setDeletingPlan] = useState<PricingPlan | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPricingPlans();
      setPlans(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar plan');
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

  const handleOpenAddModal = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      period_months: 3,
      price: 0,
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (plan: PricingPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      period_months: plan.period_months,
      price: plan.price,
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Nama plan wajib diisi');
      return;
    }
    if (formData.period_months <= 0) {
      setFormError('Durasi bulan harus lebih dari 0');
      return;
    }
    if (formData.price < 0) {
      setFormError('Harga tidak boleh negatif');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      if (editingPlan) {
        await updatePricingPlan(editingPlan.id, formData);
        setSuccessMsg(`Plan "${formData.name}" berhasil diperbarui`);
      } else {
        await createPricingPlan(formData);
        setSuccessMsg(`Plan "${formData.name}" berhasil ditambahkan`);
      }
      setIsFormModalOpen(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan plan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDeleteModal = (plan: PricingPlan) => {
    setDeletingPlan(plan);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPlan) return;
    try {
      setDeleting(true);
      setDeleteError(null);
      await deletePricingPlan(deletingPlan.id);
      setSuccessMsg(`Plan "${deletingPlan.name}" berhasil dihapus`);
      setIsDeleteModalOpen(false);
      setDeletingPlan(null);
      loadData();
    } catch (err: any) {
      setDeleteError(err.message || 'Gagal menghapus plan');
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<PricingPlan>[] = [
    {
      key: 'id',
      label: 'ID',
      render: (row) => (
        <span style={{ fontWeight: 500, color: 'var(--db-text-muted)' }}>
          #{row.id}
        </span>
      ),
    },
    {
      key: 'name',
      label: 'Nama Plan',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>
            {row.name}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginTop: '2px' }}>
            Paket Langganan Travel
          </div>
        </div>
      ),
    },
    {
      key: 'period_months',
      label: 'Durasi',
      render: (row) => (
        <span style={{ fontWeight: 500, color: 'var(--db-text-primary)' }}>
          {row.period_months} Bulan
        </span>
      ),
    },
    {
      key: 'price',
      label: 'Harga (IDR)',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>
          {formatIDR(row.price)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Aksi',
      render: (row) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleOpenEditModal(row)}
            aria-label={`Edit ${row.name}`}
          >
            <Edit2 size={14} />
            <span>Edit</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleOpenDeleteModal(row)}
            aria-label={`Hapus ${row.name}`}
          >
            <Trash2 size={14} />
            <span>Hapus</span>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <StaffLayout title="Plan Harga">
      <PageHeader
        title="Plan Harga Berlangganan"
        subtitle="Atur paket harga langganan platform SaaS KlikUmroh untuk travel partner"
        actions={
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="secondary" size="md" onClick={loadData} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'db-spin' : ''} />
              <span>Segarkan</span>
            </Button>
            <Button variant="primary" size="md" onClick={handleOpenAddModal}>
              <Plus size={16} />
              <span>Tambah Plan Baru</span>
            </Button>
          </div>
        }
      />

      {successMsg && (
        <div className="db-alert db-alert--success" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="db-alert db-alert--error" style={{ marginBottom: '20px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <Table
        columns={columns}
        data={plans}
        loading={loading}
        searchPlaceholder="Cari nama plan..."
        searchKeys={['name']}
        toolbarActions={
          <span style={{ fontSize: '13px', color: 'var(--db-text-muted)', fontWeight: 500 }}>
            Total: {plans.length} Paket Aktif
          </span>
        }
        emptyMessage="Belum ada plan harga yang terdaftar"
      />

      {/* Modal Form Tambah / Edit Plan */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => !submitting && setIsFormModalOpen(false)}
        title={editingPlan ? 'Edit Plan Harga' : 'Tambah Plan Harga Baru'}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setIsFormModalOpen(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleFormSubmit}
              disabled={submitting}
            >
              <span>{submitting ? 'Menyimpan...' : 'Simpan Plan'}</span>
            </Button>
          </div>
        }
      >
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {formError && (
            <div className="db-alert db-alert--error">
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          <FormInput
            type="text"
            label="Nama Plan"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Contoh: Paket 3 Bulan, Paket 1 Tahun"
            required
            disabled={submitting}
          />

          <FormInput
            type="number"
            label="Durasi (Bulan)"
            value={formData.period_months}
            onChange={(e) => setFormData({ ...formData, period_months: parseInt(e.target.value, 10) || 0 })}
            placeholder="3"
            required
            disabled={submitting}
            hint="Contoh: 1, 3, 6, atau 12 Bulan"
          />

          <FormInput
            type="number"
            label="Harga (IDR)"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value, 10) || 0 })}
            placeholder="1500000"
            required
            disabled={submitting}
            hint="Masukkan nilai nominal rupiah tanpa titik atau koma"
          />
        </form>
      </Modal>

      {/* Modal Konfirmasi Hapus Plan */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => !deleting && setIsDeleteModalOpen(false)}
        title="Hapus Plan Harga"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={handleDeleteConfirm}
              disabled={deleting}
              style={{ color: 'var(--db-negative)', borderColor: 'var(--db-negative)' }}
            >
              <span>{deleting ? 'Menghapus...' : 'Hapus Plan'}</span>
            </Button>
          </div>
        }
      >
        <div>
          {deleteError && (
            <div className="db-alert db-alert--error" style={{ marginBottom: '16px' }}>
              <AlertCircle size={16} />
              <span>{deleteError}</span>
            </div>
          )}

          <p style={{ margin: '0 0 8px 0', color: 'var(--db-text-primary)' }}>
            Apakah Anda yakin ingin menghapus plan <strong>{deletingPlan?.name}</strong>?
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--db-text-muted)' }}>
            Catatan: Plan yang sedang aktif digunakan oleh salah satu travel partner tidak dapat dihapus.
          </p>
        </div>
      </Modal>
    </StaffLayout>
  );
};
