import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw,
  Package,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Clock,
  MessageCircle,
} from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import {
  fetchStaffOverview,
  fetchStaffTenants,
  type PlatformOverviewMetrics,
  type StaffTenantItem,
} from '../../../services/staffApi';

export const AdminDashboardView: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<PlatformOverviewMetrics | null>(null);
  const [tenants, setTenants] = useState<StaffTenantItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewData, tenantsData] = await Promise.all([
        fetchStaffOverview(),
        fetchStaffTenants('all').catch(() => []),
      ]);
      setMetrics(overviewData);
      setTenants(tenantsData);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat performa platform');
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

  const cleanWa = (num?: string | null) => {
    if (!num) return '';
    let digits = num.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = '62' + digits.slice(1);
    }
    return digits;
  };

  // Tenants expiring soon (within next 30 days)
  const expiringTenants = tenants.filter((t) => {
    if (!t.subscription_expires_at) return false;
    const exp = new Date(t.subscription_expires_at).getTime();
    const now = Date.now();
    const diffDays = (exp - now) / (1000 * 60 * 60 * 24);
    return diffDays > 0 && diffDays <= 30;
  });

  return (
    <AdminLayout
      title="Executive Cockpit"
      subtitle="Pemantauan pendapatan berulang, biro travel mitra, dan utilisasi ekosistem platform"
      tooltipText="Dashboard eksekutif KlikUmroh menyajikan ringkasan MRR, perpanjangan langganan, dan pemanfaatan sistem se-platform."
      headerActions={
        <button
          type="button"
          className="sa-action-btn"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'db-spin' : ''} />
          <span>Segarkan</span>
        </button>
      }
    >
      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--sa-red-bg)',
            border: '1px solid var(--sa-red-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--sa-red-text)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* EXECUTIVE SIGNAL METRIC RIBBON */}
      <div className="sa-metric-ribbon">
        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Monthly Recurring Revenue</span>
          <div className="sa-metric-cell__val">
            {metrics ? formatIDR(metrics.estimated_mrr) : '...'}
          </div>
          <span className="sa-metric-cell__sub">
            {metrics ? `ARR Run-rate: ${formatIDR(metrics.estimated_arr)}` : '-'}
          </span>
        </div>

        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Travel Mitra Aktif</span>
          <div className="sa-metric-cell__val" style={{ color: 'var(--sa-green-text)' }}>
            {metrics ? metrics.active_tenants : '...'}
          </div>
          <span className="sa-metric-cell__sub">
            {metrics ? `Dari total ${metrics.total_tenants} biro travel terdaftar` : '-'}
          </span>
        </div>

        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Verifikasi Pembayaran</span>
          <div className="sa-metric-cell__val" style={{ color: metrics && metrics.pending_verifications_count > 0 ? 'var(--sa-amber-text)' : 'inherit' }}>
            {metrics ? metrics.pending_verifications_count : '...'}
          </div>
          <span className="sa-metric-cell__sub">
            {metrics ? `Total nominal: ${formatIDR(metrics.pending_verifications_total)}` : '-'}
          </span>
        </div>

        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Jatuh Tempo (30 Hari)</span>
          <div className="sa-metric-cell__val">
            {metrics ? metrics.upcoming_renewals_30d : '...'}
          </div>
          <span className="sa-metric-cell__sub">
            {metrics && metrics.upcoming_renewals_7d > 0
              ? `${metrics.upcoming_renewals_7d} travel dalam 7 hari`
              : 'Tidak ada kritis dlm 7 hari'}
          </span>
        </div>
      </div>

      {/* OPERATIONAL DOCK: CHURN RISK & ECOSYSTEM STATS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: '20px',
          marginBottom: '24px',
        }}
      >
        {/* Urgent Attention: Expiring Subscriptions */}
        <div className="sa-data-panel">
          <div className="sa-data-panel__bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} style={{ color: 'var(--sa-amber)' }} />
              <strong style={{ fontSize: '13.5px' }}>Perlu Di-Follow Up (Jatuh Tempo)</strong>
            </div>
            <span className="sa-nav-count">{expiringTenants.length}</span>
          </div>

          <div style={{ padding: '0' }}>
            {expiringTenants.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--sa-text-muted)', fontSize: '13px' }}>
                Seluruh travel mitra masih memiliki masa aktif langganan yang aman.
              </div>
            ) : (
              <table className="sa-grid">
                <thead>
                  <tr>
                    <th>Travel Mitra</th>
                    <th>Paket</th>
                    <th>Jatuh Tempo</th>
                    <th style={{ textAlign: 'right' }}>Follow Up</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringTenants.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.name}</td>
                      <td>
                        <span className="sa-pill sa-pill--neutral">{t.plan_name || 'Pro'}</span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--sa-amber-text)', fontWeight: 600 }}>
                        {formatDate(t.subscription_expires_at)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {t.whatsapp_number ? (
                          <a
                            href={`https://wa.me/${cleanWa(t.whatsapp_number)}?text=Halo%20${encodeURIComponent(t.name)},%20kami%20dari%20KlikUmroh%20ingin%20mengingatkan%20masa%20aktif%20langganan%20Anda.`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="sa-action-btn"
                            style={{ color: 'var(--sa-green-text)', padding: '0 8px' }}
                          >
                            <MessageCircle size={12} />
                            <span>WhatsApp</span>
                          </a>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--sa-text-subtle)' }}>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Ecosystem Utilization Panel */}
        <div className="sa-data-panel">
          <div className="sa-data-panel__bar">
            <strong style={{ fontSize: '13.5px' }}>Utilisasi Ekosistem Platform</strong>
            <span className="sa-pill sa-pill--green">
              <span className="sa-status-dot" />
              <span>Live Synced</span>
            </span>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Paket Umroh Terpublikasi</span>
              </div>
              <strong style={{ fontFamily: 'var(--sa-font-display)', fontSize: '16px' }}>
                {metrics?.total_packages ?? 0}
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
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Total Prospek Jamaah Masuk</span>
              </div>
              <strong style={{ fontFamily: 'var(--sa-font-display)', fontSize: '16px' }}>
                {metrics?.total_prospects ?? 0}
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
                <CheckCircle2 size={16} style={{ color: 'var(--sa-text-muted)' }} />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Jaringan Agen Mitra Aktif</span>
              </div>
              <strong style={{ fontFamily: 'var(--sa-font-display)', fontSize: '16px' }}>
                {metrics?.total_active_agents ?? 0}
              </strong>
            </div>

            {Boolean(metrics && metrics.pending_verifications_count > 0) && (
              <div
                style={{
                  marginTop: '6px',
                  padding: '12px 14px',
                  backgroundColor: 'var(--sa-amber-bg)',
                  border: '1px solid var(--sa-amber-border)',
                  borderRadius: 'var(--sa-radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: '12.5px', color: 'var(--sa-amber-text)', fontWeight: 600 }}>
                  Ada {metrics?.pending_verifications_count} bukti transfer menunggu review Anda
                </div>
                <button
                  type="button"
                  className="sa-action-btn sa-action-btn--primary"
                  onClick={() => navigate('/internal/payment-verifications')}
                  style={{ height: '26px', fontSize: '11.5px', padding: '0 8px' }}
                >
                  <span>Buka Antrean</span>
                  <ArrowRight size={11} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
