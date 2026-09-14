import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  CheckCircle2,
  TrendingUp,
  Share2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Trophy,
  Activity,
  AlertCircle,
  MessageCircle,
  Wallet,
  Clock,
  Calendar,
  Layers,
} from 'lucide-react';
import { Sidebar, Topbar, PageHeader, Button, getStandardMenuItems } from '../components';
import {
  fetchDashboardOverview,
  getStoredUser,
  getFullImageUrl,
  type DashboardOverviewData,
  type DailyTrendItem,
  type PendingPipelineData,
} from '../services/api';
import './DashboardOverview.css';

/* ==========================================================================
   ICON COMPONENT: WHATSAPP ICON (SVG)
   ========================================================================== */
const WhatsAppIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 14,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.276-.101-.477-.15-.678.15-.2.3-.778.978-.954 1.179-.176.2-.351.226-.652.075-.3-.15-1.27-.468-2.42-1.493-.895-.798-1.5-1.784-1.676-2.085-.176-.301-.019-.464.132-.614.136-.135.301-.351.452-.527.15-.176.2-.301.301-.502.101-.2.05-.376-.025-.526-.075-.15-.678-1.635-.929-2.239-.244-.588-.493-.508-.678-.517-.176-.009-.376-.01-.577-.01s-.527.075-.803.376c-.276.301-1.054 1.03-1.054 2.511s1.079 2.912 1.23 3.113c.15.201 2.123 3.242 5.143 4.547.718.31 1.279.496 1.716.635.722.23 1.378.197 1.897.12.578-.087 1.78-.727 2.031-1.43.251-.703.251-1.305.176-1.43-.076-.126-.276-.201-.577-.351zm-5.464 7.618a9.92 9.92 0 0 1-5.06-1.385l-.363-.215-3.762.986 1.004-3.667-.236-.375a9.925 9.925 0 0 1-1.523-5.275c0-5.495 4.47-9.965 9.97-9.965 2.663 0 5.166 1.038 7.045 2.92a9.914 9.914 0 0 1 2.92 7.045c0 5.496-4.47 9.966-9.988 9.966zm8.457-18.423A11.89 11.89 0 0 0 12.008 0C5.387 0 .003 5.384.003 12.005a11.94 11.94 0 0 0 1.624 6.023L0 24l6.155-1.614a11.93 11.93 0 0 0 5.853 1.545h.005c6.62 0 12.004-5.385 12.004-12.006a11.91 11.91 0 0 0-3.552-8.352z" />
  </svg>
);

/* ==========================================================================
   HELPER UTILITIES
   ========================================================================== */
const formatRupiah = (val: number): string => {
  return new Intl.NumberFormat('id-ID').format(Math.round(val));
};

