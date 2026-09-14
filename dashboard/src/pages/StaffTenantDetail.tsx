import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Globe,
  Calendar,
  Package,
  Users,
  UserCheck,
  KeyRound,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Eye,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import {
  StaffLayout,
  PageHeader,
  Card,
  Table,
  Badge,
  Button,
  Modal,
  type Column,
} from '../components';
import {
  fetchStaffTenantDetail,
  fetchStaffPaymentVerifications,
  resetTenantAdminPassword,
  type StaffTenantDetail,
  type StaffTenantAdminItem,
  type PaymentVerificationItem,
} from '../services/staffApi';
import { API_BASE } from '../services/api';

export const StaffTenantDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenantId = Number(id);

  const [tenant, setTenant] = useState<StaffTenantDetail | null>(null);
  const [verifications, setVerifications] = useState<PaymentVerificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Reset Password Modal State
  const [selectedAdmin, setSelectedAdmin] = useState<StaffTenantAdminItem | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isConfirmStep, setIsConfirmStep] = useState<boolean>(false);
  const [resettingPassword, setResettingPassword] = useState<boolean>(false);

  // Proof Image Preview Modal
  const [previewImageURL, setPreviewImageURL] = useState<string | null>(null);

  const loadData = async () => {
    if (!tenantId || isNaN(tenantId)) {
      setError('ID tenant tidak valid');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [tenantData, pvsData] = await Promise.all([
        fetchStaffTenantDetail(tenantId),
        fetchStaffPaymentVerifications(undefined, tenantId),
      ]);
      setTenant(tenantData);
      setVerifications(pvsData);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat detail tenant');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId]);

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

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val);
  };

  const cleanWa = (num?: string | null) => {
    if (!num) return '';
    let digits = num.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = '62' + digits.slice(1);
    }
    return digits;
  };

  const isExpired = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const exp = new Date(dateStr).getTime();
    return !isNaN(exp) && exp < Date.now();
  };

  const renderPlanName = () => {
    if (!tenant) return 'Belum Ada Plan Aktif';
    if (typeof tenant.current_plan === 'string' && tenant.current_plan) {
      return tenant.current_plan;
    }
    if (tenant.current_plan_name) {
      return tenant.current_plan_name;
    }
    if (tenant.current_plan && typeof tenant.current_plan === 'object' && tenant.current_plan.name) {
      return `${tenant.current_plan.name} (${tenant.current_plan.period_months || 0} Bulan)`;
    }
    return 'Belum Ada Plan Aktif';
  };

  // Reset password modal handlers
  const handleOpenResetPassword = (admin: StaffTenantAdminItem) => {
    setSelectedAdmin(admin);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setIsConfirmStep(false);
  };

  const handleCloseResetPassword = () => {
    setSelectedAdmin(null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setIsConfirmStep(false);
  };

  const handleProceedToConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError('Kata sandi baru minimal 8 karakter');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi tidak cocok');
      return;
    }

    setIsConfirmStep(true);
  };

  const handleExecuteResetPassword = async () => {
    if (!selectedAdmin || !tenant) return;

    try {
      setResettingPassword(true);
      setPasswordError(null);
      await resetTenantAdminPassword(tenant.id, selectedAdmin.id, newPassword);
      setActionSuccess(`Kata sandi akun ${selectedAdmin.email} berhasil diubah.`);
      setTimeout(() => setActionSuccess(null), 5000);
      handleCloseResetPassword();
    } catch (err: any) {
      setPasswordError(err.message || 'Gagal mengubah kata sandi');
    } finally {
      setResettingPassword(false);
    }
  };

  // Table columns: Payment Verifications
  const verificationColumns: Column<PaymentVerificationItem>[] = [
    {
      key: 'id',
      label: 'ID',
      render: (item) => (
        <span style={{ fontWeight: 500, color: 'var(--db-text-muted)' }}>
          #{item.id}
        </span>
      ),
    },
    {
      key: 'plan',
      label: 'Paket Langganan',
      render: (item) => (
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
      key: 'amount',
      label: 'Total Bayar',
      render: (item) => (
        <div>
          <strong style={{ color: 'var(--db-text-primary)', display: 'block' }}>
            {formatIDR(item.final_amount)}
          </strong>
          {item.coupon_code && (
            <div style={{ marginTop: '2px' }}>
              <Badge variant="neutral" showArrow={false}>
                {item.coupon_code}
              </Badge>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'proof',
      label: 'Bukti Transfer',
      render: (item) => {
        if (!item.proof_url) {
          return <span style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>Tanpa Bukti</span>;
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
      render: (item) => {
        if (item.status === 'pending') {
          return <Badge variant="neutral" showArrow={false}>Menunggu Review</Badge>;
        }
        if (item.status === 'approved') {
          return <Badge variant="positive" showArrow={false}>Disetujui</Badge>;
        }
        if (item.status === 'rejected') {
          return <Badge variant="negative" showArrow={false}>Ditolak</Badge>;
        }
        return <Badge variant="neutral" showArrow={false}>{item.status}</Badge>;
      },
    },
    {
      key: 'created_at',
      label: 'Tanggal Diajukan',
      render: (item) => (
        <span style={{ fontSize: '13px', color: 'var(--db-text-muted)' }}>
          {formatDate(item.created_at)}
        </span>
      ),
    },
  ];

  // Table columns: Admin Users
  const adminColumns: Column<StaffTenantAdminItem>[] = [
    {
      key: 'id',
      label: 'ID',
      render: (u) => (
        <span style={{ fontWeight: 500, color: 'var(--db-text-muted)' }}>
          #{u.id}
        </span>
      ),
    },
    {
      key: 'name',
      label: 'Nama Admin',
      render: (u) => (
        <span style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>
          {u.name}
        </span>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      render: (u) => (
        <span style={{ color: 'var(--db-text-secondary)', fontSize: '13px' }}>
          {u.email}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status Akun',
      render: (u) => {
        if (u.status === 'active') {
          return <Badge variant="positive" showArrow={false}>Aktif</Badge>;
        }
        return <Badge variant="negative" showArrow={false}>{u.status}</Badge>;
      },
    },
    {
      key: 'created_at',
      label: 'Terdaftar',
      render: (u) => (
        <span style={{ fontSize: '13px', color: 'var(--db-text-muted)' }}>
          {formatDate(u.created_at)}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Aksi',
      render: (u) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleOpenResetPassword(u)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <KeyRound size={14} />
          <span>Reset Password</span>
        </Button>
      ),
    },
  ];

  return (
    <StaffLayout title={tenant ? `${tenant.name} — Detail Tenant` : 'Detail Tenant'}>
      <PageHeader
        title={tenant ? tenant.name : 'Detail Tenant'}
        subtitle="Informasi langganan, statistik penggunaan, dan kontrol akun travel mitra KlikUmroh.id"
        backButton={
          <Button variant="secondary" size="sm" onClick={() => navigate('/internal/tenants')}>
            <ArrowLeft size={16} />
            <span>Kembali ke Daftar Tenant</span>
          </Button>
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {tenant?.whatsapp_number && (
              <a
                href={`https://wa.me/${cleanWa(tenant.whatsapp_number)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <Button variant="secondary" size="md">
                  <MessageCircle size={14} style={{ color: 'var(--db-positive)' }} />
                  <span>WhatsApp Travel</span>
                </Button>
              </a>
            )}
            {tenant && (
              <a
                href={tenant.domain.custom_domain ? `https://${tenant.domain.custom_domain}` : `http://${tenant.domain.subdomain}:3000`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <Button variant="secondary" size="md">
                  <ExternalLink size={14} />
                  <span>Kunjungi Web</span>
                </Button>
              </a>
            )}
            <Button variant="secondary" size="md" onClick={loadData} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'db-spin' : ''} />
              <span>Segarkan</span>
            </Button>
          </div>
        }
      />

      {error && (
        <div className="db-alert db-alert--error" style={{ marginBottom: '20px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="db-alert db-alert--success" style={{ marginBottom: '20px' }}>
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {loading && !tenant ? (
        <Card>
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--db-text-muted)' }}>
            <RefreshCw size={24} className="db-spin" style={{ margin: '0 auto 12px' }} />
            <p>Memuat data tenant...</p>
          </div>
        </Card>
      ) : tenant ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* BAGIAN 1: INFO DASAR + DOMAIN */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            <Card title="Informasi Dasar & Kontak Travel">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Nama Travel</span>
                  <span style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>{tenant.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>ID Tenant</span>
                  <span style={{ fontWeight: 500, color: 'var(--db-text-primary)' }}>#{tenant.id}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Status Tenant</span>
                  <div>
                    {tenant.status === 'active' && <Badge variant="positive" showArrow={false}>Aktif</Badge>}
                    {tenant.status === 'trial' && <Badge variant="neutral" showArrow={false}>Masa Percobaan</Badge>}
                    {tenant.status === 'suspended' && <Badge variant="negative" showArrow={false}>Ditangguhkan</Badge>}
                    {tenant.status === 'churned' && <Badge variant="negative" showArrow={false}>Berhenti</Badge>}
                    {!['active', 'trial', 'suspended', 'churned'].includes(tenant.status) && (
                      <Badge variant="neutral" showArrow={false}>{tenant.status}</Badge>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Nomor WhatsApp</span>
                  {tenant.whatsapp_number ? (
                    <a
                      href={`https://wa.me/${cleanWa(tenant.whatsapp_number)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: 'var(--db-positive)',
                        fontWeight: 600,
                        fontSize: '13px',
                        textDecoration: 'none',
                      }}
                    >
                      <MessageCircle size={14} />
                      <span>{tenant.whatsapp_number}</span>
                    </a>
                  ) : (
                    <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>-</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Email Kontak / PIC</span>
                  <span style={{ color: 'var(--db-text-primary)', fontSize: '13px' }}>
                    {tenant.email || (tenant.daftar_admin && tenant.daftar_admin[0] ? tenant.daftar_admin[0].email : '-')}
                  </span>
                </div>
                {tenant.ppiu_number && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>No. Izin PPIU</span>
                    <span style={{ fontWeight: 500, color: 'var(--db-text-primary)', fontSize: '13px' }}>
                      {tenant.ppiu_number}
                    </span>
                  </div>
                )}
                {(tenant.address || tenant.city || tenant.province) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Alamat Kantor</span>
                    <span style={{ color: 'var(--db-text-primary)', fontSize: '13px', textAlign: 'right', maxWidth: '60%' }}>
                      {[tenant.address, tenant.city, tenant.province].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Tanggal Registrasi</span>
                  <span style={{ color: 'var(--db-text-primary)', fontSize: '13px' }}>
                    {formatDate(tenant.created_at)}
                  </span>
                </div>
              </div>
            </Card>

            <Card title="Pengaturan Domain & Akses Web">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Subdomain Default</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>
                      {tenant.domain.subdomain}
                    </span>
                    <a
                      href={`http://${tenant.domain.subdomain}:3000`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Buka Website Travel"
                      style={{ color: 'var(--db-text-secondary)', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Domain Kustom</span>
                  <div>
                    {tenant.domain.custom_domain ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Globe size={14} style={{ color: 'var(--db-text-muted)' }} />
                        <span style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>
                          {tenant.domain.custom_domain}
                        </span>
                        <a
                          href={`https://${tenant.domain.custom_domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Buka Domain Kustom"
                          style={{ color: 'var(--db-text-secondary)', display: 'inline-flex', alignItems: 'center' }}
                        >
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Belum dikonfigurasi</span>
                    )}
                  </div>
                </div>
                {tenant.domain.custom_domain && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Status Domain Kustom</span>
                    <div>
                      {tenant.domain.custom_domain_status === 'verified' && (
                        <Badge variant="positive" showArrow={false}>Terverifikasi</Badge>
                      )}
                      {tenant.domain.custom_domain_status === 'pending' && (
                        <Badge variant="neutral" showArrow={false}>Menunggu Verifikasi</Badge>
                      )}
                      {tenant.domain.custom_domain_status === 'failed' && (
                        <Badge variant="negative" showArrow={false}>Gagal Verifikasi</Badge>
                      )}
                      {!['verified', 'pending', 'failed'].includes(tenant.domain.custom_domain_status || '') && (
                        <Badge variant="neutral" showArrow={false}>
                          {tenant.domain.custom_domain_status || 'Tidak Diketahui'}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Skema Komisi Agen</span>
                  <span style={{ fontWeight: 500, color: 'var(--db-text-primary)', fontSize: '13px' }}>
                    {tenant.commission_scheme === 'percentage' ? 'Persentase' : 'Nominal Tetap (Flat)'}
                  </span>
                </div>
                {tenant.brand_primary_color && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Warna Brand</span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          backgroundColor: tenant.brand_primary_color,
                          display: 'inline-block',
                          border: '1px solid var(--db-border)',
                        }}
                      />
                      <span style={{ fontSize: '13px', color: 'var(--db-text-primary)' }}>
                        {tenant.brand_primary_color}
                      </span>
                    </div>
                  </div>
                )}
                {tenant.tagline && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--db-text-muted)', fontSize: '13px' }}>Tagline</span>
                    <span style={{ fontSize: '13px', color: 'var(--db-text-primary)', fontStyle: 'italic', textAlign: 'right', maxWidth: '60%' }}>
                      "{tenant.tagline}"
                    </span>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* BAGIAN 2: RINGKASAN PENGGUNAAN (3 ANGKA) */}
          <div>
            <div style={{ marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--db-text-primary)', margin: 0 }}>
                Ringkasan Penggunaan
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--db-text-muted)', marginTop: '4px', margin: 0 }}>
                Metrik volume paket, prospek jamaah, dan agen aktif pada tenant ini.
              </p>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
              }}
            >
              {/* Stat Card 1: Total Paket */}
              <div
                style={{
                  padding: '20px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--db-border)',
                  backgroundColor: 'var(--db-card-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--db-page-bg)',
                    color: 'var(--db-text-primary)',
                    display: 'flex',
                  }}
                >
                  <Package size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block', marginBottom: '4px' }}>
                    Total Paket
                  </span>
                  <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--db-text-primary)', display: 'block', lineHeight: 1 }}>
                    {tenant.total_packages ?? tenant.ringkasan_penggunaan?.total_packages ?? tenant.usage?.total_packages ?? 0}
                  </span>
                </div>
              </div>

              {/* Stat Card 2: Total Prospek */}
              <div
                style={{
                  padding: '20px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--db-border)',
                  backgroundColor: 'var(--db-card-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--db-page-bg)',
                    color: 'var(--db-text-primary)',
                    display: 'flex',
                  }}
                >
                  <Users size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block', marginBottom: '4px' }}>
                    Total Prospek
                  </span>
                  <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--db-text-primary)', display: 'block', lineHeight: 1 }}>
                    {tenant.total_prospects ?? tenant.ringkasan_penggunaan?.total_prospects ?? tenant.usage?.total_prospects ?? 0}
                  </span>
                </div>
              </div>

              {/* Stat Card 3: Total Agen Aktif */}
              <div
                style={{
                  padding: '20px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--db-border)',
                  backgroundColor: 'var(--db-card-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--db-page-bg)',
                    color: 'var(--db-text-primary)',
                    display: 'flex',
                  }}
                >
                  <UserCheck size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block', marginBottom: '4px' }}>
                    Total Agen Aktif
                  </span>
                  <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--db-text-primary)', display: 'block', lineHeight: 1 }}>
                    {tenant.total_active_agents ?? tenant.ringkasan_penggunaan?.total_active_agents ?? tenant.usage?.total_active_agents ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* BAGIAN 3: PLAN & LANGGANAN */}
          <Card
            title="Plan & Riwayat Langganan"
            subtitle="Informasi paket aktif saat ini dan riwayat verifikasi pembayaran perpanjangan tenant ini."
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--db-page-bg)',
                border: '1px solid var(--db-border)',
              }}
            >
              <div>
                <span style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block', marginBottom: '4px' }}>
                  Plan Aktif
                </span>
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                  {renderPlanName()}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--db-text-muted)', display: 'block', marginBottom: '4px' }}>
                  Masa Berlaku Hingga
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} style={{ color: 'var(--db-text-muted)' }} />
                  <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--db-text-primary)' }}>
                    {formatDate(tenant.subscription_expires_at)}
                  </span>
                  {tenant.subscription_expires_at && isExpired(tenant.subscription_expires_at) && (
                    <Badge variant="negative" showArrow={false}>Kedaluwarsa</Badge>
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--db-text-primary)', marginBottom: '12px' }}>
                Riwayat Pembayaran Perpanjangan
              </h4>
              <Table
                columns={verificationColumns}
                data={verifications}
                paginated={false}
                searchable={false}
                emptyMessage="Belum ada riwayat pembayaran perpanjangan untuk tenant ini"
              />
            </div>
          </Card>

          {/* BAGIAN 4: DAFTAR USER ADMIN */}
          <Card
            title="Daftar Pengguna Admin Travel"
            subtitle="Daftar akun pengelola dashboard travel ini beserta kontrol keamanan akun."
          >
            <Table
              columns={adminColumns}
              data={tenant.daftar_admin}
              paginated={false}
              searchable={false}
              emptyMessage="Belum ada data admin terdaftar untuk tenant ini"
            />
          </Card>
        </div>
      ) : null}

      {/* MODAL 1: RESET PASSWORD ADMIN USER */}
      <Modal
        isOpen={Boolean(selectedAdmin)}
        onClose={handleCloseResetPassword}
        title="Reset Kata Sandi Admin Travel"
      >
        {selectedAdmin && (
          <div>
            {passwordError && (
              <div className="db-alert db-alert--error" style={{ marginBottom: '16px' }}>
                <AlertCircle size={16} />
                <span>{passwordError}</span>
              </div>
            )}

            {!isConfirmStep ? (
              <form onSubmit={handleProceedToConfirmation}>
                <div
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--db-page-bg)',
                    border: '1px solid var(--db-border)',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ fontSize: '13px', color: 'var(--db-text-muted)' }}>Target Akun:</div>
                  <div style={{ fontWeight: 600, color: 'var(--db-text-primary)', fontSize: '14px', marginTop: '2px' }}>
                    {selectedAdmin.name} ({selectedAdmin.email})
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginTop: '2px' }}>
                    Travel: {tenant?.name}
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label
                    htmlFor="staff-new-password"
                    style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--db-text-primary)', marginBottom: '6px' }}
                  >
                    Kata Sandi Baru (Minimal 8 Karakter)
                  </label>
                  <input
                    id="staff-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Masukkan kata sandi baru"
                    required
                    minLength={8}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--db-border)',
                      backgroundColor: 'var(--db-card-bg)',
                      color: 'var(--db-text-primary)',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label
                    htmlFor="staff-confirm-password"
                    style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--db-text-primary)', marginBottom: '6px' }}
                  >
                    Konfirmasi Kata Sandi Baru
                  </label>
                  <input
                    id="staff-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    required
                    minLength={8}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--db-border)',
                      backgroundColor: 'var(--db-card-bg)',
                      color: 'var(--db-text-primary)',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <Button variant="secondary" size="md" type="button" onClick={handleCloseResetPassword}>
                    <span>Batal</span>
                  </Button>
                  <Button variant="primary" size="md" type="submit">
                    <KeyRound size={16} />
                    <span>Lanjut ke Konfirmasi</span>
                  </Button>
                </div>
              </form>
            ) : (
              <div>
                <div
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--db-page-bg)',
                    border: '1px solid var(--db-negative)',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <ShieldAlert size={24} style={{ color: 'var(--db-negative)', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--db-negative)' }}>
                        Konfirmasi Tindakan Sensitif
                      </h4>
                      <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--db-text-primary)', lineHeight: 1.5 }}>
                        Anda akan mereset kata sandi akun <strong>{selectedAdmin.email}</strong> milik travel <strong>{tenant?.name}</strong>.
                        Setelah direset, pemilik akun tidak dapat login dengan kata sandi lama dan harus menggunakan kata sandi baru ini.
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <Button
                    variant="secondary"
                    size="md"
                    type="button"
                    onClick={() => setIsConfirmStep(false)}
                    disabled={resettingPassword}
                  >
                    <span>Kembali Edit</span>
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    type="button"
                    onClick={handleExecuteResetPassword}
                    disabled={resettingPassword}
                  >
                    <ShieldCheck size={16} />
                    <span>{resettingPassword ? 'Memproses...' : 'Ya, Reset Password Sekarang'}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL 2: PREVIEW BUKTI TRANSFER */}
      <Modal
        isOpen={Boolean(previewImageURL)}
        onClose={() => setPreviewImageURL(null)}
        title="Bukti Transfer Pembayaran"
      >
        {previewImageURL && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={previewImageURL}
              alt="Bukti Transfer"
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--db-border)',
              }}
            />
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
              <Button variant="secondary" size="sm" onClick={() => setPreviewImageURL(null)}>
                <span>Tutup</span>
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </StaffLayout>
  );
};
