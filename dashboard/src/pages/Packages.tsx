import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit2,
  Trash2,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Table,
  Button,
  Badge,
  FormInput,
  getStandardMenuItems,
  Modal,
  type Column,
} from '../components';
import {
  type PackageItem,
  fetchPackages,
  deletePackage,
  getStoredUser,
} from '../services/api';

export const PackagesPage: React.FC = () => {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deletingPackage, setDeletingPackage] = useState<PackageItem | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const currentUser = getStoredUser();
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPackages(statusFilter || undefined);
      setPackages(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat paket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setStatusFilter(e.target.value);
  };

  const handleOpenAddModal = () => {
    navigate('/packages/new');
  };

  const handleOpenEditModal = (pkg: PackageItem) => {
    navigate(`/packages/${pkg.id}/edit`);
  };

  const handleOpenDeleteModal = (pkg: PackageItem) => {
    setDeletingPackage(pkg);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPackage) return;
    try {
      setSubmitting(true);
      await deletePackage(deletingPackage.id);
      setIsDeleteModalOpen(false);
      setDeletingPackage(null);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus paket');
    } finally {
      setSubmitting(false);
    }
  };

  const menuItems = getStandardMenuItems('packages');

  const columns: Column<PackageItem>[] = [
    {
      key: 'id',
      label: 'ID',
      render: (row) => <span style={{ fontWeight: 500, color: 'var(--db-text-muted)' }}>#{row.id}</span>,
    },
    {
      key: 'name',
      label: 'Nama Paket',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>{row.name}</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--db-text-muted)',
              marginTop: '4px',
            }}
          >
            <Calendar size={13} />
            <span>
              {row.departure_date
                ? new Date(row.departure_date).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Fleksibel'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      label: 'Harga Mulai',
      render: (row) => (
        <span style={{ fontWeight: 500, color: 'var(--db-accent-teal)' }}>
          {row.price
            ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(row.price)
            : '-'}
        </span>
      ),
    },
    {
      key: 'commission_amount',
      label: 'Komisi',
      render: (row) => (
        <span style={{ fontWeight: 500, color: 'var(--db-text-primary)' }}>
          {row.commission_amount && row.commission_amount > 0
            ? new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                maximumFractionDigits: 0,
              }).format(row.commission_amount)
            : '-'}
        </span>
      ),
    },
    {
      key: 'quota',
      label: 'Sisa Kuota',
      render: (row) => (
        <span>
          {row.quota !== null && row.quota !== undefined ? `${row.quota} Kursi` : '-'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => {
        if (row.status === 'published') {
          return <Badge variant="positive" showArrow={false}>Published</Badge>;
        }
        if (row.status === 'draft') {
          return <Badge variant="neutral" showArrow={false}>Draft</Badge>;
        }
        return <Badge variant="negative" showArrow={false}>Archived</Badge>;
      },
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
    <div className="db-main-layout">
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={menuItems}
        footerContent="KlikUmroh.id 1.0"
      />

      <div className="db-content-area">
        <Topbar
          userName={currentUser?.name || 'Administrator'}
          userRole="Administrator"
          userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
        />

        <main className="db-page-container" style={{ maxWidth: '1400px' }}>
          <PageHeader
            title="Katalog Paket Umroh"
            subtitle="Daftar paket umroh aktif, draft, dan arsip untuk website travel Anda"
            actions={
              <Button variant="primary" size="md" onClick={handleOpenAddModal}>
                <Plus size={16} />
                <span>Tambah Paket Baru</span>
              </Button>
            }
          />

          {error && (
            <div className="db-alert db-alert--error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <Table
            columns={columns}
            data={packages}
            loading={loading}
            emptyMessage="Belum ada paket umroh terdaftar untuk tenant ini"
            searchPlaceholder="Cari nama paket umroh..."
            searchKeys={['name', 'description', 'id']}
            filterSlot={
              <FormInput
                type="select"
                value={statusFilter}
                onChange={handleFilterChange}
                options={[
                  { value: '', label: 'Semua Status' },
                  { value: 'published', label: 'Published' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'archived', label: 'Archived' },
                ]}
              />
            }
          />
        </main>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Konfirmasi Hapus Paket"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', width: '100%' }}>
            <Button variant="secondary" size="md" onClick={() => setIsDeleteModalOpen(false)} disabled={submitting}>
              Batal
            </Button>
            <Button variant="primary" size="md" onClick={handleDeleteConfirm} disabled={submitting}>
              {submitting ? 'Menghapus...' : 'Ya, Hapus Paket'}
            </Button>
          </div>
        }
      >
        <p style={{ color: 'var(--db-text-primary)', fontSize: '14px', lineHeight: '1.6' }}>
          Apakah Anda yakin ingin menghapus paket <strong>{deletingPackage?.name}</strong>?
          Tindakan ini tidak dapat dibatalkan.
        </p>
      </Modal>
    </div>
  );
};
