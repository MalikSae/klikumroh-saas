import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Download,
  RefreshCw,
  Edit3,
  AlertCircle,
  AlertTriangle,
  MoreVertical,
  Eye,
  Lock,
  ListFilter,
  PlusCircle,
  PhoneCall,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Table,
  Button,
  FormInput,
  Modal,
  getStandardMenuItems,
  type Column,
} from '../components';
import {
  type ProspectItem,
  type PackageItem,
  type AgentItem,
  type ProspectStatusSummary,
  type FetchProspectsParams,
  fetchProspectPage,
  fetchProspectSummary,
  fetchPackages,
  fetchDashboardAgents,
  updateProspectStatus,
  downloadProspectsCSV,
  LOST_REASON_OPTIONS,
  lostReasonCategoryLabel,
  formatDeparturePlan,
  departurePlanOptions,
  getStoredUser,
} from '../services/api';
import { formatDateWIB, formatTimeWIB } from '../utils/datetime';
import { rememberProspectListQuery } from '../utils/prospectListQuery';
import './Prospects.css';

const STATUS_LABELS: Record<ProspectItem['status'], string> = {
  baru: 'Baru',
  dihubungi: 'Dihubungi',
  tertarik: 'Tertarik',
  closing: 'Closing',
  tidak_lanjut: 'Tidak Lanjut',
};

const STATUS_OPTIONS = [
  { value: 'baru', label: 'Baru' },
  { value: 'dihubungi', label: 'Dihubungi' },
  { value: 'tertarik', label: 'Tertarik' },
  { value: 'closing', label: 'Closing' },
  { value: 'tidak_lanjut', label: 'Tidak Lanjut' },
];

const sourceLabel = (source: string): string => {
  if (source === 'agen') return 'Agen';
  if (source === 'paid') return 'Meta Ads';
  return 'Organik';
};

const EMPTY_SUMMARY: ProspectStatusSummary = {
  total: 0,
  baru: 0,
  dihubungi: 0,
  tertarik: 0,
  closing: 0,
  tidak_lanjut: 0,
  stale_baru: 0,
  awaiting_payoff: 0,
  awaiting_payoff_with_agent: 0,
};

const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE_OPTIONS = [25, 50, 100];

