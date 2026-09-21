import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Users,
  ShieldCheck,
  UserX,
  Lock,
  Mail,
  User,
} from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import { AdminDataGrid, type AdminColumn } from '../components/AdminDataGrid';
import {
  fetchStaffUsers,
  createStaffUser,
  updateStaffUser,
  getStoredStaffUser,
  getStoredStaffToken,
  setStaffAuthSession,
  type StaffUser,
  type StaffUserInput,
} from '../../../services/staffApi';

export const AdminStaffView: React.FC = () => {
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<StaffUser | null>(() => getStoredStaffUser());

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [formData, setFormData] = useState<StaffUserInput>({
    name: '',
    email: '',
    password: '',
    status: 'active',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStaffUsers();
      setStaffList(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data staf');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const handleOpenCreate = () => {
    setEditingStaff(null);
    setFormData({ name: '', email: '', password: '', status: 'active' });
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (staff: StaffUser) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name,
      email: staff.email,
      password: '',
      status: staff.status,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleToggleStatus = async (staff: StaffUser) => {
    const isSelf = currentUser && currentUser.id === staff.id;
    if (isSelf && staff.status === 'active') {
      alert('Anda tidak dapat menonaktifkan akun sendiri yang sedang aktif.');
      return;
    }

    const nextStatus = staff.status === 'active' ? 'inactive' : 'active';
    const actionLabel = nextStatus === 'active' ? 'mengaktifkan' : 'menonaktifkan';

    if (!window.confirm(`Yakin ingin ${actionLabel} akun staf ${staff.name}?`)) {
      return;
    }

    try {
      setLoading(true);
      await updateStaffUser(staff.id, {
        name: staff.name,
        email: staff.email,
        status: nextStatus,
      });
      setSuccessMessage(`Status staf ${staff.name} berhasil diubah menjadi ${nextStatus === 'active' ? 'Aktif' : 'Nonaktif'}`);
      await loadData();
    } catch (err: any) {
      alert('Gagal mengubah status staf: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim();
    const pwd = formData.password?.trim();

    if (!trimmedName) {
      setFormError('Nama lengkap wajib diisi');
      return;
    }
    if (!trimmedEmail) {
      setFormError('Email staf wajib diisi');
      return;
    }

    if (!editingStaff) {
      if (!pwd || pwd.length < 8) {
        setFormError('Kata sandi wajib diisi minimal 8 karakter');
        return;
      }
    } else {
      if (pwd && pwd.length < 8) {
        setFormError('Kata sandi baru minimal 8 karakter');
        return;
      }
    }

    // Safety guard
    if (editingStaff && currentUser && currentUser.id === editingStaff.id && formData.status === 'inactive') {
      setFormError('Anda tidak dapat menonaktifkan akun sendiri yang sedang aktif');
      return;
    }

    try {
      setSubmitting(true);
      if (editingStaff) {
        const updated = await updateStaffUser(editingStaff.id, {
          name: trimmedName,
          email: trimmedEmail,
          password: pwd || undefined,
          status: formData.status,
        });
        setSuccessMessage('Data staf berhasil diperbarui');

        // Jika mengedit akun sendiri, update session aktif
        if (currentUser && currentUser.id === editingStaff.id && updated) {
          const currentToken = getStoredStaffToken();
          if (currentToken) {
            setStaffAuthSession(currentToken, updated);
            setCurrentUser(updated);
          }
        }
      } else {
        await createStaffUser({
          name: trimmedName,
          email: trimmedEmail,
          password: pwd!,
          status: formData.status,
        });
        setSuccessMessage('Akun staf baru berhasil ditambahkan');
      }
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Terjadi kesalahan saat menyimpan data staf');
    } finally {
      setSubmitting(false);
    }
  };

  // KPI Metrics
  const totalStaff = staffList.length;
  const activeStaff = staffList.filter((s) => s.status === 'active').length;
  const inactiveStaff = staffList.filter((s) => s.status === 'inactive').length;

  const columns: AdminColumn<StaffUser>[] = [
    {
      key: 'name',
      label: 'Nama & Email Staf',
      render: (row) => {
        const initials = row.name
          ? row.name
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()
          : 'ST';
        const isSelf = currentUser && currentUser.id === row.id;

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--sa-radius-sm)',
                backgroundColor: 'var(--sa-bg)',
                border: '1px solid var(--sa-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '11.5px',
                color: 'var(--sa-text)',
                fontFamily: 'var(--sa-font-code)',
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 600, color: 'var(--sa-text)', fontSize: '13.5px' }}>
                  {row.name}
                </span>
                {isSelf && (
                  <span
                    className="sa-pill sa-pill--neutral"
                    style={{ fontSize: '10.5px', padding: '1px 6px', fontWeight: 600 }}
                  >
                    Anda
                  </span>
                )}
              </div>
              <span style={{ color: 'var(--sa-text-muted)', fontSize: '12px', fontFamily: 'var(--sa-font-code)' }}>
                {row.email}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status Akun',
      render: (row) =>
        row.status === 'active' ? (
          <span className="sa-pill sa-pill--green">
            <span className="sa-status-dot" style={{ backgroundColor: 'var(--sa-green)' }} />
            <span>Aktif</span>
          </span>
        ) : (
          <span className="sa-pill sa-pill--neutral">
            <span className="sa-status-dot" style={{ backgroundColor: 'var(--sa-text-subtle)' }} />
            <span>Nonaktif</span>
          </span>
        ),
    },
    {
      key: 'created_at',
      label: 'Terdaftar Sejak',
      render: (row) => (
        <span style={{ fontSize: '12.5px', color: 'var(--sa-text-muted)' }}>
          {formatDate(row.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Aksi',
      align: 'right',
      render: (row) => {
        const isSelf = currentUser && currentUser.id === row.id;

        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="sa-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenEdit(row);
              }}
              title="Ubah data staf atau reset password"
            >
              <Edit2 size={12} />
              <span>Edit</span>
            </button>

            <button
              type="button"
              className="sa-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleStatus(row);
              }}
              disabled={Boolean(isSelf && row.status === 'active')}
              title={
                isSelf && row.status === 'active'
                  ? 'Anda tidak dapat menonaktifkan akun sendiri'
                  : row.status === 'active'
                  ? 'Nonaktifkan akun staf'
                  : 'Aktifkan akun staf'
              }
              style={{
                color:
                  row.status === 'active' ? 'var(--sa-text-muted)' : 'var(--sa-green)',
                opacity: isSelf && row.status === 'active' ? 0.5 : 1,
              }}
            >
              {row.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <AdminLayout
      title="Manajemen Staf HQ"
      subtitle="Kelola pengguna staf internal platform KlikUmroh dan kendali status akses"
      tooltipText="Halaman ini digunakan untuk mengelola akun staf internal platform KlikUmroh. Staf yang berstatus aktif dapat masuk ke portal Super Admin untuk menjalankan operasional platform."
      headerActions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="sa-action-btn"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'db-spin' : ''} />
            <span>Segarkan</span>
          </button>
          <button
            type="button"
            className="sa-action-btn sa-action-btn--primary"
            onClick={handleOpenCreate}
          >
            <Plus size={13} />
            <span>Tambah Staf</span>
          </button>
        </div>
      }
    >
      {/* Alert Messages */}
      {successMessage && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--sa-green-bg)',
            border: '1px solid var(--sa-green-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--sa-green-text)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <CheckCircle2 size={15} />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--sa-red-bg)',
            border: '1px solid var(--sa-red-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--sa-red-text)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* EXECUTIVE SIGNAL METRIC RIBBON */}
      <div className="sa-metric-ribbon">
        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">
            <span>Total Staf Terdaftar</span>
            <Users size={14} style={{ color: 'var(--sa-text-muted)' }} />
          </span>
          <div className="sa-metric-cell__val">{totalStaff}</div>
          <span className="sa-metric-cell__sub">Seluruh pengguna platform HQ</span>
        </div>

        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">
            <span>Staf Aktif</span>
            <ShieldCheck size={14} style={{ color: 'var(--sa-green)' }} />
          </span>
          <div className="sa-metric-cell__val" style={{ color: 'var(--sa-green-text)' }}>
            {activeStaff}
          </div>
          <span className="sa-metric-cell__sub">Memiliki akses ke portal internal</span>
        </div>

        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">
            <span>Staf Nonaktif</span>
            <UserX size={14} style={{ color: 'var(--sa-text-subtle)' }} />
          </span>
          <div className="sa-metric-cell__val" style={{ color: 'var(--sa-text-muted)' }}>
            {inactiveStaff}
          </div>
          <span className="sa-metric-cell__sub">Akses login ditangguhkan</span>
        </div>
      </div>

      {/* Integrated Data Grid */}
      <AdminDataGrid
        title="Daftar Pengguna Staf"
        data={staffList}
        columns={columns}
        loading={loading}
        emptyMessage="Belum ada data pengguna staf tambahan."
      />

      {/* Modal Tambah / Edit Staf */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => !submitting && setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--sa-card)',
              borderRadius: 'var(--sa-radius-sm)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              width: '100%',
              maxWidth: '440px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '22px 20px',
              border: '1px solid var(--sa-border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: 'var(--sa-text)' }}>
              {editingStaff ? 'Edit Pengguna Staf' : 'Tambah Staf Baru'}
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: '13px', color: 'var(--sa-text-muted)' }}>
              {editingStaff
                ? 'Perbarui identitas akun atau setel ulang kata sandi staf.'
                : 'Buat akun staf baru untuk memberikan akses ke portal internal KlikUmroh.'}
            </p>

            {formError && (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--sa-red-bg)',
                  border: '1px solid var(--sa-red-border)',
                  borderRadius: 'var(--sa-radius-sm)',
                  color: 'var(--sa-red-text)',
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '16px',
                }}
              >
                <AlertCircle size={14} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: 'var(--sa-text)', marginBottom: '6px' }}>
                  <User size={13} style={{ color: 'var(--sa-text-muted)' }} />
                  <span>Nama Lengkap:</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Muhammad Rayhan"
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
                    backgroundColor: 'var(--sa-card)',
                    color: 'var(--sa-text)',
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: 'var(--sa-text)', marginBottom: '6px' }}>
                  <Mail size={13} style={{ color: 'var(--sa-text-muted)' }} />
                  <span>Email Login:</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="nama@klikumroh.id"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    fontSize: '13px',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    backgroundColor: 'var(--sa-card)',
                    color: 'var(--sa-text)',
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: 'var(--sa-text)', marginBottom: '6px' }}>
                  <Lock size={13} style={{ color: 'var(--sa-text-muted)' }} />
                  <span>Kata Sandi:</span>
                </label>
                <input
                  type="password"
                  placeholder={
                    editingStaff
                      ? 'Kosongkan jika tidak ingin mengubah kata sandi'
                      : 'Minimal 8 karakter'
                  }
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    fontSize: '13px',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    backgroundColor: 'var(--sa-card)',
                    color: 'var(--sa-text)',
                  }}
                />
                <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: 'var(--sa-text-muted)' }}>
                  {editingStaff
                    ? 'Hanya diisi jika Anda ingin menyetel ulang kata sandi pengguna ini.'
                    : 'Gunakan kombinasi huruf, angka, dan simbol untuk keamanan maksimal.'}
                </span>
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--sa-text)', marginBottom: '6px' }}>
                  Status Akun:
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  disabled={Boolean(editingStaff && currentUser && currentUser.id === editingStaff.id)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 10px',
                    fontSize: '13px',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-sm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    backgroundColor: 'var(--sa-card)',
                    color: 'var(--sa-text)',
                  }}
                >
                  <option value="active">Aktif (Dapat Login)</option>
                  <option value="inactive">Nonaktif (Akses Ditangguhkan)</option>
                </select>
                {editingStaff && currentUser && currentUser.id === editingStaff.id && (
                  <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: 'var(--sa-text-muted)' }}>
                    Akun yang sedang Anda gunakan tidak dapat diubah statusnya menjadi nonaktif.
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="sa-action-btn"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  <span>Batal</span>
                </button>
                <button
                  type="submit"
                  className="sa-action-btn sa-action-btn--primary"
                  disabled={submitting}
                >
                  <span>{submitting ? 'Menyimpan...' : editingStaff ? 'Perbarui Staf' : 'Simpan Staf'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
