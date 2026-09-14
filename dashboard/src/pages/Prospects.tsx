import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Download,
  RefreshCw,
  Edit3,
  AlertCircle,
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
  fetchProspects,
  fetchPackages,
  updateProspectStatus,
  downloadProspectsCSV,
  getStoredUser,
} from '../services/api';
import './Prospects.css';

export const ProspectsPage: React.FC = () => {
  const navigate = useNavigate();
  const [prospects, setProspects] = useState<ProspectItem[]>([]);
  const [allProspects, setAllProspects] = useState<ProspectItem[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [packageFilter, setPackageFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);

  // Status Change Modal State
  const [isStatusModalOpen, setIsStatusModalOpen] = useState<boolean>(false);
  const [selectedProspect, setSelectedProspect] = useState<ProspectItem | null>(null);
  const [newStatus, setNewStatus] = useState<string>('baru');
  const [lostReason, setLostReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const currentUser = getStoredUser();

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdownId(null);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Load all prospects once to populate accurate pipeline counters
  const loadAllForCounters = async () => {
    try {
      const allData = await fetchProspects({});
      setAllProspects(allData);
    } catch {
      // silently ignore
    }
  };

  // Load packages list for package filter dropdown
  const loadPackagesList = async () => {
    try {
      const pkgs = await fetchPackages();
      setPackages(pkgs);
    } catch {
      // silently ignore
    }
  };

  const loadData = async (status?: string, packageId?: string, source?: string, search?: string) => {
    try {
      setLoading(true);
      setError(null);
      const activeStatus = status !== undefined ? status : statusFilter;
      const activePackage = packageId !== undefined ? packageId : packageFilter;
      const activeSource = source !== undefined ? source : sourceFilter;
      const activeSearch = search !== undefined ? search : searchQuery;

      const data = await fetchProspects({
        status: activeStatus !== 'all' ? activeStatus : undefined,
        package_id: activePackage !== 'all' ? activePackage : undefined,
        source: activeSource !== 'all' ? activeSource : undefined,
        search: activeSearch.trim() || undefined,
      });
      setProspects(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data prospek');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadAllForCounters();
    loadPackagesList();
  }, []);

  const handleFilterSelect = (newStatusVal: string) => {
    setStatusFilter(newStatusVal);
    loadData(newStatusVal, packageFilter, sourceFilter, searchQuery);
  };

  const handleStatusDropdownChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setStatusFilter(val);
    loadData(val, packageFilter, sourceFilter, searchQuery);
  };

  const handlePackageFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPackageFilter(val);
    loadData(statusFilter, val, sourceFilter, searchQuery);
  };

  const handleSourceFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setSourceFilter(val);
    loadData(statusFilter, packageFilter, val, searchQuery);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    loadData(statusFilter, packageFilter, sourceFilter, val);
  };

  const handleResetFilters = () => {
    setStatusFilter('all');
    setPackageFilter('all');
    setSourceFilter('all');
    setSearchQuery('');
    loadData('all', 'all', 'all', '');
  };

  const handleOpenStatusModal = (p: ProspectItem) => {
    setSelectedProspect(p);
    setNewStatus(p.status);
    setLostReason(p.lost_reason || '');
    setModalError(null);
    setIsStatusModalOpen(true);
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProspect) return;

    if (newStatus === 'tidak_lanjut' && !lostReason.trim()) {
      setModalError('Alasan tidak lanjut wajib diisi.');
      return;
    }

    try {
      setSubmitting(true);
      setModalError(null);
      await updateProspectStatus(
        selectedProspect.id,
        newStatus,
        newStatus === 'tidak_lanjut' ? lostReason.trim() : undefined
      );
      setIsStatusModalOpen(false);
      loadData();
      loadAllForCounters();
    } catch (err: any) {
      setModalError(err.message || 'Gagal memperbarui status');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      await downloadProspectsCSV({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        package_id: packageFilter !== 'all' ? packageFilter : undefined,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
        search: searchQuery.trim() || undefined,
      });
    } catch (err: any) {
      setError(err.message || 'Gagal mengunduh CSV');
    }
  };

  const menuItems = getStandardMenuItems('prospects');

  // Pipeline Counters Calculation
  const counts = {
    all: allProspects.length,
    baru: allProspects.filter((p) => p.status === 'baru').length,
    dihubungi: allProspects.filter((p) => p.status === 'dihubungi').length,
    tertarik: allProspects.filter((p) => p.status === 'tertarik').length,
    closing: allProspects.filter((p) => p.status === 'closing').length,
    tidak_lanjut: allProspects.filter((p) => p.status === 'tidak_lanjut').length,
  };

  const now = new Date().getTime();
  const staleNewProspectsCount = allProspects.filter(
    (p) => p.status === 'baru' && now - new Date(p.created_at).getTime() >= 24 * 60 * 60 * 1000
  ).length;

  const columns: Column<ProspectItem>[] = [
    {
      key: 'id',
      label: 'ID',
      render: (row) => (
        <span style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 700, fontSize: '11px', color: 'var(--db-text-muted)' }}>
          #{String(row.id).padStart(4, '0')}
        </span>
      ),
    },
    {
      key: 'name',
      label: 'PROSPEK',
      render: (row) => (
        <div className="db-prospect-person-info">
          <Link
            to={`/prospects/${row.id}`}
            className="db-prospect-name-link"
            title={`Buka detail prospek ${row.name}`}
          >
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
          <span className="db-prospect-pkg-name" title={row.package_name || 'Umroh Reguler'}>
            {row.package_name || 'Umroh Reguler'}
          </span>
          <span className="db-prospect-pkg-pax">
            {row.jumlah_jamaah && row.jumlah_jamaah > 0 ? `${row.jumlah_jamaah} jamaah` : '1 jamaah'}
          </span>
        </div>
      ),
    },
    {
      key: 'source_channel',
      label: 'SUMBER',
      render: (row) => {
        let label = 'Organik';
        if (row.source_channel === 'agent' || row.source_channel === 'agen') label = 'Agen';
        else if (row.source_channel === 'paid' || row.source_channel === 'paid_ads' || row.source_channel === 'meta_ads') label = 'Meta Ads';

        return (
          <span style={{ fontFamily: 'Roboto, sans-serif', fontSize: '12px', fontWeight: 700, color: 'var(--db-text-primary)' }}>
            {label}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'STATUS',
      render: (row) => (
        <div>
          <span className={`db-prospect-status-pill db-prospect-status-pill--${row.status}`}>
            <span className="db-prospect-status-pill__dot" />
            <span>
              {row.status === 'baru'
                ? 'Baru'
                : row.status === 'dihubungi'
                ? 'Dihubungi'
                : row.status === 'tertarik'
                ? 'Tertarik'
                : row.status === 'closing'
                ? 'Closing'
                : 'Tidak Lanjut'}
            </span>
          </span>
          {row.status === 'tidak_lanjut' && row.lost_reason && (
            <div style={{ fontSize: '11px', color: 'var(--db-negative)', marginTop: '3px', maxWidth: '180px' }}>
              {row.lost_reason}
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
          <span className="db-prospect-date-main">
            {row.created_at
              ? new Date(row.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
              : '-'}
          </span>
          <span className="db-prospect-date-time">
            {row.created_at
              ? new Date(row.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
              : ''}
          </span>
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
                {row.status !== 'closing' ? (
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
                  <div
                    style={{
                      padding: '6px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--db-positive)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <Lock size={12} />
                    <span>Closing (Final)</span>
                  </div>
                )}
              </div>
            )}
          </div>
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

            {/* 1. Pipeline Summary Segmented Counters */}
            <div className="db-prospects-pipeline-bar">
              <button
                type="button"
                className={`db-pipeline-segment ${statusFilter === 'all' ? 'db-pipeline-segment--active' : ''}`}
                onClick={() => handleFilterSelect('all')}
              >
                <ListFilter size={18} className="db-pipeline-segment__icon db-pipeline-segment__icon--all" />
                <div className="db-pipeline-segment__copy">
                  <span className="db-pipeline-segment__count">{counts.all}</span>
                  <span className="db-pipeline-segment__label">Semua</span>
                </div>
              </button>

              <button
                type="button"
                className={`db-pipeline-segment ${statusFilter === 'baru' ? 'db-pipeline-segment--active' : ''}`}
                onClick={() => handleFilterSelect('baru')}
              >
                <PlusCircle size={18} className="db-pipeline-segment__icon db-pipeline-segment__icon--baru" />
                <div className="db-pipeline-segment__copy">
                  <span className="db-pipeline-segment__count">{counts.baru}</span>
                  <span className="db-pipeline-segment__label">Baru</span>
                </div>
              </button>

              <button
                type="button"
                className={`db-pipeline-segment ${statusFilter === 'dihubungi' ? 'db-pipeline-segment--active' : ''}`}
                onClick={() => handleFilterSelect('dihubungi')}
              >
                <PhoneCall size={18} className="db-pipeline-segment__icon db-pipeline-segment__icon--dihubungi" />
                <div className="db-pipeline-segment__copy">
                  <span className="db-pipeline-segment__count">{counts.dihubungi}</span>
                  <span className="db-pipeline-segment__label">Dihubungi</span>
                </div>
              </button>

              <button
                type="button"
                className={`db-pipeline-segment ${statusFilter === 'tertarik' ? 'db-pipeline-segment--active' : ''}`}
                onClick={() => handleFilterSelect('tertarik')}
              >
                <Sparkles size={18} className="db-pipeline-segment__icon db-pipeline-segment__icon--tertarik" />
                <div className="db-pipeline-segment__copy">
                  <span className="db-pipeline-segment__count">{counts.tertarik}</span>
                  <span className="db-pipeline-segment__label">Tertarik</span>
                </div>
              </button>

              <button
                type="button"
                className={`db-pipeline-segment ${statusFilter === 'closing' ? 'db-pipeline-segment--active' : ''}`}
                onClick={() => handleFilterSelect('closing')}
              >
                <CheckCircle2 size={18} className="db-pipeline-segment__icon db-pipeline-segment__icon--closing" />
                <div className="db-pipeline-segment__copy">
                  <span className="db-pipeline-segment__count">{counts.closing}</span>
                  <span className="db-pipeline-segment__label">Closing</span>
                </div>
              </button>

              <button
                type="button"
                className={`db-pipeline-segment ${statusFilter === 'tidak_lanjut' ? 'db-pipeline-segment--active' : ''}`}
                onClick={() => handleFilterSelect('tidak_lanjut')}
              >
                <XCircle size={18} className="db-pipeline-segment__icon db-pipeline-segment__icon--tidak_lanjut" />
                <div className="db-pipeline-segment__copy">
                  <span className="db-pipeline-segment__count">{counts.tidak_lanjut}</span>
                  <span className="db-pipeline-segment__label">Tidak lanjut</span>
                </div>
              </button>
            </div>

            {/* 2. Follow-Up Urgent Notice Bar */}
            {staleNewProspectsCount > 0 && (
              <div className="db-prospect-notice">
                <div className="db-prospect-notice__left">
                  <Clock size={16} className="db-prospect-notice__icon" />
                  <span className="db-prospect-notice__text">
                    {staleNewProspectsCount} prospek baru belum dihubungi lebih dari 24 jam.
                  </span>
                </div>
                <button
                  type="button"
                  className="db-prospect-notice__action"
                  onClick={() => handleFilterSelect('baru')}
                >
                  <span>Lihat Prospek</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            )}

            {/* 3. Main Data Table */}
            <Table
              columns={columns}
              data={prospects}
              loading={loading}
              emptyMessage="Belum ada data prospek."
              searchPlaceholder="Cari nama, nomor WhatsApp, atau paket..."
              searchValue={searchQuery}
              onSearchChange={handleSearchChange}
              filterSlot={
                <div className="db-prospect-toolbar-filters">
                  <FormInput
                    type="select"
                    value={statusFilter}
                    onChange={handleStatusDropdownChange}
                    options={[
                      { value: 'all', label: 'Semua Status' },
                      { value: 'baru', label: 'Baru' },
                      { value: 'dihubungi', label: 'Dihubungi' },
                      { value: 'tertarik', label: 'Tertarik' },
                      { value: 'closing', label: 'Closing' },
                      { value: 'tidak_lanjut', label: 'Tidak Lanjut' },
                    ]}
                  />
                  <FormInput
                    type="select"
                    value={packageFilter}
                    onChange={handlePackageFilterChange}
                    options={[
                      { value: 'all', label: 'Semua Paket' },
                      ...packages.map((pkg) => ({
                        value: String(pkg.id),
                        label: pkg.name,
                      })),
                    ]}
                  />
                  <FormInput
                    type="select"
                    value={sourceFilter}
                    onChange={handleSourceFilterChange}
                    options={[
                      { value: 'all', label: 'Semua Sumber' },
                      { value: 'organik', label: 'Organik' },
                      { value: 'meta_ads', label: 'Meta Ads' },
                      { value: 'agen', label: 'Agen' },
                    ]}
                  />
                  {(statusFilter !== 'all' || packageFilter !== 'all' || sourceFilter !== 'all' || searchQuery.trim() !== '') && (
                    <button
                      type="button"
                      className="db-prospect-reset-btn"
                      onClick={handleResetFilters}
                      title="Reset Filter"
                    >
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', width: '100%' }}>
            <Button variant="secondary" size="md" onClick={() => setIsStatusModalOpen(false)} disabled={submitting}>
              Batal
            </Button>
            <Button variant="primary" size="md" onClick={handleStatusSubmit} disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleStatusSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {modalError && (
            <div className="db-alert db-alert--error" style={{ padding: '8px 12px', fontSize: '13px' }}>
              <span>{modalError}</span>
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
              Status Baru
            </label>
            <FormInput
              type="select"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              options={[
                { value: 'baru', label: 'Baru' },
                { value: 'dihubungi', label: 'Dihubungi' },
                { value: 'tertarik', label: 'Tertarik' },
                { value: 'closing', label: 'Closing' },
                { value: 'tidak_lanjut', label: 'Tidak Lanjut' },
              ]}
            />
          </div>

          {newStatus === 'tidak_lanjut' && (
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                Alasan Tidak Lanjut <span style={{ color: 'var(--db-negative)' }}>*</span>
              </label>
              <FormInput
                type="text"
                placeholder="Contoh: Menunda keberangkatan, memilih travel lain"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
              />
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
};
