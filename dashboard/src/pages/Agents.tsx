import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Search,
  ChevronDown,
  ChevronRight,
  Download,
  CheckCircle2,
  XCircle,
  Eye,
  AlertCircle,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ExternalLink,
  ArrowUpRight,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Button,
  Badge,
  Modal,
  Table,
  getStandardMenuItems,
  type Column,
} from '../components';
import {
  type AgentItem,
  type PayoutRequestItem,
  type ProspectItem,
  type PackageItem,
  fetchDashboardAgents,
  approveAgent,
  rejectAgent,
  fetchPayoutRequests,
  approvePayoutRequest,
  markPayoutRequestPaid,
  rejectPayoutRequest,
  fetchProspects,
  fetchPackages,
  getFullImageUrl,
  getStoredUser,
} from '../services/api';
import './Agents.css';

export const AgentsPage: React.FC = () => {
  const location = useLocation();

  const getTabFromPath = (): 'pending' | 'all' | 'payouts' => {
    if (location.pathname.includes('/agents/all')) return 'all';
    if (location.pathname.includes('/agents/payouts')) return 'payouts';
    return 'pending';
  };

  const activeTab = getTabFromPath();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [prospects, setProspects] = useState<ProspectItem[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // All Agents specific state (Search, Filter, Pagination)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'new_this_month'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 7;
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Modal Proof of Payment
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentItem | null>(null);

  // Confirmation Modal for Agent Approval / Rejection
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'approve' | 'reject';
    agent: AgentItem;
  } | null>(null);

  // Confirmation Modal for Payout Approval / Paid
  const [confirmPayoutModal, setConfirmPayoutModal] = useState<{
    isOpen: boolean;
    type: 'approve' | 'paid';
    request: PayoutRequestItem;
  } | null>(null);

  // Rejection Modal for Payout
  const [rejectPayoutModal, setRejectPayoutModal] = useState<{
    isOpen: boolean;
    request: PayoutRequestItem;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [agentRejectionReason, setAgentRejectionReason] = useState<string>('');
  const [packages, setPackages] = useState<PackageItem[]>([]);

  const currentUser = getStoredUser();

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      if (activeTab === 'payouts') {
        const pData = await fetchPayoutRequests();
        setPayouts(Array.isArray(pData) ? pData : []);
      } else if (activeTab === 'all') {
        const [agentData, prospectData, packageData] = await Promise.all([
          fetchDashboardAgents(undefined),
          fetchProspects().catch(() => []),
          fetchPackages().catch(() => []),
        ]);
        setAgents(Array.isArray(agentData) ? agentData : []);
        setProspects(Array.isArray(prospectData) ? prospectData : []);
        setPackages(Array.isArray(packageData) ? packageData : []);
      } else {
        const data = await fetchDashboardAgents('pending');
        setAgents(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setCurrentPage(1);
    setSearchQuery('');
    setStatusFilter('all');
  }, [activeTab]);

  // Actions for Pending Tab
  const executeApprove = async (agent: AgentItem) => {
    try {
      setActionLoading(agent.id);
      setErrorMessage(null);
      await approveAgent(agent.id);
      setSuccessMessage(`Agen "${agent.name}" berhasil disetujui dan diaktifkan.`);
      setConfirmModal(null);
      if (selectedProofUrl) {
        setSelectedProofUrl(null);
        setSelectedAgent(null);
      }
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyetujui agen');
    } finally {
      setActionLoading(null);
    }
  };

  const executeReject = async (agent: AgentItem) => {
    try {
      setActionLoading(agent.id);
      setErrorMessage(null);
      await rejectAgent(agent.id, agentRejectionReason.trim());
      setSuccessMessage(`Pendaftaran agen "${agent.name}" telah ditolak.`);
      setConfirmModal(null);
      setAgentRejectionReason('');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menolak agen');
    } finally {
      setActionLoading(null);
    }
  };

  // Actions for Payouts Tab
  const executeApprovePayout = async (req: PayoutRequestItem) => {
    try {
      setActionLoading(req.id);
      setErrorMessage(null);
      await approvePayoutRequest(req.id);
      setSuccessMessage(`Pengajuan pencairan Rp ${Number(req.amount_requested).toLocaleString('id-ID')} untuk agen "${req.agent_name || req.agent_id}" berhasil disetujui.`);
      setConfirmPayoutModal(null);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyetujui pencairan');
    } finally {
      setActionLoading(null);
    }
  };

  const executeMarkPayoutPaid = async (req: PayoutRequestItem) => {
    try {
      setActionLoading(req.id);
      setErrorMessage(null);
      await markPayoutRequestPaid(req.id);
      setSuccessMessage(`Pencairan Rp ${Number(req.amount_requested).toLocaleString('id-ID')} untuk agen "${req.agent_name || req.agent_id}" telah ditandai sudah ditransfer.`);
      setConfirmPayoutModal(null);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menandai pencairan');
    } finally {
      setActionLoading(null);
    }
  };

  const executeRejectPayout = async (req: PayoutRequestItem) => {
    if (!rejectionReason.trim()) {
      setErrorMessage('Alasan penolakan wajib diisi');
      return;
    }
    try {
      setActionLoading(req.id);
      setErrorMessage(null);
      await rejectPayoutRequest(req.id, rejectionReason.trim());
      setSuccessMessage(`Pengajuan pencairan untuk agen "${req.agent_name || req.agent_id}" telah ditolak.`);
      setRejectPayoutModal(null);
      setRejectionReason('');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menolak pengajuan pencairan');
    } finally {
      setActionLoading(null);
    }
  };

  // Helper: check if date is within current month
  const isThisMonth = (dateStr?: string | null): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  // Helper: calculate stats per agent from prospects data
  const getAgentStats = (agentId: number) => {
    const agentProspects = prospects.filter((p) => p.agent_id === agentId);
    const count = agentProspects.length;
    const closingProspects = agentProspects.filter((p) => p.status === 'closing');
    const closing = closingProspects.length;

    // Dynamic commission calculation based on package commission rate
    const totalCommission = closingProspects.reduce((acc, p) => {
      const pkg = packages.find((pk) => pk.id === p.package_id);
      const rate = pkg && typeof pkg.commission_amount === 'number' && pkg.commission_amount > 0
        ? pkg.commission_amount
        : 0;
      return acc + (rate * (p.jumlah_jamaah || 1));
    }, 0);
    const commissionFormatted = totalCommission > 0 ? `Rp ${totalCommission.toLocaleString('id-ID')}` : 'Rp 0';

    return {
      prospects: count,
      closing,
      commission: totalCommission,
      commissionFormatted,
    };
  };

  // Helper: relative activity formatting
  const formatRelativeActivity = (dateStr?: string | null): { text: string; isStale: boolean } => {
    if (!dateStr) return { text: '-', isStale: false };
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 60) {
      return { text: `${Math.max(1, diffMinutes)} menit lalu`, isStale: false };
    }
    if (diffHours < 24) {
      return { text: `${diffHours} jam lalu`, isStale: false };
    }
    if (diffDays === 1) {
      return { text: 'Kemarin', isStale: false };
    }
    if (diffDays <= 6) {
      return { text: `${diffDays} hari lalu`, isStale: false };
    }
    return { text: `${diffDays} hari lalu`, isStale: diffDays >= 14 };
  };

  // Helper: avatar initial generator
  const getInitials = (name: string): string => {
    if (!name) return 'AG';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const total = agents.length;
    const active = agents.filter((a) => a.status === 'active').length;
    const inactive = agents.filter((a) => a.status !== 'active').length;
    const newThisMonth = agents.filter((a) => isThisMonth(a.created_at)).length;
    return { total, active, inactive, newThisMonth };
  }, [agents]);

  // Filtered Agents for "Semua Agen"
  const filteredAgents = useMemo(() => {
    let result = [...agents];

    // Status filter
    if (statusFilter === 'active') {
      result = result.filter((a) => a.status === 'active');
    } else if (statusFilter === 'inactive') {
      result = result.filter((a) => a.status !== 'active');
    } else if (statusFilter === 'new_this_month') {
      result = result.filter((a) => isThisMonth(a.created_at));
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.phone && a.phone.toLowerCase().includes(q)) ||
          a.referral_code.toLowerCase().includes(q) ||
          (a.domisili && a.domisili.toLowerCase().includes(q)) ||
          (a.email && a.email.toLowerCase().includes(q))
      );
    }

    return result;
  }, [agents, statusFilter, searchQuery]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredAgents.length / itemsPerPage));
  const paginatedAgents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAgents.slice(start, start + itemsPerPage);
  }, [filteredAgents, currentPage]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'ID',
      'Nama Agen',
      'Kode Referral',
      'WhatsApp',
      'Email',
      'Domisili',
      'Status',
      'Total Prospek',
      'Closing',
      'Total Komisi',
      'Tanggal Daftar',
    ];

    const sanitize = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val).replace(/"/g, '""');
      if (/^[=+\-@]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str}"`;
    };

    const rows = filteredAgents.map((a) => {
      const stats = getAgentStats(a.id);
      return [
        sanitize(a.id),
        sanitize(a.name),
        sanitize(a.referral_code),
        sanitize(a.phone || '-'),
        sanitize(a.email || '-'),
        sanitize(a.domisili || '-'),
        sanitize(a.status === 'active' ? 'Aktif' : 'Nonaktif'),
        sanitize(stats.prospects),
        sanitize(stats.closing),
        sanitize(stats.commissionFormatted),
        sanitize(a.created_at ? new Date(a.created_at).toLocaleDateString('id-ID') : '-'),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `semua-agen-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const menuItems = getStandardMenuItems('agents-' + activeTab);

  // Columns for Pending Approval Tab
  const pendingColumns: Column<AgentItem>[] = [
    {
      key: 'name',
      label: 'Calon Agen',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--db-chart-area-fill)',
              color: 'var(--db-primary-button)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 'var(--font-size-base)',
              flexShrink: 0,
              overflow: 'hidden',
              border: '1px solid var(--db-border)',
            }}
          >
            {row.photo_url ? (
              <img
                src={getFullImageUrl(row.photo_url)}
                alt={row.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              getInitials(row.name)
            )}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--db-text-primary)', fontSize: 'var(--font-size-base)' }}>
              {row.name}
            </div>
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--db-text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '2px',
              }}
            >
              <MapPin size={12} />
              <span>{row.domisili || 'Domisili belum diisi'}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      label: 'Kontak',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {row.phone ? (
            <a
              href={`https://wa.me/${row.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--db-text-primary)',
                fontWeight: 500,
                textDecoration: 'none',
              }}
              title="Hubungi via WhatsApp"
            >
              <Phone size={13} style={{ color: 'var(--db-positive)' }} />
              <span>{row.phone}</span>
            </a>
          ) : (
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--db-text-muted)' }}>-</span>
          )}
          {row.email && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--db-text-muted)',
              }}
            >
              <Mail size={12} />
              <span>{row.email}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'payment_status',
      label: 'Status Pembayaran',
      render: (row) => {
        if (row.payment_status === 'pending_verification') {
          return (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Badge variant="positive">
                <span>Sudah Transfer</span>
              </Badge>
              {row.payment_proof_url && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProofUrl(row.payment_proof_url || null);
                    setSelectedAgent(row);
                  }}
                  title="Lihat bukti transfer pembayaran"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    color: 'var(--db-primary-button)',
                    backgroundColor: 'var(--db-chart-area-fill)',
                    border: '1px solid var(--db-border)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.2,
                  }}
                >
                  <Eye size={13} />
                  <span>Lihat Bukti</span>
                </button>
              )}
            </div>
          );
        }

        if (row.payment_status === 'awaiting_proof') {
          return (
            <Badge variant="neutral">
              <span>Belum Upload Bukti</span>
            </Badge>
          );
        }

        if (row.payment_status === 'verified') {
          return (
            <Badge variant="positive">
              <span>Terverifikasi</span>
            </Badge>
          );
        }

        return (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--db-text-muted)', fontWeight: 500 }}>
            Mode Gratis
          </span>
        );
      },
    },
    {
      key: 'referral_code',
      label: 'Kode Referral',
      render: (row) => (
        <code
          style={{
            backgroundColor: 'var(--db-chart-area-fill)',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700,
            fontFamily: 'monospace',
            color: 'var(--db-text-primary)',
            letterSpacing: '0.5px',
          }}
        >
          {row.referral_code}
        </code>
      ),
    },
    {
      key: 'actions',
      label: 'Aksi',
      render: (row) => {
        const isActionDisabled = actionLoading === row.id;

        return (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setConfirmModal({ isOpen: true, type: 'approve', agent: row })}
              disabled={isActionDisabled}
            >
              <CheckCircle2 size={14} />
              <span>{isActionDisabled ? 'Proses...' : 'Setujui'}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmModal({ isOpen: true, type: 'reject', agent: row })}
              disabled={isActionDisabled}
            >
              <XCircle size={14} />
              <span>Tolak</span>
            </Button>
          </div>
        );
      },
    },
  ];

  // Columns for Payouts Tab
  const payoutColumns: Column<PayoutRequestItem>[] = [
    {
      key: 'agent_name',
      label: 'Nama Agen',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--db-chart-area-fill)',
              color: 'var(--db-primary-button)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 'var(--font-size-base)',
              flexShrink: 0,
            }}
          >
            {getInitials(row.agent_name || 'Agen')}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--db-text-primary)', fontSize: 'var(--font-size-base)' }}>
              {row.agent_name || `Agen #${row.agent_id}`}
            </div>
            {row.agent_phone && (
              <a
                href={`https://wa.me/${row.agent_phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--db-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '2px',
                  textDecoration: 'none',
                }}
              >
                <Phone size={11} style={{ color: 'var(--db-positive)' }} />
                <span>{row.agent_phone}</span>
              </a>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'amount_requested',
      label: 'Nominal Pencairan',
      render: (row) => (
        <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--db-text-primary)' }}>
          Rp {Number(row.amount_requested).toLocaleString('id-ID')}
        </div>
      ),
    },
    {
      key: 'bank_info',
      label: 'Rekening Tujuan',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: 'var(--font-size-sm)' }}>
          <span style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>
            {row.bank_name_snapshot}
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)', color: 'var(--db-text-secondary)' }}>
            {row.bank_account_number_snapshot}
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--db-text-muted)' }}>
            a.n. {row.bank_account_holder_snapshot}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => {
        if (row.status === 'pending') {
          return <Badge variant="neutral"><span>Menunggu Persetujuan</span></Badge>;
        }
        if (row.status === 'approved') {
          return <Badge variant="positive"><span>Disetujui</span></Badge>;
        }
        if (row.status === 'paid') {
          return <Badge variant="positive"><span>Sudah Ditransfer</span></Badge>;
        }
        if (row.status === 'rejected') {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
              <Badge variant="negative"><span>Ditolak</span></Badge>
              {row.rejection_reason && (
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--db-text-muted)', maxWidth: '180px', wordBreak: 'break-word' }}>
                  Alasan: {row.rejection_reason}
                </span>
              )}
            </div>
          );
        }
        return <Badge variant="neutral"><span>{row.status}</span></Badge>;
      },
    },
    {
      key: 'created_at',
      label: 'Tanggal Pengajuan',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-sm)', color: 'var(--db-text-muted)' }}>
          <Calendar size={14} />
          <span>
            {row.created_at
              ? new Date(row.created_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '-'}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Aksi',
      render: (row) => {
        const isActionDisabled = actionLoading === row.id;

        if (row.status === 'pending') {
          return (
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setConfirmPayoutModal({ isOpen: true, type: 'approve', request: row })}
                disabled={isActionDisabled}
              >
                <CheckCircle2 size={14} />
                <span>Setujui</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setRejectPayoutModal({ isOpen: true, request: row });
                  setRejectionReason('');
                }}
                disabled={isActionDisabled}
              >
                <XCircle size={14} />
                <span>Tolak</span>
              </Button>
            </div>
          );
        }

        if (row.status === 'approved') {
          return (
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setConfirmPayoutModal({ isOpen: true, type: 'paid', request: row })}
                disabled={isActionDisabled}
              >
                <ArrowUpRight size={14} />
                <span>Tandai Dibayar</span>
              </Button>
            </div>
          );
        }

        return <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--db-text-muted)' }}>-</span>;
      },
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
          userInitial={currentUser?.name?.slice(0, 2).toUpperCase() || 'AD'}
        />

        <main className="db-page-container" style={{ maxWidth: '1400px' }}>
          {successMessage && (
            <div className="db-alert db-alert--success" style={{ marginBottom: '16px' }}>
              <CheckCircle2 size={18} />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="db-alert db-alert--error" style={{ marginBottom: '16px' }}>
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* =================================================================
              TAB: SEMUA AGEN (Exact Matching Mockup Redesign)
              ================================================================= */}
          {activeTab === 'all' && (
            <div className="agents-container">
              {/* Page Header */}
              <div className="agents-page-header">
                <div className="agents-heading-copy">
                  <h1 className="agents-title">Semua Agen</h1>
                  <p className="agents-description">
                    Kelola status akun dan pantau aktivitas jaringan agen.
                  </p>
                </div>
              </div>

              {/* 4 Summary KPI Cards Bar */}
              <div className="agents-summary-bar">
                {/* Card 1: Semua agen */}
                <button
                  type="button"
                  className={`agents-summary-card ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter('all');
                    setCurrentPage(1);
                  }}
                  title="Tampilkan semua agen"
                >
                  <div className="agents-summary-icon-wrap">
                    <Users size={17} color="#10B981" />
                  </div>
                  <div className="agents-summary-copy">
                    <div className="agents-summary-value">{summaryMetrics.total}</div>
                    <div className="agents-summary-label">Semua agen</div>
                  </div>
                </button>

                {/* Card 2: Aktif */}
                <button
                  type="button"
                  className={`agents-summary-card ${statusFilter === 'active' ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter('active');
                    setCurrentPage(1);
                  }}
                  title="Filter agen aktif"
                >
                  <div className="agents-summary-icon-wrap">
                    <UserCheck size={17} color="#0D9488" />
                  </div>
                  <div className="agents-summary-copy">
                    <div className="agents-summary-value">{summaryMetrics.active}</div>
                    <div className="agents-summary-label">Aktif</div>
                  </div>
                </button>

                {/* Card 3: Nonaktif */}
                <button
                  type="button"
                  className={`agents-summary-card ${statusFilter === 'inactive' ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter('inactive');
                    setCurrentPage(1);
                  }}
                  title="Filter agen nonaktif"
                >
                  <div className="agents-summary-icon-wrap">
                    <UserX size={17} color="#E11D48" />
                  </div>
                  <div className="agents-summary-copy">
                    <div className="agents-summary-value">{summaryMetrics.inactive}</div>
                    <div className="agents-summary-label">Nonaktif</div>
                  </div>
                </button>

                {/* Card 4: Baru bulan ini */}
                <button
                  type="button"
                  className={`agents-summary-card ${statusFilter === 'new_this_month' ? 'active' : ''}`}
                  onClick={() => {
                    setStatusFilter('new_this_month');
                    setCurrentPage(1);
                  }}
                  title="Filter agen baru bulan ini"
                >
                  <div className="agents-summary-icon-wrap">
                    <UserPlus size={17} color="#4338CA" />
                  </div>
                  <div className="agents-summary-copy">
                    <div className="agents-summary-value">{summaryMetrics.newThisMonth}</div>
                    <div className="agents-summary-label">Baru bulan ini</div>
                  </div>
                </button>
              </div>

              {/* Table Panel */}
              <div className="agents-table-panel">
                {/* Toolbar */}
                <div className="agents-toolbar">
                  {/* Search Bar */}
                  <div className="agents-search-box">
                    <Search size={14} color="#64748B" />
                    <input
                      type="text"
                      className="agents-search-input"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Cari nama, nomor, atau kode agen..."
                    />
                  </div>

                  {/* Status Filter Dropdown */}
                  <div className="agents-filter-wrapper" ref={filterDropdownRef}>
                    <button
                      type="button"
                      className="agents-filter-btn"
                      onClick={() => setIsFilterOpen((prev) => !prev)}
                    >
                      <div
                        className={`agents-status-dot ${
                          statusFilter === 'inactive' ? 'inactive' : 'active'
                        }`}
                      />
                      <span className="agents-filter-text">
                        {statusFilter === 'all' && 'Semua status'}
                        {statusFilter === 'active' && 'Aktif'}
                        {statusFilter === 'inactive' && 'Nonaktif'}
                        {statusFilter === 'new_this_month' && 'Baru bulan ini'}
                      </span>
                      <ChevronDown size={12} color="#64748B" />
                    </button>

                    {isFilterOpen && (
                      <div className="agents-filter-dropdown">
                        <button
                          type="button"
                          className={`agents-filter-option ${statusFilter === 'all' ? 'selected' : ''}`}
                          onClick={() => {
                            setStatusFilter('all');
                            setIsFilterOpen(false);
                            setCurrentPage(1);
                          }}
                        >
                          <div className="agents-status-dot active" />
                          <span>Semua status</span>
                        </button>
                        <button
                          type="button"
                          className={`agents-filter-option ${statusFilter === 'active' ? 'selected' : ''}`}
                          onClick={() => {
                            setStatusFilter('active');
                            setIsFilterOpen(false);
                            setCurrentPage(1);
                          }}
                        >
                          <div className="agents-status-dot active" />
                          <span>Aktif</span>
                        </button>
                        <button
                          type="button"
                          className={`agents-filter-option ${statusFilter === 'inactive' ? 'selected' : ''}`}
                          onClick={() => {
                            setStatusFilter('inactive');
                            setIsFilterOpen(false);
                            setCurrentPage(1);
                          }}
                        >
                          <div className="agents-status-dot inactive" />
                          <span>Nonaktif</span>
                        </button>
                        <button
                          type="button"
                          className={`agents-filter-option ${statusFilter === 'new_this_month' ? 'selected' : ''}`}
                          onClick={() => {
                            setStatusFilter('new_this_month');
                            setIsFilterOpen(false);
                            setCurrentPage(1);
                          }}
                        >
                          <div className="agents-status-dot active" />
                          <span>Baru bulan ini</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Export CSV Button */}
                  <button
                    type="button"
                    className="agents-export-btn"
                    onClick={handleExportCSV}
                    title="Unduh data agen sebagai CSV"
                  >
                    <Download size={13} color="#64748B" />
                    <span className="agents-export-text">Export CSV</span>
                  </button>
                </div>

                {/* Table Responsive Container */}
                <div className="agents-table-scroll">
                  {/* Table Header */}
                  <div className="agents-table-header">
                    <div className="agents-th col-agent">AGEN</div>
                    <div className="agents-th col-code">KODE</div>
                    <div className="agents-th col-domisili">DOMISILI</div>
                    <div className="agents-th col-activity">AKTIVITAS TERAKHIR</div>
                    <div className="agents-th col-performance">PERFORMA</div>
                    <div className="agents-th col-commission">KOMISI</div>
                    <div className="agents-th col-status">STATUS</div>
                    <div className="agents-th col-action">AKSI</div>
                  </div>

                  {/* Table Body */}
                  <div className="agents-table-body">
                    {loading ? (
                      <div className="agents-empty-state">
                        <span>Memuat data agen...</span>
                      </div>
                    ) : paginatedAgents.length === 0 ? (
                      <div className="agents-empty-state">
                        <span>Tidak ada agen yang sesuai dengan pencarian atau filter.</span>
                      </div>
                    ) : (
                      paginatedAgents.map((agent) => {
                        const stats = getAgentStats(agent.id);
                        const activity = formatRelativeActivity(agent.updated_at || agent.created_at);
                        const isActive = agent.status === 'active';

                        return (
                          <div key={agent.id} className="agents-row">
                            {/* AGEN: Avatar + Name + Phone */}
                            <div className="agents-td col-agent">
                              <div className="agents-avatar">
                                {agent.photo_url ? (
                                  <img
                                    src={getFullImageUrl(agent.photo_url)}
                                    alt={agent.name}
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="agents-avatar-initial">
                                    {getInitials(agent.name)}
                                  </div>
                                )}
                              </div>
                              <div className="agents-identity-copy">
                                <div className="agents-name" title={agent.name}>
                                  {agent.name}
                                </div>
                                <div className="agents-phone">
                                  {agent.phone || '-'}
                                </div>
                              </div>
                            </div>

                            {/* KODE */}
                            <div className="agents-td col-code">
                              {agent.referral_code}
                            </div>

                            {/* DOMISILI */}
                            <div className="agents-td col-domisili" title={agent.domisili || '-'}>
                              {agent.domisili || '-'}
                            </div>

                            {/* AKTIVITAS TERAKHIR */}
                            <div className={`agents-td col-activity ${activity.isStale ? 'stale' : ''}`}>
                              {activity.text}
                            </div>

                            {/* PERFORMA (Merged Prospects & Closing) */}
                            <div className="agents-td col-performance">
                              <div className="agents-perf-row">
                                <span className="agents-perf-num">{stats.prospects}</span>
                                <span className="agents-perf-label">prospek</span>
                              </div>
                              <div className="agents-perf-row closing">
                                <span className="agents-perf-num">{stats.closing}</span>
                                <span className="agents-perf-label">closing</span>
                              </div>
                            </div>

                            {/* KOMISI */}
                            <div className="agents-td col-commission">
                              {stats.commissionFormatted}
                            </div>

                            {/* STATUS */}
                            <div className="agents-td col-status">
                              <div
                                className={`agents-status-dot ${
                                  isActive ? 'active' : 'inactive'
                                }`}
                              />
                              <span className={`agents-status-text ${!isActive ? 'inactive' : ''}`}>
                                {isActive ? 'Aktif' : 'Nonaktif'}
                              </span>
                            </div>

                            {/* AKSI: Detail Button */}
                            <div className="agents-td col-action">
                              <Link
                                to={`/agents/${agent.id}`}
                                className="agents-detail-btn"
                                title={`Lihat detail ${agent.name}`}
                              >
                                <span className="agents-detail-btn-text">Detail</span>
                                <ChevronRight size={10} color="#0F766E" />
                              </Link>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Table Footer */}
                <div className="agents-table-footer">
                  <div className="agents-result-count">
                    Menampilkan {paginatedAgents.length} dari {filteredAgents.length} agen
                  </div>

                  <div className="agents-pagination">
                    {/* Prev Button */}
                    <button
                      type="button"
                      className="agents-page-btn"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage <= 1}
                      title="Halaman sebelumnya"
                    >
                      ‹
                    </button>

                    {/* Page Numbers */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                      if (
                        pageNum === 1 ||
                        pageNum === totalPages ||
                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            className={`agents-page-btn ${currentPage === pageNum ? 'active' : ''}`}
                            onClick={() => handlePageChange(pageNum)}
                          >
                            {pageNum}
                          </button>
                        );
                      } else if (
                        (pageNum === 2 && currentPage > 3) ||
                        (pageNum === totalPages - 1 && currentPage < totalPages - 2)
                      ) {
                        return (
                          <span key={pageNum} className="agents-page-ellipsis">
                            …
                          </span>
                        );
                      }
                      return null;
                    })}

                    {/* Next Button */}
                    <button
                      type="button"
                      className="agents-page-btn"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                      title="Halaman berikutnya"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB: ANTREAN PERSETUJUAN (Pending Tab)
              ================================================================= */}
          {activeTab === 'pending' && (
            <>
              <PageHeader
                title="Antrean Persetujuan Agen"
                subtitle="Verifikasi dan setujui pendaftaran calon agen mitra baru travel Anda."
              />
              <Table
                columns={pendingColumns}
                data={agents}
                loading={loading}
                emptyMessage="Tidak ada antrean pendaftaran agen baru saat ini."
                searchPlaceholder="Cari nama calon agen, domisili, kontak, referral..."
                searchKeys={['name', 'email', 'phone', 'domisili', 'referral_code']}
              />
            </>
          )}

          {/* =================================================================
              TAB: PENGAJUAN PENCAIRAN (Payouts Tab)
              ================================================================= */}
          {activeTab === 'payouts' && (
            <>
              <PageHeader
                title="Pengajuan Pencairan Komisi"
                subtitle="Daftar permohonan penarikan saldo komisi oleh mitra agen yang menunggu konfirmasi transfer."
              />
              <Table
                columns={payoutColumns}
                data={payouts}
                loading={loading}
                emptyMessage="Belum ada pengajuan pencairan komisi."
                searchPlaceholder="Cari nama agen, bank, nomor rekening..."
                searchKeys={['agent_name', 'agent_phone', 'bank_name_snapshot', 'bank_account_number_snapshot', 'bank_account_holder_snapshot']}
              />
            </>
          )}

          {/* Modal Konfirmasi Persetujuan / Penolakan Agen */}
          <Modal
            isOpen={confirmModal !== null && confirmModal.isOpen}
            onClose={() => setConfirmModal(null)}
            title={
              confirmModal?.type === 'approve'
                ? 'Konfirmasi Persetujuan Agen'
                : 'Konfirmasi Penolakan Pendaftaran'
            }
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%' }}>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setConfirmModal(null)}
                  disabled={actionLoading !== null}
                >
                  <span>Batal</span>
                </Button>
                {confirmModal?.type === 'approve' ? (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => confirmModal && executeApprove(confirmModal.agent)}
                    disabled={actionLoading !== null}
                  >
                    <CheckCircle2 size={16} />
                    <span>{actionLoading ? 'Memproses...' : 'Ya, Setujui Akun'}</span>
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => confirmModal && executeReject(confirmModal.agent)}
                    disabled={actionLoading !== null}
                    style={{ borderColor: 'var(--db-negative)', color: 'var(--db-negative)' }}
                  >
                    <XCircle size={16} />
                    <span>{actionLoading ? 'Memproses...' : 'Ya, Tolak'}</span>
                  </Button>
                )}
              </div>
            }
          >
            {confirmModal && (
              <div style={{ fontSize: 'var(--font-size-base)', lineHeight: 1.6, color: 'var(--db-text-primary)' }}>
                {confirmModal.type === 'approve' ? (
                  <p style={{ margin: 0 }}>
                    Apakah Anda yakin ingin menyetujui pendaftaran mitra agen{' '}
                    <strong>{confirmModal.agent.name}</strong>? Akun akan langsung aktif dan mitra dapat masuk ke portal agen untuk mulai menyebarkan link referral.
                  </p>
                ) : (
                  <>
                    <p style={{ margin: '0 0 16px 0' }}>
                      Apakah Anda yakin ingin menolak pendaftaran mitra agen{' '}
                      <strong>{confirmModal.agent.name}</strong>? Tindakan ini akan menandai status pendaftaran sebagai ditolak.
                    </p>
                    <div>
                      <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--db-text-primary)', marginBottom: '6px' }}>
                        Alasan Penolakan <span style={{ color: 'var(--db-negative)' }}>*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={agentRejectionReason}
                        onChange={(e) => setAgentRejectionReason(e.target.value)}
                        placeholder="Contoh: Bukti transfer tidak valid atau tidak terbaca, nomor rekening tidak sesuai, dll."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--db-border)',
                          backgroundColor: 'var(--db-input-bg)',
                          color: 'var(--db-text-primary)',
                          fontSize: 'var(--font-size-sm)',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </Modal>

          {/* Modal Preview Bukti Transfer Full */}
          <Modal
            isOpen={selectedProofUrl !== null}
            onClose={() => {
              setSelectedProofUrl(null);
              setSelectedAgent(null);
            }}
            title={`Bukti Transfer — ${selectedAgent?.name || 'Agen'}`}
            footer={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                {selectedProofUrl && (
                  <a
                    href={getFullImageUrl(selectedProofUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--db-primary-button)',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    <ExternalLink size={14} />
                    <span>Buka Ukuran Penuh</span>
                  </a>
                )}

                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      setSelectedProofUrl(null);
                      setSelectedAgent(null);
                    }}
                  >
                    <span>Tutup</span>
                  </Button>
                  {selectedAgent && selectedAgent.status === 'pending' && (
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => executeApprove(selectedAgent)}
                      disabled={actionLoading !== null}
                    >
                      <CheckCircle2 size={16} />
                      <span>{actionLoading ? 'Memproses...' : 'Setujui Agen'}</span>
                    </Button>
                  )}
                </div>
              </div>
            }
          >
            {selectedProofUrl && (
              <div
                style={{
                  textAlign: 'center',
                  backgroundColor: 'var(--db-chart-area-fill)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={getFullImageUrl(selectedProofUrl)}
                  alt={`Bukti Transfer ${selectedAgent?.name}`}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '65vh',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--db-border)',
                    objectFit: 'contain',
                    backgroundColor: 'var(--db-card-bg)',
                  }}
                />
              </div>
            )}
          </Modal>

          {/* Modal Konfirmasi Persetujuan / Pembayaran Pencairan */}
          <Modal
            isOpen={confirmPayoutModal !== null && confirmPayoutModal.isOpen}
            onClose={() => setConfirmPayoutModal(null)}
            title={
              confirmPayoutModal?.type === 'approve'
                ? 'Konfirmasi Persetujuan Pencairan'
                : 'Konfirmasi Pencairan Telah Ditransfer'
            }
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%' }}>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setConfirmPayoutModal(null)}
                  disabled={actionLoading !== null}
                >
                  <span>Batal</span>
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    if (!confirmPayoutModal) return;
                    if (confirmPayoutModal.type === 'approve') {
                      executeApprovePayout(confirmPayoutModal.request);
                    } else {
                      executeMarkPayoutPaid(confirmPayoutModal.request);
                    }
                  }}
                  disabled={actionLoading !== null}
                >
                  <CheckCircle2 size={16} />
                  <span>
                    {actionLoading
                      ? 'Memproses...'
                      : confirmPayoutModal?.type === 'approve'
                      ? 'Ya, Setujui'
                      : 'Ya, Tandai Selesai'}
                  </span>
                </Button>
              </div>
            }
          >
            {confirmPayoutModal && (
              <div style={{ fontSize: 'var(--font-size-base)', lineHeight: 1.6, color: 'var(--db-text-primary)' }}>
                {confirmPayoutModal.type === 'approve' ? (
                  <p style={{ margin: 0 }}>
                    Apakah Anda yakin ingin menyetujui pengajuan pencairan komisi sebesar{' '}
                    <strong>Rp {Number(confirmPayoutModal.request.amount_requested).toLocaleString('id-ID')}</strong> untuk mitra agen{' '}
                    <strong>{confirmPayoutModal.request.agent_name || `Agen #${confirmPayoutModal.request.agent_id}`}</strong>?
                    <br />
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--db-text-muted)' }}>
                      Setelah disetujui, Anda dapat melakukan transfer bank manual ke rekening tujuan lalu menandainya sebagai sudah ditransfer.
                    </span>
                  </p>
                ) : (
                  <p style={{ margin: 0 }}>
                    Konfirmasi bahwa dana komisi sebesar{' '}
                    <strong>Rp {Number(confirmPayoutModal.request.amount_requested).toLocaleString('id-ID')}</strong> telah berhasil ditransfer ke rekening{' '}
                    <strong>{confirmPayoutModal.request.bank_name_snapshot} - {confirmPayoutModal.request.bank_account_number_snapshot} ({confirmPayoutModal.request.bank_account_holder_snapshot})</strong>?
                  </p>
                )}
              </div>
            )}
          </Modal>

          {/* Modal Penolakan Pencairan Komisi */}
          <Modal
            isOpen={rejectPayoutModal !== null && rejectPayoutModal.isOpen}
            onClose={() => {
              setRejectPayoutModal(null);
              setRejectionReason('');
            }}
            title="Tolak Pengajuan Pencairan"
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%' }}>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setRejectPayoutModal(null);
                    setRejectionReason('');
                  }}
                  disabled={actionLoading !== null}
                >
                  <span>Batal</span>
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => rejectPayoutModal && executeRejectPayout(rejectPayoutModal.request)}
                  disabled={actionLoading !== null || !rejectionReason.trim()}
                  style={{ borderColor: 'var(--db-negative)', color: 'var(--db-negative)' }}
                >
                  <XCircle size={16} />
                  <span>{actionLoading ? 'Memproses...' : 'Tolak Pengajuan'}</span>
                </Button>
              </div>
            }
          >
            {rejectPayoutModal && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--db-text-primary)' }}>
                  Masukkan alasan penolakan pengajuan pencairan komisi sebesar{' '}
                  <strong>Rp {Number(rejectPayoutModal.request.amount_requested).toLocaleString('id-ID')}</strong> oleh{' '}
                  <strong>{rejectPayoutModal.request.agent_name || `Agen #${rejectPayoutModal.request.agent_id}`}</strong>:
                </p>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 600,
                      color: 'var(--db-text-secondary)',
                      marginBottom: '6px',
                    }}
                  >
                    Alasan Penolakan <span style={{ color: 'var(--db-negative)' }}>*</span>
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Contoh: Nomor rekening tidak cocok dengan nama pemegang akun."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--db-border)',
                      backgroundColor: 'var(--db-card-bg)',
                      color: 'var(--db-text-primary)',
                      fontSize: 'var(--font-size-sm)',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            )}
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default AgentsPage;