const formatShortRupiah = (val: number): string => {
  if (val >= 1_000_000_000) {
    return `${(val / 1_000_000_000).toFixed(1).replace('.0', '')} M`;
  }
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(0)} jt`;
  }
  return formatRupiah(val);
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const formatWaitTime = (createdAtStr?: string): { text: string; isUrgent: boolean } => {
  if (!createdAtStr) return { text: '< 1 jam', isUrgent: false };
  const created = new Date(createdAtStr);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - created.getTime());
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return { text: '< 1 jam', isUrgent: false };
  if (hours < 24) return { text: `${hours} jam`, isUrgent: hours >= 18 };
  const days = Math.floor(hours / 24);
  return { text: `${days} hari`, isUrgent: true };
};

const cleanPhoneForWa = (phone: string) => {
  let p = phone.replace(/[^0-9]/g, '');
  if (p.startsWith('0')) {
    p = '62' + p.slice(1);
  }
  return p;
};

/* ==========================================================================
   PRIORITY ALERTS BAR COMPONENT
   ========================================================================== */
interface PriorityAlertsBarProps {
  uncontactedCount: number;
  pendingPayoutsCount: number;
  pendingPayoutsTotal: number;
}

const PriorityAlertsBar: React.FC<PriorityAlertsBarProps> = ({
  uncontactedCount,
  pendingPayoutsCount,
  pendingPayoutsTotal,
}) => {
  const navigate = useNavigate();

  return (
    <section className="db-priority-alerts-bar" aria-label="Notifikasi Tindakan Mendesak">
      <div className="db-priority-alerts__label-box">
        <AlertCircle size={18} className="db-priority-alerts__label-icon" />
        <div className="db-priority-alerts__label-texts">
          <span className="db-priority-alerts__label-title">Perlu tindakan</span>
          <span className="db-priority-alerts__label-sub">Hari ini</span>
        </div>
      </div>

      <div className="db-priority-alerts__item db-priority-alerts__item--prospects">
        <MessageCircle size={18} className="db-priority-alerts__item-icon db-priority-alerts__item-icon--danger" />
        <div className="db-priority-alerts__item-info">
          <span className="db-priority-alerts__item-title">
            {uncontactedCount} prospek belum dihubungi
          </span>
          <span className="db-priority-alerts__item-desc">
            Prospek baru lebih dari 24 jam
          </span>
        </div>
        <button
          type="button"
          className="db-priority-alerts__item-action"
          onClick={() => navigate('/prospects?status=baru')}
        >
          Buka prospek
        </button>
      </div>

      <div className="db-priority-alerts__item db-priority-alerts__item--payouts">
        <Wallet size={18} className="db-priority-alerts__item-icon db-priority-alerts__item-icon--warning" />
        <div className="db-priority-alerts__item-info">
          <span className="db-priority-alerts__item-title">
            {pendingPayoutsCount} pengajuan pencairan
          </span>
          <span className="db-priority-alerts__item-desc">
            Total Rp{formatRupiah(pendingPayoutsTotal)} menunggu review
          </span>
        </div>
        <button
          type="button"
          className="db-priority-alerts__item-action"
          onClick={() => navigate('/agents/payouts')}
        >
          Periksa
        </button>
      </div>
    </section>
  );
};

/* ==========================================================================
   GROUPED MULTI-BAR CHART (TREN PROSPEK MASUK)
   ========================================================================== */
interface GroupedBarChartProps {
  trends: DailyTrendItem[];
}

const GroupedBarChart: React.FC<GroupedBarChartProps> = ({ trends }) => {
  const [range, setRange] = useState<'7' | '14'>('7');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const displayData = range === '7' ? trends.slice(-7) : trends.slice(-14);

  // Maximum single channel bar value for relative scaling (at least 5)
  const maxVal = Math.max(
    5,
    ...displayData.map((d) => Math.max(d.organik, d.meta_ads, d.agent))
  );

  const maxHeightPx = 130;

  const getDayAbbr = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      return days[d.getDay()] || '';
    } catch {
      return '';
    }
  };

  return (
    <div className="db-grouped-chart-card">
      <div className="db-grouped-chart__header">
        <div className="db-grouped-chart__title-group">
          <div className="db-grouped-chart__title-row">
            <Activity size={16} className="db-grouped-chart__title-icon" />
            <h3 className="db-grouped-chart__title">Tren prospek masuk</h3>
          </div>
          <p className="db-grouped-chart__desc">
            Perbandingan sumber prospek dalam {range} hari terakhir
          </p>
        </div>

        <div className="db-grouped-chart__tools">
          <div className="db-grouped-chart__legend">
            <div className="db-grouped-chart__legend-item">
              <span className="db-grouped-chart__dot db-grouped-chart__dot--organik" />
              <span>Organik</span>
            </div>
            <div className="db-grouped-chart__legend-item">
              <span className="db-grouped-chart__dot db-grouped-chart__dot--meta" />
              <span>Meta Ads</span>
            </div>
            <div className="db-grouped-chart__legend-item">
              <span className="db-grouped-chart__dot db-grouped-chart__dot--agen" />
              <span>Agen</span>
            </div>
          </div>

          <div className="db-grouped-chart__range-switch">
            <button
              type="button"
              className={`db-grouped-chart__range-btn ${range === '7' ? 'active' : ''}`}
              onClick={() => setRange('7')}
            >
              7 hari
            </button>
            <button
              type="button"
              className={`db-grouped-chart__range-btn ${range === '14' ? 'active' : ''}`}
              onClick={() => setRange('14')}
            >
              14 hari
            </button>
          </div>
        </div>
      </div>

      {/* Grouped Bars Area */}
      <div className="db-grouped-chart__bars-area">
        {displayData.map((item, idx) => {
          const organikH = Math.max(4, Math.round((item.organik / maxVal) * maxHeightPx));
          const metaH = Math.max(4, Math.round((item.meta_ads / maxVal) * maxHeightPx));
          const agentH = Math.max(4, Math.round((item.agent / maxVal) * maxHeightPx));
          const dayName = getDayAbbr(item.date);

          return (
            <div
              key={item.date || idx}
              className="db-grouped-chart__col"
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {hoverIdx === idx && (
                <div className="db-grouped-chart__tooltip">
                  <div className="db-grouped-chart__tooltip-title">{item.label}</div>
                  <div className="db-grouped-chart__tooltip-row">
                    <span className="db-grouped-chart__dot db-grouped-chart__dot--organik" />
                    <span>Organik:</span>
                    <strong>{item.organik}</strong>
                  </div>
                  <div className="db-grouped-chart__tooltip-row">
                    <span className="db-grouped-chart__dot db-grouped-chart__dot--meta" />
                    <span>Meta Ads:</span>
                    <strong>{item.meta_ads}</strong>
                  </div>
                  <div className="db-grouped-chart__tooltip-row">
                    <span className="db-grouped-chart__dot db-grouped-chart__dot--agen" />
                    <span>Agen:</span>
                    <strong>{item.agent}</strong>
                  </div>
                  <div className="db-grouped-chart__tooltip-total">
                    Total: {item.total} prospek
                  </div>
                </div>
              )}

              <div className="db-grouped-chart__bars-wrapper">
                <div
                  className="db-grouped-chart__bar db-grouped-chart__bar--organik"
                  style={{ height: `${organikH}px` }}
                  title={`Organik: ${item.organik}`}
                />
                <div
                  className="db-grouped-chart__bar db-grouped-chart__bar--meta"
                  style={{ height: `${metaH}px` }}
                  title={`Meta Ads: ${item.meta_ads}`}
                />
                <div
                  className="db-grouped-chart__bar db-grouped-chart__bar--agen"
                  style={{ height: `${agentH}px` }}
                  title={`Agen: ${item.agent}`}
                />
              </div>

              <div className="db-grouped-chart__label">
                <span className="db-grouped-chart__day">{dayName}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ==========================================================================
   ACTIVE SALES PIPELINE CARD (DARK TEAL CONTAINER)
   ========================================================================== */
interface ActiveSalesPipelineCardProps {
  pipeline: PendingPipelineData;
}

const ActiveSalesPipelineCard: React.FC<ActiveSalesPipelineCardProps> = ({ pipeline }) => {
  const navigate = useNavigate();

  return (
    <div className="db-pipeline-dark-card">
      <div className="db-pipeline-dark__header">
        <div className="db-pipeline-dark__title-copy">
          <div className="db-pipeline-dark__title">Nilai pipeline aktif</div>
          <div className="db-pipeline-dark__desc">Estimasi paket dari prospek berjalan</div>
        </div>
        <div className="db-pipeline-dark__badge">
          <span>{pipeline.total_prospects} PROSPEK</span>
        </div>
      </div>

      <div className="db-pipeline-dark__hero">
        <div className="db-pipeline-dark__amount">
          Rp{formatRupiah(pipeline.total_value)}
        </div>
        <div className="db-pipeline-dark__pax">
          {pipeline.total_pax} pax jamaah potensial
        </div>
      </div>

      <div className="db-pipeline-dark__stages">
        {pipeline.stages && pipeline.stages.length > 0 ? (
          pipeline.stages.map((st) => (
            <div key={st.status} className="db-pipeline-dark__stage-row">
              <span className={`db-pipeline-dark__stage-dot db-pipeline-dark__stage-dot--${st.status}`} />
              <span className="db-pipeline-dark__stage-label">
                {st.status === 'baru' || st.label === 'Prospek Baru'
                  ? 'Baru'
                  : st.status === 'tertarik' || st.label === 'Tahap Negosiasi'
                  ? 'Tertarik'
                  : st.status === 'dihubungi' || st.label === 'Sedang Dihubungi'
                  ? 'Dihubungi'
                  : st.label}
              </span>
              <span className="db-pipeline-dark__stage-count">
                {st.prospect_count} prospek ({st.total_pax} pax)
              </span>
              <span className="db-pipeline-dark__stage-val">
                Rp{formatShortRupiah(st.total_value)}
              </span>
            </div>
          ))
        ) : (
          <div className="db-pipeline-dark__empty">Tidak ada prospek aktif tertunda.</div>
        )}
      </div>

      <button
        type="button"
        className="db-pipeline-dark__action-btn"
        onClick={() => navigate('/prospects')}
      >
        <span>Tindak lanjuti prospek</span>
        <ArrowRight size={14} />
      </button>
    </div>
  );
};

/* ==========================================================================
   MAIN DASHBOARD OVERVIEW PAGE
   ========================================================================== */
export const DashboardOverviewPage: React.FC = () => {
  const [data, setData] = useState<DashboardOverviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeProspectTab, setActiveProspectTab] = useState<'baru' | 'tertarik'>('baru');

  const currentUser = getStoredUser();
  const menuItems = getStandardMenuItems('dashboard');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchDashboardOverview();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat ringkasan dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const allProspects = data?.recent_prospects || [];
  const uncontactedProspects = allProspects
    .filter((p) => p.status === 'baru')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const readyClosingProspects = allProspects
    .filter((p) => p.status === 'tertarik')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filteredProspects = (activeProspectTab === 'baru' ? uncontactedProspects : readyClosingProspects).slice(0, 8);

  return (
    <div className="db-main-layout">
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={menuItems}
      />

      <div className="db-content-area">
        <Topbar
          title="Dashboard"
          userName={currentUser?.name || 'Admin Travel'}
          userRole="Administrator"
          userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AM'}
        />

        <main className="db-page-container">
          <PageHeader
            title={`Selamat datang, ${currentUser?.name?.split(' ')[0] || 'Admin'}`}
            subtitle="Pantau prospek, jaringan agen, dan peluang closing dalam satu tampilan terpadu."
          />

          {error && (
            <div className="db-overview__alerts-bar" style={{ borderLeftColor: 'var(--db-negative)' }}>
              <div className="db-overview__alerts-header">
                <AlertTriangle size={16} />
                <span>Terjadi kesalahan saat memuat data</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--db-text-muted)' }}>{error}</p>
              <div>
                <Button variant="primary" size="sm" onClick={loadData}>
                  Coba Lagi
                </Button>
              </div>
            </div>
          )}

          {loading && !data && (
            <div className="db-overview__empty">
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              <p>Memuat data ringkasan dashboard...</p>
            </div>
          )}

          {data && (
            <div className="db-overview">
              {/* PRIORITY ALERTS BAR */}
              <PriorityAlertsBar
                uncontactedCount={data.urgent_alerts?.uncontacted_prospects_count || 0}
                pendingPayoutsCount={data.urgent_alerts?.pending_payouts_count || 0}
                pendingPayoutsTotal={data.urgent_alerts?.pending_payouts_total || 0}
              />

              {/* ZONA 1: 4 KPI METRIC CARDS */}
              <section className="db-overview__kpi-grid" aria-label="Ringkasan Indikator Kinerja Utama">
                <div className="db-overview__kpi-card">
                  <div className="db-overview__kpi-header">
                    <span className="db-overview__kpi-label">Total prospek masuk</span>
                    <Users size={17} className="db-overview__kpi-icon" />
                  </div>
                  <div className="db-overview__kpi-body">
                    <div className="db-overview__kpi-val-row">
                      <span className="db-overview__kpi-value">{data.kpis.total_prospects}</span>
                      <span className="db-overview__kpi-unit">prospek</span>
                    </div>
                    <div className="db-overview__kpi-sub">Semua sumber akuisisi</div>
                  </div>
                </div>

                <div className="db-overview__kpi-card db-overview__kpi-card--highlight">
                  <div className="db-overview__kpi-header">
                    <span className="db-overview__kpi-label">Jamaah closing</span>
                    <CheckCircle2 size={17} className="db-overview__kpi-icon db-overview__kpi-icon--positive" />
                  </div>
                  <div className="db-overview__kpi-body">
                    <div className="db-overview__kpi-val-row">
                      <span className="db-overview__kpi-value db-overview__kpi-value--positive">
                        {data.kpis.total_closing_jamaah}
                      </span>
                      <span className="db-overview__kpi-unit">pax</span>
                    </div>
                    <div className="db-overview__kpi-sub">Tervalidasi oleh travel</div>
                  </div>
                </div>

                <div className="db-overview__kpi-card">
                  <div className="db-overview__kpi-header">
                    <span className="db-overview__kpi-label">Closing rate</span>
                    <TrendingUp size={17} className="db-overview__kpi-icon" />
                  </div>
                  <div className="db-overview__kpi-body">
                    <div className="db-overview__kpi-val-row">
                      <span className="db-overview__kpi-value">{data.kpis.closing_rate}</span>
                      <span className="db-overview__kpi-unit">%</span>
                    </div>
                    <div className="db-overview__kpi-sub">Rasio closing per prospek</div>
                  </div>
                </div>

                <div className="db-overview__kpi-card">
                  <div className="db-overview__kpi-header">
                    <span className="db-overview__kpi-label">Kontribusi agen</span>
                    <Share2 size={17} className="db-overview__kpi-icon db-overview__kpi-icon--indigo" />
                  </div>
                  <div className="db-overview__kpi-body">
                    <div className="db-overview__kpi-val-row">
                      <span className="db-overview__kpi-value db-overview__kpi-value--indigo">
                        {data.kpis.agent_contribution_percentage}
                      </span>
                      <span className="db-overview__kpi-unit">%</span>
                    </div>
                    <div className="db-overview__kpi-sub">
                      {Math.round((data.kpis.agent_contribution_percentage / 100) * (data.kpis.total_prospects || 1))} prospek dari referral agen
                    </div>
                  </div>
                </div>
              </section>

              {/* ZONA 2: ANALYSIS ROW (GROUPED BAR CHART & ACTIVE SALES PIPELINE) */}
              <section className="db-overview__analysis-row" aria-label="Analisis Tren Prospek dan Pipeline Aktif">
                <GroupedBarChart trends={data.prospect_trends || []} />
                <ActiveSalesPipelineCard
                  pipeline={
                    data.pending_pipeline || {
                      total_prospects: 0,
                      total_pax: 0,
                      total_value: 0,
                      avg_value_per_pax: 0,
                      stages: [],
                    }
                  }
                />
              </section>

              {/* ZONA 3: ACTIVITY ROW (RECENT PROSPECTS & SALES INTELLIGENCE) */}
              <section className="db-overview__activity-row" aria-label="Aktivitas Prospek dan Intelijen Penjualan">
                {/* Kolom Kiri: Recent Prospects ("Perlu dihubungi") */}
                <div className="db-prospects-panel">
                  <div className="db-prospects-panel__header">
                    <div className="db-prospects-panel__title-copy">
                      <h3 className="db-prospects-panel__title">Perlu dihubungi</h3>
                      <p className="db-prospects-panel__subtitle">
                        Dahulukan yang paling lama menunggu untuk konversi maksimal.
                      </p>
                    </div>
                    <Link to="/prospects" className="db-prospects-panel__view-all">
                      <span>Semua prospek</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>

                  {/* Filter Tabs */}
                  <div className="db-prospects-panel__tabs">
                    <button
                      type="button"
                      className={`db-prospects-panel__tab ${activeProspectTab === 'baru' ? 'active' : ''}`}
                      onClick={() => setActiveProspectTab('baru')}
                    >
                      <span>Belum Dihubungi</span>
                      <span className="db-prospects-panel__tab-badge db-prospects-panel__tab-badge--urgent">
                        {uncontactedProspects.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`db-prospects-panel__tab ${activeProspectTab === 'tertarik' ? 'active' : ''}`}
                      onClick={() => setActiveProspectTab('tertarik')}
                    >
                      <span>Siap Closing</span>
                      <span className="db-prospects-panel__tab-badge db-prospects-panel__tab-badge--interested">
                        {readyClosingProspects.length}
                      </span>
                    </button>
                  </div>

                  {/* Prospect List */}
                  <div className="db-prospects-panel__list">
                    {filteredProspects.length > 0 ? (
                      filteredProspects.map((p) => {
                        const waitInfo = formatWaitTime(p.created_at);
                        const waNumber = cleanPhoneForWa(p.phone);
                        const waText = encodeURI(
                          `Assalamu'alaikum wr. wb. Bapak/Ibu ${p.name}, kami menindaklanjuti minat Anda untuk paket ${p.package_name}.`
                        );
                        const waUrl = `https://wa.me/${waNumber}?text=${waText}`;

                        return (
                          <div key={p.id} className="db-prospect-item">
                            <div
                              className={`db-prospect-item__rail ${
                                waitInfo.isUrgent ? 'db-prospect-item__rail--urgent' : ''
                              }`}
                            />

                            <div className="db-prospect-item__identity">
                              <Link
                                to={`/prospects/${p.id}`}
                                className="db-prospect-item__name"
                                title={`Lihat detail prospek ${p.name}`}
                              >
                                {p.name}
                              </Link>
                              <div className="db-prospect-item__meta-row">
                                <span className={`db-prospect-item__status-dot db-prospect-item__status-dot--${p.status}`} />
                                <span className="db-prospect-item__status-text">{p.status}</span>
                                <span className="db-prospect-item__sep">•</span>
                                <span className="db-prospect-item__wait-wrap">
                                  <Clock size={10} className="db-prospect-item__clock-icon" />
                                  <span className={`db-prospect-item__wait-text ${waitInfo.isUrgent ? 'urgent' : ''}`}>
                                    {waitInfo.text}
                                  </span>
                                </span>
                                <span className="db-prospect-item__sep db-prospect-item__mobile-source-sep">•</span>
                                <span className="db-prospect-item__mobile-source-text">
                                  {p.source_channel === 'agent'
                                    ? `Agen · ${p.agent_name || 'Mitra'}`
                                    : p.source_channel === 'paid_ads'
                                    ? 'Meta Ads'
                                    : 'Organik'}
                                </span>
                              </div>
                            </div>

                            <div className="db-prospect-item__package-col">
                              <span className="db-prospect-item__package-name" title={p.package_name}>
                                {p.package_name || 'Umroh Reguler'}
                              </span>
                              <div className="db-prospect-item__departure">
                                <Calendar size={11} className="db-prospect-item__departure-icon" />
                                <span>{p.package_departure_date || 'Menyesuaikan'}</span>
                              </div>
                            </div>

                            <div className="db-prospect-item__source-col">
                              <Layers size={11} className="db-prospect-item__source-icon" />
                              <span className="db-prospect-item__source-text">
                                {p.source_channel === 'agent'
                                  ? `Agen · ${p.agent_name || 'Mitra'}`
                                  : p.source_channel === 'paid_ads'
                                  ? 'Meta Ads'
                                  : 'Organik'}
                              </span>
                            </div>

                            <div className="db-prospect-item__actions">
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="db-prospect-item__wa-btn"
                                title={`Hubungi ${p.name} via WhatsApp`}
                              >
                                <WhatsAppIcon size={16} />
                              </a>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="db-prospects-panel__empty">
                        <CheckCircle2 size={24} className="db-prospects-panel__empty-icon" />
                        <p className="db-prospects-panel__empty-title">
                          {activeProspectTab === 'baru'
                            ? 'Semua prospek baru sudah dihubungi'
                            : 'Belum ada prospek di tahap siap closing'}
                        </p>
                        <p className="db-prospects-panel__empty-desc">
                          {activeProspectTab === 'baru'
                            ? 'Tidak ada antrean follow-up prospek baru saat ini.'
                            : 'Tindak lanjuti prospek yang sedang berjalan untuk mendorong ke tahap ini.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Kolom Kanan: Sales Intelligence Panel */}
                <div className="db-sales-intel-panel">
                  {/* Card 1: Sumber Akuisisi */}
                  <div className="db-intel-card">
                    <div className="db-intel-card__header">
                      <span className="db-intel-card__title">Sumber akuisisi</span>
                      <span className="db-intel-card__total">{data.kpis.total_prospects} prospek</span>
                    </div>

                    <div className="db-intel-channels-list">
                      {data.channel_attribution.map((ch) => {
                        const pct = data.kpis.total_prospects > 0
                          ? Math.round((ch.leads_count / data.kpis.total_prospects) * 100)
                          : 0;

                        const shortLabel =
                          ch.channel === 'agent' || ch.label.toLowerCase().includes('agen')
                            ? 'Agen'
                            : ch.channel === 'paid_ads' || ch.label.toLowerCase().includes('ads')
                            ? 'Meta Ads'
                            : ch.channel === 'organik' || ch.label.toLowerCase().includes('organik')
                            ? 'Organik'
                            : ch.label;

                        return (
                          <div key={ch.channel} className="db-intel-channel-row">
                            <span className={`db-intel-channel__dot db-intel-channel__dot--${ch.channel}`} />
                            <span className="db-intel-channel__label">{shortLabel}</span>
                            <div className="db-intel-channel__track">
                              <div
                                className={`db-intel-channel__bar db-intel-channel__bar--${ch.channel}`}
                                style={{ width: `${Math.min(100, Math.max(3, pct))}%` }}
                              />
                            </div>
                            <span className="db-intel-channel__metric">
                              {ch.leads_count} · {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card 2: Agen Teratas */}
                  <div className="db-intel-card db-intel-card--grow">
                    <div className="db-intel-card__header">
                      <span className="db-intel-card__title">Agen teratas</span>
                      <Link to="/agents" className="db-intel-card__action">
                        Kelola agen
                      </Link>
                    </div>

                    <div className="db-intel-agents-list">
                      {data.top_agents && data.top_agents.length > 0 ? (
                        data.top_agents.slice(0, 3).map((ag, idx) => (
                          <div key={ag.agent_id} className="db-intel-agent-row">
                            <div className={`db-intel-agent__rank db-intel-agent__rank--${idx + 1}`}>
                              {idx === 0 ? <Trophy size={11} /> : idx + 1}
                            </div>
                            <div className="db-intel-agent__avatar">
                              {ag.photo_url ? (
                                <img
                                  src={getFullImageUrl(ag.photo_url)}
                                  alt={ag.name}
                                  className="db-intel-agent__avatar-img"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                getInitials(ag.name)
                              )}
                            </div>
                            <div className="db-intel-agent__info">
                              <span className="db-intel-agent__name">{ag.name}</span>
                              <span className="db-intel-agent__clicks">
                                {ag.total_clicks} klik link
                              </span>
                            </div>
                            <div className="db-intel-agent__closing">
                              <span className="db-intel-agent__closing-num">
                                {ag.total_closing_jamaah}
                              </span>
                              <span className="db-intel-agent__closing-unit">pax closing</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="db-overview__empty" style={{ padding: '16px 0' }}>
                          Belum ada aktivitas agen terdata.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

