import { formatDateWIB } from '../../../utils/datetime';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  RefreshCw,
  Globe,
  Key,
  LogIn,
  MessageCircle,
  CheckCircle2,
  Calendar,
  Layers,
  Users,
  Package,
} from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import { Modal, FormInput, Button } from '../shared';
import { CustomDropdown } from '../shared/CustomDropdown';
import { subscriptionStatusView } from '../shared/subscriptionStatus';
import {
  fetchStaffTenantDetail,
  fetchPricingPlans,
  updateTenantSubscription,
  resetTenantAdminPassword,
  impersonateTenant,
  type StaffTenantDetail,
  type StaffTenantAdminItem,
  type PricingPlan,
} from '../../../services/staffApi';

export const AdminTenantDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [tenant, setTenant] = useState<StaffTenantDetail | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Extend Subscription Modal
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number>(0);
  const [selectedMonths, setSelectedMonths] = useState<number>(1);
  const [extending, setExtending] = useState(false);

  // Reset Password Modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState<number>(0);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Impersonate Modal (alasan akses wajib, tercatat di riwayat akses travel)
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [impersonateReason, setImpersonateReason] = useState('');
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);

  const loadDetail = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [data, pricingData] = await Promise.all([
        fetchStaffTenantDetail(Number(id)),
        fetchPricingPlans().catch(() => []),
      ]);
      setTenant(data);
      setPlans(pricingData);
      if (pricingData.length > 0) {
        setSelectedPlanId(pricingData[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat detail travel');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  const formatDate = (dateStr?: string | null) => formatDateWIB(dateStr);

  const cleanWa = (num?: string | null) => {
    if (!num) return '';
    let digits = num.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = '62' + digits.slice(1);
    }
    return digits;
  };

  const MIN_REASON_LENGTH = 10;
  const trimmedReason = impersonateReason.trim();

  const openImpersonateModal = () => {
    setImpersonateReason('');
    setImpersonateError(null);
    setShowImpersonateModal(true);
  };

  const handleImpersonateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    if (trimmedReason.length < MIN_REASON_LENGTH) {
      setImpersonateError(`Alasan akses minimal ${MIN_REASON_LENGTH} karakter`);
      return;
    }

    try {
      setImpersonating(true);
      setImpersonateError(null);
      const res = await impersonateTenant(tenant.id, trimmedReason);
      setShowImpersonateModal(false);
      // Only a one-time code goes in the URL (fragment, never sent to a server); the new tab trades it
      // for the impersonation session, and only this browser can (main.tsx).
      const handoff = encodeURIComponent(JSON.stringify({ code: res.handoff_code, redirect: '/' }));
      window.open(`/#handoff=${handoff}`, '_blank');
    } catch (err: any) {
      setImpersonateError(err.message || 'Gagal impersonasi travel');
    } finally {
      setImpersonating(false);
    }
  };

  const openExtendModal = () => {
    if (!tenant) return;
    const currentPlanId = typeof tenant.current_plan === 'object' && tenant.current_plan?.id
      ? tenant.current_plan.id
      : undefined;
    const initialPlan = (currentPlanId ? plans.find((p) => p.id === currentPlanId) : null) ||
      plans.find((p) => p.name === tenant.current_plan_name) ||
      plans[0];
    if (initialPlan) {
      setSelectedPlanId(initialPlan.id);
      setSelectedMonths(initialPlan.period_months);
    }
    setShowExtendModal(true);
  };

  const handlePlanChange = (planId: number) => {
    setSelectedPlanId(planId);
    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      setSelectedMonths(plan.period_months);
    }
  };

  const calculateNewExpiry = () => {
    const now = new Date();
    let baseDate = now;
    let isCurrentlyActive = false;

    if (tenant?.subscription_expires_at) {
      const exp = new Date(tenant.subscription_expires_at);
      if (exp.getTime() > now.getTime()) {
        baseDate = exp;
        isCurrentlyActive = true;
      }
    }

    const newDate = new Date(baseDate);
    newDate.setMonth(newDate.getMonth() + selectedMonths);
    return { newDate, isCurrentlyActive, baseDate };
  };

  const handleExtendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    try {
      setExtending(true);
      await updateTenantSubscription(tenant.id, selectedPlanId, selectedMonths);
      setShowExtendModal(false);
      setActionSuccess('Langganan travel mitra berhasil diperpanjang');
      loadDetail();
    } catch (err: any) {
      alert('Gagal memperpanjang langganan: ' + err.message);
    } finally {
      setExtending(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !selectedAdminId) return;
    if (newPassword.length < 8) {
      alert('Password baru minimal 8 karakter');
      return;
    }
    try {
      setResetting(true);
      await resetTenantAdminPassword(tenant.id, selectedAdminId, newPassword);
      setShowResetModal(false);
      setNewPassword('');
      setActionSuccess('Kata sandi admin travel berhasil direset');
      loadDetail();
    } catch (err: any) {
      alert('Gagal mereset password: ' + err.message);
    } finally {
      setResetting(false);
    }
  };

  if (loading && !tenant) {
    return (
      <AdminLayout title="Detail Travel">
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--sa-text-muted)' }}>
          <RefreshCw size={24} className="db-spin" />
          <p style={{ marginTop: '10px' }}>Memuat spesifikasi travel...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error || !tenant) {
    return (
      <AdminLayout title="Detail Travel">
        <div
          style={{
            padding: '16px',
            backgroundColor: 'var(--sa-red-bg)',
            border: '1px solid var(--sa-red-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--sa-red-text)',
            fontSize: '13px',
          }}
        >
          {error || 'Data travel tidak ditemukan'}
        </div>
      </AdminLayout>
    );
  }

  const usage = tenant.usage || tenant.ringkasan_penggunaan;
  const admins: StaffTenantAdminItem[] = tenant.daftar_admin || [];
  const planName =
    tenant.current_plan_name ||
    (typeof tenant.current_plan === 'string'
      ? tenant.current_plan
      : tenant.current_plan?.name || 'Tanpa Paket');

  return (
    <AdminLayout
      title={tenant.name}
      subtitle={`Subdomain: ${tenant.slug}.klikumroh.id`}
      onBack={() => navigate('/internal/tenants')}
      backLabel="Daftar Travel Mitra"
      headerActions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="sa-action-btn"
            onClick={openImpersonateModal}
            title="Buka sesi dashboard sebagai travel ini"
          >
            <LogIn size={13} />
            <span>Masuk Sebagai Travel</span>
          </button>

          <button
            type="button"
            className="sa-action-btn sa-action-btn--primary"
            onClick={openExtendModal}
          >
            <Calendar size={13} />
            <span>Perpanjang Paket</span>
          </button>
        </div>
      }
    >
      {actionSuccess && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--sa-green-bg)',
            border: '1px solid var(--sa-green-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--sa-green-text)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* 2-COLUMN STRUCTURED SPECIFICATION PANELS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '20px',
          marginBottom: '24px',
        }}
      >
        {/* Panel 1: Langganan & Domain */}
        <div className="sa-data-panel">
          <div className="sa-data-panel__bar">
            <strong style={{ fontSize: '13.5px' }}>Langganan & Domain</strong>
            <span className="sa-pill sa-pill--neutral">{planName}</span>
          </div>

          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sa-border-subtle)', paddingBottom: '10px' }}>
              <span style={{ color: 'var(--sa-text-muted)' }}>Status Akun</span>
              {(() => {
                const sv = subscriptionStatusView(tenant.subscription_status, tenant.status);
                return (
                  <span className={`sa-pill sa-pill--${sv.tone}`}>
                    {sv.tone !== 'neutral' && (
                      <span className="sa-status-dot" style={{ backgroundColor: `var(--sa-${sv.tone})` }} />
                    )}
                    <span>{sv.label}</span>
                  </span>
                );
              })()}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sa-border-subtle)', paddingBottom: '10px' }}>
              <span style={{ color: 'var(--sa-text-muted)' }}>Paket Saat Ini</span>
              <strong style={{ color: 'var(--sa-text)' }}>
                {planName}
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sa-border-subtle)', paddingBottom: '10px' }}>
              <span style={{ color: 'var(--sa-text-muted)' }}>Berlaku Hingga</span>
              <strong style={{ color: 'var(--sa-text)' }}>
                {formatDate(tenant.subscription_expires_at)}
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sa-border-subtle)', paddingBottom: '10px' }}>
              <span style={{ color: 'var(--sa-text-muted)' }}>Kontak WhatsApp</span>
              <div>
                {tenant.whatsapp_number ? (
                  <a
                    href={`https://wa.me/${cleanWa(tenant.whatsapp_number)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Chat WhatsApp"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: 'var(--sa-text)',
                      textDecoration: 'none',
                      fontFamily: 'var(--sa-font-code)',
                      fontSize: '12.5px',
                      fontWeight: 600,
                    }}
                  >
                    <MessageCircle size={13} style={{ color: 'var(--sa-green)' }} />
                    <span>{tenant.whatsapp_number}</span>
                  </a>
                ) : (
                  <span style={{ color: 'var(--sa-text-subtle)' }}>-</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--sa-border-subtle)', paddingBottom: '10px' }}>
              <span style={{ color: 'var(--sa-text-muted)' }}>Domain Kustom</span>
              <div style={{ textAlign: 'right' }}>
                {tenant.domain?.custom_domain ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px' }}>
                    <Globe size={13} style={{ color: 'var(--sa-blue-text)' }} />
                    <strong style={{ color: 'var(--sa-text)' }}>{tenant.domain.custom_domain}</strong>
                  </div>
                ) : (
                  <span style={{ color: 'var(--sa-text-subtle)' }}>-</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--sa-text-muted)' }}>Status Domain</span>
              <span className="sa-pill sa-pill--neutral">
                {tenant.domain?.custom_domain_status || 'Subdomain Aktif'}
              </span>
            </div>
          </div>
        </div>

        {/* Panel 2: Utilisasi Kuota Platform */}
        <div className="sa-data-panel">
          <div className="sa-data-panel__bar">
            <strong style={{ fontSize: '13.5px' }}>Utilisasi Sumber Daya</strong>
            <span className="sa-pill sa-pill--green">
              <span className="sa-status-dot" />
              <span>Live Synced</span>
            </span>
          </div>

          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                backgroundColor: 'var(--sa-surface)',
                borderRadius: 'var(--sa-radius-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Package size={16} style={{ color: 'var(--sa-text-muted)' }} />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Katalog Paket Umroh</span>
              </div>
              <strong style={{ fontFamily: 'var(--sa-font-display)', fontSize: '16px' }}>
                {usage?.total_packages ?? tenant.total_packages ?? 0}
              </strong>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                backgroundColor: 'var(--sa-surface)',
                borderRadius: 'var(--sa-radius-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={16} style={{ color: 'var(--sa-text-muted)' }} />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Database Prospek Jamaah</span>
              </div>
              <strong style={{ fontFamily: 'var(--sa-font-display)', fontSize: '16px' }}>
                {usage?.total_prospects ?? tenant.total_prospects ?? 0}
              </strong>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                backgroundColor: 'var(--sa-surface)',
                borderRadius: 'var(--sa-radius-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers size={16} style={{ color: 'var(--sa-text-muted)' }} />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Jaringan Agen Mitra</span>
              </div>
              <strong style={{ fontFamily: 'var(--sa-font-display)', fontSize: '16px' }}>
                {usage?.total_active_agents ?? tenant.total_active_agents ?? 0}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Panel 3: Akun Staf Admin Travel (Integrated Data Table) */}
      <div className="sa-data-panel">
        <div className="sa-data-panel__bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <strong style={{ fontSize: '13.5px' }}>Akun Admin Travel</strong>
            <span className="sa-nav-count">
              {admins.length} Pengguna
            </span>
          </div>
        </div>

        <div className="sa-table-scroller">
          <table className="sa-grid">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Status</th>
                <th>Terdaftar</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--sa-text-muted)' }}>
                    Belum ada akun admin terdaftar pada travel ini
                  </td>
                </tr>
              ) : (
                admins.map((admin: StaffTenantAdminItem) => (
                  <tr key={admin.id}>
                    <td style={{ fontWeight: 600 }}>{admin.name}</td>
                    <td style={{ fontFamily: 'var(--sa-font-code)', fontSize: '12.5px' }}>{admin.email}</td>
                    <td>
                      <span className="sa-pill sa-pill--green">
                        <span className="sa-status-dot" style={{ backgroundColor: 'var(--sa-green)' }} />
                        <span>{admin.status || 'Aktif'}</span>
                      </span>
                    </td>
                    <td style={{ color: 'var(--sa-text-muted)', fontSize: '12px' }}>
                      {formatDate(admin.created_at)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="sa-action-btn"
                        onClick={() => {
                          setSelectedAdminId(admin.id);
                          setShowResetModal(true);
                        }}
                      >
                        <Key size={12} />
                        <span>Reset Password</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL ALASAN IMPERSONASI */}
      <Modal
        isOpen={showImpersonateModal}
        onClose={() => !impersonating && setShowImpersonateModal(false)}
        title={`Masuk Sebagai ${tenant.name}`}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowImpersonateModal(false)}
              disabled={impersonating}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="impersonate-reason-form"
              variant="primary"
              disabled={impersonating || trimmedReason.length < MIN_REASON_LENGTH}
            >
              <LogIn size={16} />
              <span>{impersonating ? 'Membuka Sesi...' : 'Masuk Dashboard'}</span>
            </Button>
          </>
        }
      >
        <form id="impersonate-reason-form" onSubmit={handleImpersonateSubmit}>
          <FormInput
            type="textarea"
            label="Alasan Akses *"
            rows={3}
            placeholder="Contoh: Membantu admin travel memeriksa prospek yang tidak muncul di pipeline"
            value={impersonateReason}
            onChange={(e) => setImpersonateReason(e.target.value)}
            error={impersonateError || undefined}
            hint={`${trimmedReason.length}/${MIN_REASON_LENGTH} karakter minimum`}
            tooltip="Alasan ini dan setiap halaman yang dibuka selama sesi 4 jam tercatat di Riwayat Akses Staf milik travel, dan dapat dibaca langsung oleh admin travel."
          />
        </form>
      </Modal>

      {/* MODAL PERPANJANG LANGGANAN */}
      {showExtendModal && (
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
          onClick={() => setShowExtendModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--sa-card)',
              borderRadius: 'var(--sa-radius-md)',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700 }}>
              Perpanjang Langganan Travel
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--sa-text-muted)' }}>
              Pilih paket dan durasi perpanjangan untuk <strong>{tenant.name}</strong>.
            </p>

            <form onSubmit={handleExtendSubmit}>
              {/* Pilihan Paket Langganan */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--sa-text)' }}>
                  Paket Langganan:
                </label>
                <CustomDropdown
                  value={selectedPlanId}
                  onChange={(e) => handlePlanChange(Number(e.target.value))}
                  options={plans.map((p) => ({
                    value: p.id,
                    label: `${p.name} — ${p.period_months} Bulan${p.price > 0 ? ` (Rp ${Math.round(p.price).toLocaleString('id-ID')})` : ''}`,
                  }))}
                />
              </div>

              {/* Pilihan Durasi Perpanjangan */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--sa-text)' }}>
                  Durasi Tambahan:
                </label>
                <CustomDropdown
                  value={selectedMonths}
                  onChange={(e) => setSelectedMonths(Number(e.target.value))}
                  options={(() => {
                    const currentPlan = plans.find((p) => p.id === selectedPlanId);
                    const planMonths = currentPlan ? currentPlan.period_months : 1;
                    const opts = [{ value: planMonths, label: `Sesuai Durasi Paket (+${planMonths} Bulan)` }];
                    if (planMonths !== 1) opts.push({ value: 1, label: 'Kustom +1 Bulan' });
                    if (planMonths !== 3) opts.push({ value: 3, label: 'Kustom +3 Bulan' });
                    if (planMonths !== 6) opts.push({ value: 6, label: 'Kustom +6 Bulan' });
                    if (planMonths !== 12) opts.push({ value: 12, label: 'Kustom +12 Bulan (1 Tahun)' });
                    return opts;
                  })()}
                />
              </div>

              {/* Preview Kalkulasi Akumulatif Masa Aktif */}
              {(() => {
                const { newDate, isCurrentlyActive } = calculateNewExpiry();
                return (
                  <div
                    style={{
                      padding: '12px 14px',
                      backgroundColor: 'var(--sa-surface)',
                      borderRadius: 'var(--sa-radius-sm)',
                      border: '1px solid var(--sa-border)',
                      marginBottom: '20px',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--sa-text-muted)' }}>Masa Aktif Saat Ini:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--sa-text)' }}>
                          {tenant.subscription_expires_at ? formatDate(tenant.subscription_expires_at) : 'Belum Ada'}
                        </span>
                        <span
                          className={`sa-badge sa-badge--sm ${
                            isCurrentlyActive ? 'sa-badge--active' : 'sa-badge--expired'
                          }`}
                        >
                          {isCurrentlyActive ? 'Aktif' : 'Kedaluwarsa'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--sa-text-muted)' }}>Tambahan Durasi:</span>
                      <strong style={{ color: 'var(--sa-text)' }}>
                        +{selectedMonths} Bulan
                      </strong>
                    </div>

                    <div style={{ height: '1px', backgroundColor: 'var(--sa-border)' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: 'var(--sa-green-text)' }}>Masa Aktif Baru:</span>
                      <strong style={{ fontSize: '13px', fontWeight: 800, color: 'var(--sa-green-text)' }}>
                        {formatDate(newDate.toISOString())}
                      </strong>
                    </div>

                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--sa-text-muted)', lineHeight: 1.4 }}>
                      {isCurrentlyActive
                        ? 'Dihitung akumulatif melanjutkan sisa masa aktif saat ini.'
                        : 'Dihitung mulai hari ini karena masa aktif sebelumnya telah berakhir.'}
                    </p>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="sa-btn sa-btn--secondary"
                  onClick={() => setShowExtendModal(false)}
                  disabled={extending}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="sa-btn sa-btn--primary"
                  disabled={extending}
                >
                  {extending ? 'Menyimpan...' : 'Konfirmasi Perpanjangan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RESET PASSWORD ADMIN */}
      {showResetModal && (
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
          onClick={() => setShowResetModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--sa-card)',
              borderRadius: 'var(--sa-radius-md)',
              maxWidth: '420px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700 }}>
              Reset Kata Sandi Admin
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--sa-text-muted)' }}>
              Masukkan kata sandi baru untuk akun staf admin travel.
            </p>

            <form onSubmit={handleResetSubmit}>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Kata Sandi Baru (min. 8 karakter):
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
                  onClick={() => setShowResetModal(false)}
                  disabled={resetting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="sa-btn sa-btn--primary"
                  disabled={resetting || newPassword.length < 8}
                >
                  {resetting ? 'Mereset...' : 'Simpan Sandi Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
