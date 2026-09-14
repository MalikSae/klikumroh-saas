import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ReceiptText,
  RotateCcw,
  Wallet,
  TrendingUp,
  TrendingDown,
  Search,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Card,
  Button,
  Badge,
  CustomDropdown,
  getStandardMenuItems,
} from '../components';
import {
  type AgentDashboardDetail,
  type CommissionHistoryItem,
  fetchAgentDetail,
  fetchAgentCommissions,
  getStoredUser,
} from '../services/api';

const formatRupiah = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.abs(val));
};

const formatTime = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return (
      d.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      }) + ' WIB'
    );
  } catch {
    return '';
  }
};

const getDateKey = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return dateStr;
  }
};

const formatDateHeader = (key: string): string => {
  try {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (key === todayKey) {
      return 'Hari Ini';
    }
    if (key === yesterdayKey) {
      return 'Kemarin';
    }

    const [year, month, day] = key.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return key;
  }
};

export const AgentCommissionsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const agentId = id ? parseInt(id, 10) : 0;

  const [agent, setAgent] = useState<AgentDashboardDetail | null>(null);
  const [items, setItems] = useState<CommissionHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const currentUser = getStoredUser();

  const loadData = async () => {
    if (!agentId || isNaN(agentId)) {
      setError('ID Agen tidak valid');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [agentData, commissionsData] = await Promise.all([
        fetchAgentDetail(agentId),
        fetchAgentCommissions(agentId),
      ]);
      setAgent(agentData);
      setItems(commissionsData);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Gagal memuat data riwayat komisi');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [agentId]);

  // Total summary metrics
  const summary = useMemo(() => {
    let totalMasuk = 0;
    let totalKeluar = 0;

    items.forEach((item) => {
      if (item.direction === 'masuk') {
        totalMasuk += item.amount;
      } else if (item.direction === 'keluar' && item.status !== 'rejected') {
        totalKeluar += item.amount;
      }
    });

    return {
      totalMasuk,
      totalKeluar,
      saldoSiapCair: agent?.saldo_siap_cair ?? 0,
      saldoTertunda: agent?.saldo_tertunda ?? 0,
    };
  }, [items, agent]);

  // Filtered items
  const filteredItems = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return items.filter((item) => {
      const itemDate = new Date(item.created_at);

      // Period Filter
      if (periodFilter === 'today') {
        if (itemDate < todayStart) return false;
      } else if (periodFilter === '7days') {
        const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (itemDate < sevenDaysAgo) return false;
      } else if (periodFilter === '30days') {
        const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (itemDate < thirtyDaysAgo) return false;
      } else if (periodFilter === 'this_month') {
        if (
          itemDate.getFullYear() !== now.getFullYear() ||
          itemDate.getMonth() !== now.getMonth()
        ) {
          return false;
        }
      }

      // Type Filter
      if (typeFilter !== 'all') {
        if (item.type !== typeFilter) return false;
      }

      // Direction Filter
      if (directionFilter !== 'all') {
        if (item.direction !== directionFilter) return false;
      }

      // Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const descMatch = item.description.toLowerCase().includes(q);
        const amountMatch = item.amount.toString().includes(q);
        if (!descMatch && !amountMatch) return false;
      }

      return true;
    });
  }, [items, periodFilter, typeFilter, directionFilter, searchQuery]);

  // Group items by date key (YYYY-MM-DD) preserving DESC order
  const groupedItems = useMemo(() => {
    const groups: { dateKey: string; list: CommissionHistoryItem[] }[] = [];
    const map = new Map<string, CommissionHistoryItem[]>();

    filteredItems.forEach((item) => {
      const key = getDateKey(item.created_at);
      if (!map.has(key)) {
        const list: CommissionHistoryItem[] = [];
        map.set(key, list);
        groups.push({ dateKey: key, list });
      }
      map.get(key)!.push(item);
    });

    return groups;
  }, [filteredItems]);

  const hasActiveFilters =
    periodFilter !== 'all' ||
    typeFilter !== 'all' ||
    directionFilter !== 'all' ||
    Boolean(searchQuery.trim());

  const resetFilters = () => {
    setPeriodFilter('all');
    setTypeFilter('all');
    setDirectionFilter('all');
    setSearchQuery('');
  };

  const menuItems = getStandardMenuItems('agents');

  if (loading) {
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
            userInitial={currentUser?.name?.slice(0, 2).toUpperCase() || 'AD'}
          />
          <main className="db-page-container" style={{ maxWidth: '1400px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '320px', color: 'var(--db-text-muted)', gap: '10px' }}>
              <RefreshCw size={24} className="db-spin" />
              <span style={{ fontSize: '15px' }}>Memuat riwayat komisi...</span>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="db-main-layout">
      {/* SIDEBAR */}
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={menuItems}
        footerContent="KlikUmroh.id 1.0"
      />

      {/* MAIN CONTENT AREA */}
      <div className="db-content-area">
        {/* TOPBAR */}
        <Topbar
          userName={currentUser?.name || 'Administrator'}
          userRole="Administrator"
          userInitial={currentUser?.name?.slice(0, 2).toUpperCase() || 'AD'}
        />

        {/* CONTENT WRAPPER */}
        <main className="db-page-container" style={{ maxWidth: '1400px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* BACK LINK & TITLE */}
          <PageHeader
            title={agent ? `Riwayat Komisi — ${agent.name}` : 'Riwayat Komisi Agen'}
            subtitle="Catatan lengkap seluruh transaksi mutasi komisi masuk dan penarikan saldo dana agen."
            backButton={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/agents/${agentId}`)}
                style={{
                  width: '36px',
                  height: '36px',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-md)',
                  flexShrink: 0,
                }}
                aria-label="Kembali ke Detail Agen"
                title="Kembali ke Detail Agen"
              >
                <ArrowLeft size={18} />
              </Button>
            }
          />

          {/* ERROR STATE */}
          {error && (
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--db-chart-area-fill)',
                border: '1px solid var(--db-negative)',
                color: 'var(--db-negative)',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{error}</span>
              <Button type="button" variant="secondary" size="sm" onClick={loadData}>
                <RotateCcw size={14} />
                <span>Coba Lagi</span>
              </Button>
            </div>
          )}

          {/* SUMMARY CARDS */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {/* Total Komisi Masuk */}
            <div
              style={{
                padding: '18px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--db-border)',
                backgroundColor: 'var(--db-card-bg)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--db-positive)', marginBottom: '8px' }}>
                <TrendingUp size={18} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Total Komisi Masuk</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--db-text-primary)' }}>
                {formatRupiah(summary.totalMasuk)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginTop: '4px' }}>
                Akumulasi komisi direct, override & koreksi
              </div>
            </div>

            {/* Total Pencairan Keluar */}
            <div
              style={{
                padding: '18px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--db-border)',
                backgroundColor: 'var(--db-card-bg)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--db-negative)', marginBottom: '8px' }}>
                <TrendingDown size={18} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Total Pencairan Keluar</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--db-text-primary)' }}>
                {formatRupiah(summary.totalKeluar)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginTop: '4px' }}>
                Total dana yang telah diajukan / dicairkan
              </div>
            </div>

            {/* Saldo Siap Cair */}
            <div
              style={{
                padding: '18px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--db-border)',
                backgroundColor: 'var(--db-card-bg)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--db-accent-teal)', marginBottom: '8px' }}>
                <Wallet size={18} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Saldo Siap Cair</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--db-positive)' }}>
                {formatRupiah(summary.saldoSiapCair)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--db-text-muted)', marginTop: '4px' }}>
                Saldo tersedia saat ini
              </div>
            </div>
          </div>

          {/* MAIN FILTER & LIST SECTION */}
          <Card
            title="Mutasi Transaksi Komisi"
            subtitle={`Menampilkan ${filteredItems.length} dari total ${items.length} transaksi.`}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* FILTER CONTROLS BAR */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                  paddingBottom: '16px',
                  borderBottom: '1px solid var(--db-border)',
                }}
              >
                {/* Search Input */}
                <div style={{ flex: '1 1 200px', position: 'relative' }}>
                  <Search
                    size={16}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--db-text-muted)',
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari deskripsi / nominal..."
                    style={{
                      width: '100%',
                      height: '38px',
                      paddingLeft: '36px',
                      paddingRight: searchQuery ? '32px' : '12px',
                      fontSize: '13px',
                      border: '1px solid var(--db-border)',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--db-page-bg)',
                      color: 'var(--db-text-primary)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--db-text-muted)',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                      aria-label="Hapus pencarian"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Filter Periode */}
                <div style={{ width: '170px', flexShrink: 0 }}>
                  <CustomDropdown
                    value={periodFilter}
                    options={[
                      { value: 'all', label: 'Semua Periode' },
                      { value: 'today', label: 'Hari Ini' },
                      { value: '7days', label: '7 Hari Terakhir' },
                      { value: '30days', label: '30 Hari Terakhir' },
                      { value: 'this_month', label: 'Bulan Ini' },
                    ]}
                    onChange={(e) => setPeriodFilter(String(e.target.value))}
                  />
                </div>

                {/* Filter Tipe Komisi */}
                <div style={{ width: '180px', flexShrink: 0 }}>
                  <CustomDropdown
                    value={typeFilter}
                    options={[
                      { value: 'all', label: 'Semua Tipe Komisi' },
                      { value: 'direct', label: 'Komisi Direct' },
                      { value: 'override', label: 'Komisi Override' },
                      { value: 'correction', label: 'Koreksi Komisi' },
                      { value: 'payout', label: 'Pencairan Dana' },
                    ]}
                    onChange={(e) => setTypeFilter(String(e.target.value))}
                  />
                </div>

                {/* Filter Arah Transaksi */}
                <div style={{ width: '160px', flexShrink: 0 }}>
                  <CustomDropdown
                    value={directionFilter}
                    options={[
                      { value: 'all', label: 'Semua Arah' },
                      { value: 'masuk', label: 'Masuk (+)' },
                      { value: 'keluar', label: 'Keluar (-)' },
                    ]}
                    onChange={(e) => setDirectionFilter(String(e.target.value))}
                  />
                </div>

                {/* Reset Filters Button */}
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={resetFilters}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      height: '38px',
                      padding: '0 12px',
                    }}
                  >
                    <RotateCcw size={14} />
                    <span>Reset Filter</span>
                  </Button>
                )}
              </div>

              {/* EMPTY FILTER STATE */}
              {!loading && filteredItems.length === 0 && (
                <div
                  style={{
                    padding: '48px 16px',
                    textAlign: 'center',
                    backgroundColor: 'var(--db-page-bg)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--db-border)',
                    color: 'var(--db-text-muted)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <ReceiptText size={32} style={{ color: 'var(--db-text-muted)', opacity: 0.5 }} />
                  <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--db-text-primary)' }}>
                    {hasActiveFilters ? 'Tidak Ada Mutasi yang Sesuai' : 'Belum Ada Riwayat Komisi'}
                  </span>
                  <p style={{ fontSize: '13px', margin: 0, maxWidth: '340px', lineHeight: 1.5 }}>
                    {hasActiveFilters
                      ? 'Tidak ada data transaksi yang cocok dengan filter yang Anda tentukan. Silakan ubah filter pencarian.'
                      : 'Agen ini belum memiliki riwayat komisi masuk dari prospek closing ataupun pengajuan pencairan dana.'}
                  </p>
                  {hasActiveFilters && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={resetFilters}
                      style={{ marginTop: '6px' }}
                    >
                      <RotateCcw size={14} />
                      <span>Kembalikan Semua Filter</span>
                    </Button>
                  )}
                </div>
              )}

              {/* TRANSACTION GROUPS */}
              {!loading &&
                filteredItems.length > 0 &&
                groupedItems.map((group) => (
                  <div key={group.dateKey} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Date Header */}
                    <div style={{ padding: '0 2px' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--db-text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                        }}
                      >
                        {formatDateHeader(group.dateKey)}
                      </span>
                    </div>

                    {/* Group Card */}
                    <div
                      style={{
                        border: '1px solid var(--db-border)',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--db-card-bg)',
                        overflow: 'hidden',
                      }}
                    >
                      {group.list.map((tx, idx) => {
                        const isPayout = tx.type === 'payout';
                        const isRejected = isPayout && tx.status === 'rejected';
                        const isIncoming = tx.direction === 'masuk';

                        return (
                          <div
                            key={`${tx.source}-${tx.id}`}
                            style={{
                              padding: '12px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '12px',
                              borderBottom:
                                idx < group.list.length - 1 ? '1px solid var(--db-border)' : 'none',
                              opacity: isRejected ? 0.6 : 1,
                            }}
                          >
                            {/* Left: Direction Icon & Details */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
                              <div
                                style={{
                                  marginTop: '2px',
                                  flexShrink: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {isIncoming ? (
                                  <ArrowDownLeft size={18} color="var(--db-positive)" />
                                ) : isRejected ? (
                                  <ArrowUpRight size={18} color="var(--db-text-muted)" />
                                ) : (
                                  <ArrowUpRight size={18} color="var(--db-negative)" />
                                )}
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                                <span
                                  style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: isRejected
                                      ? 'var(--db-text-muted)'
                                      : 'var(--db-text-primary)',
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {tx.description}
                                </span>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--db-text-muted)' }}>
                                    {formatTime(tx.created_at)}
                                  </span>

                                  {/* Type Tag */}
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      color: 'var(--db-text-muted)',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      backgroundColor: 'var(--db-chart-area-fill)',
                                    }}
                                  >
                                    {tx.type === 'direct' && 'Direct'}
                                    {tx.type === 'override' && 'Override'}
                                    {tx.type === 'correction' && 'Koreksi'}
                                    {tx.type === 'payout' && 'Pencairan'}
                                  </span>

                                  {/* Payout Status Badges */}
                                  {isPayout && tx.status === 'pending' && (
                                    <Badge variant="neutral">
                                      <span>Diproses</span>
                                    </Badge>
                                  )}
                                  {isPayout && tx.status === 'approved' && (
                                    <Badge variant="neutral">
                                      <span>Disetujui</span>
                                    </Badge>
                                  )}
                                  {isPayout && tx.status === 'paid' && (
                                    <Badge variant="positive">
                                      <span>Selesai</span>
                                    </Badge>
                                  )}
                                  {isPayout && tx.status === 'rejected' && (
                                    <Badge variant="negative">
                                      <span>Ditolak</span>
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Nominal */}
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <span
                                style={{
                                  fontSize: '14px',
                                  fontWeight: 700,
                                  fontVariantNumeric: 'tabular-nums',
                                  color: isRejected
                                    ? 'var(--db-text-muted)'
                                    : isIncoming
                                      ? 'var(--db-positive)'
                                      : 'var(--db-negative)',
                                }}
                              >
                                {isRejected
                                  ? formatRupiah(tx.amount)
                                  : isIncoming
                                    ? `+ ${formatRupiah(tx.amount)}`
                                    : `- ${formatRupiah(tx.amount)}`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default AgentCommissionsPage;