export const ProspectsPage: React.FC = () => {
  const navigate = useNavigate();

  const [prospects, setProspects] = useState<ProspectItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [summary, setSummary] = useState<ProspectStatusSummary>(EMPTY_SUMMARY);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters, search and page live in the URL, so a refresh or "Kembali" from a detail keeps them.
  const [searchParams, setSearchParams] = useSearchParams();
  const param = (key: string, fallback: string) => searchParams.get(key) || fallback;
  const [statusFilter, setStatusFilter] = useState<string>(() => param('status', 'all'));
  const [packageFilter, setPackageFilter] = useState<string>(() => param('package', 'all'));
  const [sourceFilter, setSourceFilter] = useState<string>(() => param('source', 'all'));
  const [agentFilter, setAgentFilter] = useState<string>(() => param('agent', 'all'));
  const [payoffFilter, setPayoffFilter] = useState<string>(() => param('payoff', 'all'));
  const [departureFilter, setDepartureFilter] = useState<string>(() => param('departure', 'all'));
  const [searchInput, setSearchInput] = useState<string>(() => param('q', ''));
  const [searchQuery, setSearchQuery] = useState<string>(() => param('q', ''));
  const [page, setPage] = useState<number>(() => Math.max(1, Number(param('page', '1')) || 1));
  const [pageSize, setPageSize] = useState<number>(() => {
    const size = Number(param('size', '25'));
    return PAGE_SIZE_OPTIONS.includes(size) ? size : 25;
  });
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);

  // Status modal
  const [isStatusModalOpen, setIsStatusModalOpen] = useState<boolean>(false);
  const [selectedProspect, setSelectedProspect] = useState<ProspectItem | null>(null);
  const [newStatus, setNewStatus] = useState<string>('baru');
  const [lostReason, setLostReason] = useState<string>('');
  const [lostCategory, setLostCategory] = useState<string>('');
  const [confirmClosing, setConfirmClosing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Only the latest list request may update the table (typing fast must not show stale results).
  const requestSeq = useRef(0);

  const currentUser = getStoredUser();

  const filters: FetchProspectsParams = {
    status: statusFilter,
    package_id: packageFilter,
    source: sourceFilter,
    agent_id: agentFilter,
    payoff: payoffFilter,
    departure_plan: departureFilter,
    search: searchQuery,
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdownId(null);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Debounce the search box (only a changed search goes back to page 1, not the restored one).
  useEffect(() => {
    if (searchInput === searchQuery) return;
    const t = window.setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Mirror the list state into the URL (replace: no extra history entries) and remember it for "Kembali".
  useEffect(() => {
    const next = new URLSearchParams();
    const put = (key: string, value: string, fallback: string) => {
      if (value && value !== fallback) next.set(key, value);
    };
    put('status', statusFilter, 'all');
    put('package', packageFilter, 'all');
    put('source', sourceFilter, 'all');
    put('agent', agentFilter, 'all');
    put('payoff', payoffFilter, 'all');
    put('departure', departureFilter, 'all');
    put('q', searchQuery.trim(), '');
    put('page', String(page), '1');
    put('size', String(pageSize), '25');
    setSearchParams(next, { replace: true });
    rememberProspectListQuery(next.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, packageFilter, sourceFilter, agentFilter, payoffFilter, departureFilter, searchQuery, page, pageSize]);

  const loadSummary = useCallback(() => {
    fetchProspectSummary()
      .then(setSummary)
      .catch(() => {
        // counters are secondary; the list shows its own error
      });
  }, []);

  const loadPage = useCallback(async () => {
    const seq = ++requestSeq.current;
    const controller = new AbortController();
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProspectPage(filters, page, pageSize, controller.signal);
      if (seq !== requestSeq.current) return;
      setProspects(data.items);
      setTotal(data.total);
    } catch (err: any) {
      if (seq !== requestSeq.current || err?.name === 'AbortError') return;
      setError(err.message || 'Gagal memuat data prospek');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, packageFilter, sourceFilter, agentFilter, payoffFilter, departureFilter, searchQuery, page, pageSize]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    loadSummary();
    fetchPackages().then(setPackages).catch(() => {});
    fetchDashboardAgents('active').then(setAgents).catch(() => {});
  }, [loadSummary]);

  const applyFilter = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };
  const selectStatus = applyFilter(setStatusFilter);

  const handleResetFilters = () => {
    setStatusFilter('all');
    setPackageFilter('all');
    setSourceFilter('all');
    setAgentFilter('all');
    setPayoffFilter('all');
    setDepartureFilter('all');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  const handleOpenStatusModal = (p: ProspectItem) => {
    setSelectedProspect(p);
    setNewStatus(p.status);
    setLostReason(p.lost_reason_category === 'lainnya' ? p.lost_reason || '' : '');
    setLostCategory(p.lost_reason_category && p.lost_reason_category !== 'batal_setelah_dp' ? p.lost_reason_category : '');
    setConfirmClosing(false);
    setModalError(null);
    setIsStatusModalOpen(true);
  };

  const handleStatusSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedProspect || submitting) return;

    if (newStatus === 'tidak_lanjut' && !lostCategory) {
      setModalError('Pilih alasan tidak lanjut.');
      return;
    }
    if (newStatus === 'tidak_lanjut' && lostCategory === 'lainnya' && !lostReason.trim()) {
      setModalError('Jelaskan alasan untuk pilihan Lainnya.');
      return;
    }
    // Closing is final and books the agent commission: require a second, explicit click.
    if (newStatus === 'closing' && !confirmClosing) {
      setConfirmClosing(true);
      return;
    }

    try {
      setSubmitting(true);
      setModalError(null);
      await updateProspectStatus(
        selectedProspect.id,
        newStatus,
        newStatus === 'tidak_lanjut' ? lostReason.trim() || undefined : undefined,
        newStatus === 'tidak_lanjut' ? lostCategory : undefined
      );
      setIsStatusModalOpen(false);
      loadPage();
      loadSummary();
    } catch (err: any) {
      setModalError(err.message || 'Gagal memperbarui status');
      setConfirmClosing(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      await downloadProspectsCSV(filters);
    } catch (err: any) {
      setError(err.message || 'Gagal mengunduh CSV');
    }
  };

  const menuItems = getStandardMenuItems('prospects');
  // Closing an agent's prospect books commission only with a package that has a commission set.
  const closingCommissionGap = (() => {
    if (!selectedProspect?.agent_id) return null;
    const pkg = packages.find((p) => p.id === selectedProspect.package_id);
    if (!selectedProspect.package_id || !pkg) return 'Prospek ini belum punya paket';
    if (!pkg.commission_amount || pkg.commission_amount <= 0) return `Komisi paket ${pkg.name} belum diatur`;
    return null;
  })();
  const lostReasonSummary = Object.entries(summary.lost_reasons ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const hasActiveFilter =
    statusFilter !== 'all' ||
    packageFilter !== 'all' ||
    sourceFilter !== 'all' ||
    agentFilter !== 'all' ||
    payoffFilter !== 'all' ||
    departureFilter !== 'all' ||
    searchInput.trim() !== '';

  const columns: Column<ProspectItem>[] = [
    {
      key: 'id',
      label: 'ID',
      render: (row) => <span className="db-prospect-id-cell">#{String(row.id).padStart(4, '0')}</span>,
    },
    {
      key: 'name',
      label: 'PROSPEK',
      render: (row) => (
        <div className="db-prospect-person-info">
          <Link to={`/prospects/${row.id}`} className="db-prospect-name-link" title={`Buka detail prospek ${row.name}`}>
            {row.name}
          </Link>
          <span className="db-prospect-phone-sub">{row.phone}</span>
        </div>
      ),
    },
    {
      key: 'package',
      label: 'PAKET',
      render: (row) => (
        <div className="db-prospect-pkg-cell">
          <span className="db-prospect-pkg-name" title={row.package_name || 'Umroh'}>
            {row.package_name || 'Umroh'}
          </span>
          <span className="db-prospect-pkg-pax">
            {row.jumlah_jamaah && row.jumlah_jamaah > 0 ? `${row.jumlah_jamaah} jamaah` : '1 jamaah'}
            {row.departure_plan ? ` · ${formatDeparturePlan(row.departure_plan)}` : ''}
            {row.domicile ? ` · ${row.domicile}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'source_channel',
      label: 'SUMBER',
      render: (row) => (
        <div className="db-prospect-source-cell">
          <span className="db-prospect-source-label">{sourceLabel(row.source_channel)}</span>
          {row.agent_name && <span className="db-prospect-source-sub">{row.agent_name}</span>}
          {!row.agent_name && row.utm_campaign && <span className="db-prospect-source-sub">{row.utm_campaign}</span>}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'STATUS',
      render: (row) => (
        <div>
          <span className={`db-prospect-status-pill db-prospect-status-pill--${row.status}`}>
            <span className="db-prospect-status-pill__dot" />
            <span>{STATUS_LABELS[row.status] || row.status}</span>
          </span>
          {row.status === 'tidak_lanjut' && (row.lost_reason_category || row.lost_reason) && (
            <div className="db-prospect-lost-reason">
              {lostReasonCategoryLabel(row.lost_reason_category) || row.lost_reason}
              {row.lost_reason_category === 'lainnya' && row.lost_reason ? `: ${row.lost_reason}` : ''}
            </div>
          )}
          {row.status === 'closing' && (
            <div className={row.paid_off_at ? 'db-prospect-payoff db-prospect-payoff--done' : 'db-prospect-payoff'}>
              {row.paid_off_at ? 'Lunas' : 'DP, menunggu lunas'}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      label: 'TANGGAL',
      render: (row) => (
        <div className="db-prospect-date-cell">
          <span className="db-prospect-date-main">{formatDateWIB(row.created_at)}</span>
          <span className="db-prospect-date-time">{formatTimeWIB(row.created_at)}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'AKSI',
      render: (row) => (
        <div className="db-prospect-table-actions" onClick={(e) => e.stopPropagation()}>
          <div className="db-prospect-actions-wrapper">
            <button
              type="button"
              className={`db-prospect-action-btn ${activeDropdownId === row.id ? 'db-prospect-action-btn--active' : ''}`}
              onClick={() => setActiveDropdownId(activeDropdownId === row.id ? null : row.id)}
              aria-label={`Pilihan aksi prospek ${row.name}`}
              title="Pilihan Aksi"
            >
              <MoreVertical size={14} />
            </button>

            {activeDropdownId === row.id && (
              <div className="db-prospect-action-dropdown">
                <button
                  type="button"
                  className="db-prospect-dropdown-item"
                  onClick={() => {
                    setActiveDropdownId(null);
                    navigate(`/prospects/${row.id}`);
                  }}
                >
                  <Eye size={13} />
                  <span>Lihat Detail</span>
                </button>
                {!row.anonymized_at && (
                <button
                  type="button"
                  className="db-prospect-dropdown-item"
                  onClick={() => {
                    setActiveDropdownId(null);
                    navigate(`/prospects/${row.id}/edit`);
                  }}
                >
                  <Edit3 size={13} />
                  <span>Edit Data</span>
                </button>
                )}
                {row.anonymized_at && row.status !== 'closing' ? null : row.status !== 'closing' ? (
                  <button
                    type="button"
                    className="db-prospect-dropdown-item"
                    onClick={() => {
                      setActiveDropdownId(null);
                      handleOpenStatusModal(row);
                    }}
                  >
                    <RefreshCw size={13} />
                    <span>Ubah Status</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="db-prospect-dropdown-item"
                    onClick={() => {
                      setActiveDropdownId(null);
                      navigate(`/prospects/${row.id}`);
                    }}
                  >
                    <Lock size={13} />
                    <span>Kelola Closing (Lunas / Batal)</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ),
    },
  ];

  const pipeline = [
    { key: 'all', label: 'Semua', count: summary.total, Icon: ListFilter },
    { key: 'baru', label: 'Baru', count: summary.baru, Icon: PlusCircle },
    { key: 'dihubungi', label: 'Dihubungi', count: summary.dihubungi, Icon: PhoneCall },
    { key: 'tertarik', label: 'Tertarik', count: summary.tertarik, Icon: Sparkles },
    { key: 'closing', label: 'Closing', count: summary.closing, Icon: CheckCircle2 },
    { key: 'tidak_lanjut', label: 'Tidak lanjut', count: summary.tidak_lanjut, Icon: XCircle },
  ];

  return (
    <div className="db-main-layout">
      <Sidebar brandName="KlikUmroh.id" menuItems={menuItems} footerContent="KlikUmroh.id 1.0" />

      <div className="db-content-area">
        <Topbar
          title="Data Prospek"
          userName={currentUser?.name || 'Administrator'}
          userRole="Administrator"
          userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
        />

        <main className="db-page-container">
          <div className="db-prospects-page">
            <PageHeader
              title="Data Prospek Jamaah"
              subtitle="Pantau dan tindak lanjuti calon jamaah di setiap tahap pipeline."
              actions={
                <Button variant="primary" size="md" onClick={handleExportCSV}>
                  <Download size={15} />
                  <span>Ekspor CSV</span>
                </Button>
              }
            />

            {error && (
              <div className="db-alert db-alert--error">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* 1. Pipeline Summary Segmented Counters (whole tenant, independent of filters) */}
            <div className="db-prospects-pipeline-bar">
              {pipeline.map(({ key, label, count, Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`db-pipeline-segment ${statusFilter === key ? 'db-pipeline-segment--active' : ''}`}
                  onClick={() => selectStatus(key)}
                >
                  <Icon size={18} className={`db-pipeline-segment__icon db-pipeline-segment__icon--${key}`} />
                  <div className="db-pipeline-segment__copy">
                    <span className="db-pipeline-segment__count">{count}</span>
                    <span className="db-pipeline-segment__label">{label}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* 2. Follow-Up Urgent Notice Bar */}
            {summary.stale_baru > 0 && (
              <div className="db-prospect-notice">
                <div className="db-prospect-notice__left">
                  <Clock size={16} className="db-prospect-notice__icon" />
                  <span className="db-prospect-notice__text">
                    {summary.stale_baru} prospek baru belum dihubungi lebih dari 24 jam.
                  </span>
                </div>
                <button type="button" className="db-prospect-notice__action" onClick={() => selectStatus('baru')}>
                  <span>Lihat Prospek</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            )}

            {/* Closings (DP) waiting for "Tandai Lunas": the agent commission stays held until then. */}
            {summary.awaiting_payoff > 0 && (
              <div className="db-prospect-notice">
                <div className="db-prospect-notice__left">
                  <Clock size={16} className="db-prospect-notice__icon" />
                  <span className="db-prospect-notice__text">
                    {summary.awaiting_payoff} jamaah sudah DP dan menunggu ditandai lunas
                    {summary.awaiting_payoff_with_agent > 0
                      ? `, ${summary.awaiting_payoff_with_agent} di antaranya komisi agennya masih tertahan.`
                      : '.'}
                  </span>
                </div>
                <button
                  type="button"
                  className="db-prospect-notice__action"
                  onClick={() => {
                    setStatusFilter('all');
                    setPayoffFilter('pending');
                    setPage(1);
                  }}
                >
                  <span>Lihat Jamaah</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            )}

            {/* Why prospects were lost: one line of counts per category, biggest first. */}
            {lostReasonSummary.length > 0 && (
              <p className="db-prospect-lost-summary">
                <span className="db-prospect-lost-summary__title">Alasan Tidak Lanjut:</span>
                {lostReasonSummary.map(([category, count]) => (
                  <span key={category} className="db-prospect-lost-summary__item">
                    {lostReasonCategoryLabel(category)} <strong>{count}</strong>
                  </span>
                ))}
              </p>
            )}

            {/* 3. Main Data Table (server-side search, filter & pagination) */}
            <Table
              columns={columns}
              data={prospects}
              loading={loading}
              emptyMessage={hasActiveFilter ? 'Tidak ada prospek yang cocok dengan filter.' : 'Belum ada data prospek.'}
              searchPlaceholder="Cari nama, nomor WhatsApp, domisili, paket, atau agen..."
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              serverTotal={total}
              currentPage={page}
              onPageChange={setPage}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              filterSlot={
                <div className="db-prospect-toolbar-filters">
                  <FormInput
                    type="select"
                    value={statusFilter}
                    onChange={(e) => selectStatus(e.target.value)}
                    options={[{ value: 'all', label: 'Semua Status' }, ...STATUS_OPTIONS]}
                  />
                  <FormInput
                    type="select"
                    value={packageFilter}
                    onChange={(e) => applyFilter(setPackageFilter)(e.target.value)}
                    options={[
                      { value: 'all', label: 'Semua Paket' },
                      ...packages.map((pkg) => ({ value: String(pkg.id), label: pkg.name })),
                    ]}
                  />
                  <FormInput
                    type="select"
                    value={sourceFilter}
                    onChange={(e) => applyFilter(setSourceFilter)(e.target.value)}
                    options={[
                      { value: 'all', label: 'Semua Sumber' },
                      { value: 'organik', label: 'Organik' },
                      { value: 'paid', label: 'Meta Ads' },
                      { value: 'agen', label: 'Agen' },
                    ]}
                  />
                  <FormInput
                    type="select"
                    value={payoffFilter}
                    onChange={(e) => applyFilter(setPayoffFilter)(e.target.value)}
                    options={[
                      { value: 'all', label: 'Semua Pelunasan' },
                      { value: 'pending', label: 'DP, menunggu lunas' },
                      { value: 'done', label: 'Lunas' },
                    ]}
                  />
                  <FormInput
                    type="select"
                    value={departureFilter}
                    onChange={(e) => applyFilter(setDepartureFilter)(e.target.value)}
                    options={[
                      { value: 'all', label: 'Semua Rencana Berangkat' },
                      { value: 'none', label: 'Rencana belum diisi' },
                      ...departurePlanOptions().filter((o) => o.value !== ''),
                    ]}
                  />
                  <FormInput
                    type="select"
                    value={agentFilter}
                    onChange={(e) => applyFilter(setAgentFilter)(e.target.value)}
                    options={[
                      { value: 'all', label: 'Semua Agen' },
                      ...agents.map((ag) => ({ value: String(ag.id), label: ag.name })),
                    ]}
                  />
                  {hasActiveFilter && (
                    <button type="button" className="db-prospect-reset-btn" onClick={handleResetFilters} title="Reset Filter">
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              }
            />
          </div>
        </main>
      </div>

      {/* Change Status Modal */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Ubah Status Prospek"
        overflowVisible
        footer={
          <div className="db-prospect-modal-footer">
            <Button variant="secondary" size="md" onClick={() => setIsStatusModalOpen(false)} disabled={submitting}>
              Batal
            </Button>
            <Button variant="primary" size="md" onClick={() => handleStatusSubmit()} disabled={submitting}>
              {submitting
                ? 'Menyimpan...'
                : newStatus === 'closing'
                ? confirmClosing
                  ? 'Ya, Closing & Bukukan Komisi'
                  : 'Lanjutkan'
                : 'Simpan'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleStatusSubmit} className="db-prospect-modal-form">
          {modalError && (
            <div className="db-alert db-alert--error db-prospect-modal-alert">
              <span>{modalError}</span>
            </div>
          )}

          <div>
            <label className="db-prospect-modal-label">Status Baru</label>
            <FormInput
              type="select"
              value={newStatus}
              onChange={(e) => {
                setNewStatus(e.target.value);
                setConfirmClosing(false);
              }}
              options={STATUS_OPTIONS}
            />
          </div>

          {newStatus === 'tidak_lanjut' && (
            <div>
              <label className="db-prospect-modal-label">
                Alasan Tidak Lanjut <span className="db-prospect-required">*</span>
              </label>
              <FormInput
                type="select"
                value={lostCategory}
                onChange={(e) => setLostCategory(e.target.value)}
                options={[{ value: '', label: 'Pilih alasan' }, ...LOST_REASON_OPTIONS]}
              />
              <div className="db-prospect-modal-subfield">
                <FormInput
                  type="text"
                  placeholder={lostCategory === 'lainnya' ? 'Jelaskan alasannya (wajib)' : 'Keterangan tambahan (opsional)'}
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                />
              </div>
            </div>
          )}

          {newStatus === 'closing' && selectedProspect && (
            <div className={`db-prospect-closing-warning ${confirmClosing ? 'db-prospect-closing-warning--confirm' : ''}`}>
              <AlertTriangle size={16} />
              <span>
                {confirmClosing ? (
                  <>
                    Konfirmasi closing untuk <strong>{selectedProspect.name}</strong>: jamaah sudah membayar DP. Jika
                    jamaah batal nanti, gunakan Batalkan Closing di halaman detail.
                  </>
                ) : closingCommissionGap ? (
                  <>
                    Closing = jamaah sudah membayar DP. <strong>{closingCommissionGap}, jadi komisi agen tidak dibukukan.</strong>{' '}
                    Isi paket lewat Edit Data dulu jika agen berhak komisi.
                  </>
                ) : selectedProspect.agent_id ? (
                  'Closing = jamaah sudah membayar DP. Komisi agen langsung dibukukan dan tertahan sampai jamaah ditandai lunas.'
                ) : (
                  'Closing = jamaah sudah membayar DP.'
                )}
              </span>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
};
