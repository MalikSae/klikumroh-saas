import React, { useState, useEffect, useId } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ReceiptText,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Ban,
  Lock,
  RefreshCw,
  Wallet,
  XCircle,
  MessageCircle,
  Mail,
  MapPin,
  ShieldAlert,
  Pencil,
  MoreHorizontal,
  GitBranch,
  CalendarDays,
  Clock3,
  LayoutDashboard,
  Activity,
  Users,
  Network,
  MessagesSquare,
  Filter,
  Phone,
  Search,
  ListFilter,
  Package,
  Download,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  Card,
  Button,
  FormInput,
  Modal,
  getStandardMenuItems,
} from '../components';
import {
  type AgentDashboardDetail,
  type AgentItem,
  type ProspectItem,
  fetchAgentDetail,
  fetchProspects,
  fetchDashboardAgents,
  updateDashboardAgentProfile,
  resetAgentPassword,
  toggleAgentStatus,
  approveAgent,
  rejectAgent,
  getFullImageUrl,
  getStoredUser,
} from '../services/api';
import { formatDateWIB, formatTimeWIB } from '../utils/datetime';
import './AgentDetail.css';
import styles from './AgentDetail.module.css';

const formatIDR = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

type ProspectTone = 'new' | 'contacted' | 'interested' | 'closing' | 'lost';

interface AgentProspectRow {
  id: number;
  name: string;
  phone: string;
  package_name: string;
  status: 'baru' | 'dihubungi' | 'tertarik' | 'closing' | 'tidak_lanjut';
  status_label: string;
  tone: ProspectTone;
  created_label: string;
  created_at: string;
  source: string;
  updated_at: string;
  updated_at_relative: string;
}

interface CommissionLedgerRow {
  id: string;
  date: string;
  reference: string;
  description: string;
  type: 'Direct' | 'Override' | 'Pencairan' | 'Koreksi';
  incoming: number;
  outgoing: number;
  balance: number;
  year: number;
  month: number;
}

interface ActivityEntry {
  key: string;
  at: string;
  title: string;
  detail: string;
  kind: 'prospect' | 'closing' | 'commission' | 'payout';
}

const PROSPECT_STATUS_META: Record<AgentProspectRow['status'], { label: string; tone: ProspectTone }> = {
  baru: { label: 'Prospek baru', tone: 'new' },
  dihubungi: { label: 'Dihubungi', tone: 'contacted' },
  tertarik: { label: 'Berminat', tone: 'interested' },
  closing: { label: 'Closing', tone: 'closing' },
  tidak_lanjut: { label: 'Tidak lanjut', tone: 'lost' },
};

const sourceLabel = (p: ProspectItem): string => {
  if (p.entry_method === 'agent_manual') return 'Input agen';
  if (p.source_channel === 'agen') return 'Link referral';
  if (p.source_channel === 'paid') return 'Meta Ads';
  return 'Organik';
};

const toTime = (value?: string | null): number => {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// Relative time for recent activity; older than a week falls back to a WIB date.
const relativeTime = (value?: string | null): string => {
  const t = toTime(value);
  if (!t) return '-';
  const diffMin = Math.floor((Date.now() - t) / 60000);
  if (diffMin < 1) return 'Baru saja';
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'Kemarin';
  if (diffDay < 7) return `${diffDay} hari lalu`;
  return formatDateWIB(value);
};

const dayLabel = (value: string): string => {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const key = (x: Date) => x.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  if (key(d) === key(today)) return 'Hari ini';
  if (key(d) === key(yesterday)) return 'Kemarin';
  return formatDateWIB(value);
};

export const AgentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const agentId = id ? parseInt(id, 10) : 0;
  const newPasswordId = useId();
  const confirmPasswordId = useId();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentDashboardDetail | null>(null);
  const [realProspects, setRealProspects] = useState<ProspectItem[]>([]);
  // Sub-agents recruited through this agent's referral link, and which of them ever closed a jamaah.
  const [subAgents, setSubAgents] = useState<AgentItem[]>([]);
  const [closingAgentIds, setClosingAgentIds] = useState<Set<number>>(new Set());

  // Tab Prospek Filter & Pagination States
  const [prospectSearch, setProspectSearch] = useState<string>('');
  const [prospectStatusFilter, setProspectStatusFilter] = useState<string>('all');
  const [prospectPackageFilter, setProspectPackageFilter] = useState<string>('all');
  const [prospectDateFilter, setProspectDateFilter] = useState<string>('30d');
  const [prospectPage, setProspectPage] = useState<number>(1);

  // Tab Riwayat Komisi Filter & Pagination States
  const [commSearch, setCommSearch] = useState<string>('');
  const [commTypeFilter, setCommTypeFilter] = useState<string>('all');
  const [commDateFilter, setCommDateFilter] = useState<string>('year');
  const [commPage, setCommPage] = useState<number>(1);

  // Edit Profile Modal State
  const [editProfileModalOpen, setEditProfileModalOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [domisili, setDomisili] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Reset Password Modal State
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState<boolean>(false);
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [resettingPassword, setResettingPassword] = useState<boolean>(false);

  // Status Action Modal State
  const [confirmStatusModal, setConfirmStatusModal] = useState<{
    isOpen: boolean;
    action: 'deactivate' | 'activate' | 'approve' | 'reject';
    title: string;
    description: string;
  } | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<boolean>(false);

  type TabId = 'ringkasan' | 'aktivitas' | 'prospek' | 'riwayat_komisi' | 'jaringan';
  const [activeTab, setActiveTab] = useState<TabId>('ringkasan');
  const [moreMenuOpen, setMoreMenuOpen] = useState<boolean>(false);

  const currentUser = getStoredUser();

  const loadAgent = async () => {
    if (!agentId) {
      setError('ID Agen tidak valid');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [agentData, prospectsData, allAgents, closingProspects] = await Promise.all([
        fetchAgentDetail(agentId),
        fetchProspects({ agent_id: agentId }).catch(() => [] as ProspectItem[]),
        fetchDashboardAgents().catch(() => [] as AgentItem[]),
        fetchProspects({ status: 'closing' }).catch(() => [] as ProspectItem[]),
      ]);
      setAgent(agentData);
      setRealProspects(prospectsData.filter((p: ProspectItem) => p.agent_id === agentId));
      setSubAgents(allAgents.filter((a) => a.parent_agent_id === agentId));
      setClosingAgentIds(new Set(closingProspects.map((p) => p.agent_id).filter((v): v is number => typeof v === 'number')));
      setName(agentData.name || '');
      setPhone(agentData.phone || '');
      setEmail(agentData.email || '');
      setDomisili(agentData.domisili || '');
    } catch (err: any) {
      setError(err.message || 'Gagal memuat detail agen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgent();
  }, [agentId]);

  const openEditProfileModal = () => {
    if (!agent) return;
    setName(agent.name || '');
    setPhone(agent.phone || '');
    setEmail(agent.email || '');
    setDomisili(agent.domisili || '');
    setProfileError(null);
    setEditProfileModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;

    try {
      setSavingProfile(true);
      setProfileError(null);

      const updated = await updateDashboardAgentProfile(agent.id, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        domisili: domisili.trim() || undefined,
      });

      setAgent(updated);
      setEditProfileModalOpen(false);
      setSuccessMessage('Perubahan profil agen berhasil disimpan.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setProfileError(err.message || 'Gagal memperbarui profil agen');
    } finally {
      setSavingProfile(false);
    }
  };

  const openResetPasswordModal = () => {
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setResetPasswordModalOpen(true);
  };

  const handleExecuteResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;

    if (newPassword.length < 8) {
      setPasswordError('Password baru minimal 8 karakter');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi password tidak cocok');
      return;
    }

    try {
      setResettingPassword(true);
      setPasswordError(null);
      await resetAgentPassword(agent.id, newPassword);
      setResetPasswordModalOpen(false);
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage('Password akun agen berhasil diperbarui.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setPasswordError(err.message || 'Gagal mereset password agen');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleExecuteStatusChange = async () => {
    if (!agent || !confirmStatusModal) return;

    try {
      setProcessingStatus(true);
      setSuccessMessage(null);

      if (confirmStatusModal.action === 'deactivate') {
        await toggleAgentStatus(agent.id, 'deactivate');
        setSuccessMessage('Agen berhasil dinonaktifkan.');
      } else if (confirmStatusModal.action === 'activate') {
        await toggleAgentStatus(agent.id, 'activate');
        setSuccessMessage('Agen berhasil diaktifkan kembali.');
      } else if (confirmStatusModal.action === 'approve') {
        await approveAgent(agent.id);
        setSuccessMessage('Pendaftaran agen berhasil disetujui.');
      } else if (confirmStatusModal.action === 'reject') {
        await rejectAgent(agent.id, rejectionReasonInput.trim());
        setSuccessMessage('Pendaftaran agen berhasil ditolak.');
        setRejectionReasonInput('');
      }

      setConfirmStatusModal(null);
      await loadAgent();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(err.message || 'Gagal memproses aksi status');
      setConfirmStatusModal(null);
    } finally {
      setProcessingStatus(false);
    }
  };

  const menuItems = getStandardMenuItems('agents');

  const waNormalized = agent?.phone ? agent.phone.replace(/\D/g, '') : '';
  const waTarget = waNormalized.startsWith('0') ? '62' + waNormalized.slice(1) : waNormalized;

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
          <main className={`db-page-container ${styles.admain1}`}>
            <div className={styles.addiv2}>
              <RefreshCw size={24} className="db-spin" />
              <span className={styles.adspan3}>Memuat data agen...</span>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error && !agent) {
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
          <main className={`db-page-container ${styles.admain1}`}>
            <Card>
              <div className={styles.addiv4}>
                <AlertCircle size={32} className={styles.iconMb12} />
                <p className={styles.adp5}>Terjadi Kesalahan</p>
                <p className={styles.adp6}>{error || 'Agen tidak ditemukan'}</p>
                <Button variant="secondary" size="sm" onClick={() => navigate('/agents')}>
                  <ArrowLeft size={16} />
                  <span>Kembali ke Sistem Agen</span>
                </Button>
              </div>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  if (!agent) return null;

  const activeProspects: AgentProspectRow[] = realProspects.map((p) => {
    const meta = PROSPECT_STATUS_META[p.status] || { label: p.status, tone: 'lost' as ProspectTone };
    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      package_name: p.package_name || 'Umroh',
      status: p.status,
      status_label: meta.label,
      tone: meta.tone,
      created_label: `${formatDateWIB(p.created_at)} ${formatTimeWIB(p.created_at)}`.trim(),
      created_at: p.created_at,
      source: sourceLabel(p),
      updated_at: p.updated_at,
      updated_at_relative: relativeTime(p.updated_at),
    };
  });

  const DATE_FILTER_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
  const filteredProspects = activeProspects.filter((p) => {
    if (prospectSearch.trim()) {
      const q = prospectSearch.toLowerCase().trim();
      const matchName = p.name.toLowerCase().includes(q);
      const matchPhone = p.phone.toLowerCase().includes(q);
      const matchPkg = p.package_name.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchPkg) return false;
    }
    if (prospectStatusFilter !== 'all' && p.status !== prospectStatusFilter) return false;
    if (prospectPackageFilter !== 'all' && p.package_name !== prospectPackageFilter) return false;
    const days = DATE_FILTER_DAYS[prospectDateFilter];
    if (days && toTime(p.created_at) < Date.now() - days * 24 * 60 * 60 * 1000) return false;
    return true;
  });

  const PROSPECTS_PER_PAGE = 9;
  const totalProspectPages = Math.max(1, Math.ceil(filteredProspects.length / PROSPECTS_PER_PAGE));
  const displayedProspects = filteredProspects.slice(
    (prospectPage - 1) * PROSPECTS_PER_PAGE,
    prospectPage * PROSPECTS_PER_PAGE
  );

  const distinctPackages = Array.from(new Set(activeProspects.map((p) => p.package_name)));

  const pipelineCounts = {
    baru: realProspects.filter((p) => p.status === 'baru').length,
    dihubungi: realProspects.filter((p) => p.status === 'dihubungi').length,
    tertarik: realProspects.filter((p) => p.status === 'tertarik').length,
    closing: realProspects.filter((p) => p.status === 'closing').length,
  };
  const recentProspects = [...activeProspects].sort((a, b) => toTime(b.updated_at) - toTime(a.updated_at)).slice(0, 3);

  // Tab Riwayat Komisi: real ledger + payouts, running balance in chronological order.
  const commissionItems = agent.riwayat_komisi || [];
  const countsTowardsBalance = (item: (typeof commissionItems)[number]) =>
    !(item.source === 'payout' && item.status === 'rejected');
  // Entries booked in the same second keep their booking order (ids), so the running balance is stable.
  const chronological = [...commissionItems].sort(
    (a, b) =>
      toTime(a.created_at) - toTime(b.created_at) ||
      (a.source === b.source ? a.id - b.id : a.source === 'ledger' ? -1 : 1)
  );
  let runningBalance = 0;
  const ledgerAsc: CommissionLedgerRow[] = chronological.map((item) => {
    const isIncoming = item.direction === 'masuk';
    // Ledger amounts are signed (a negative correction reverses commission); payouts are positive.
    const signed = item.source === 'ledger' ? item.amount : -Math.abs(item.amount);
    if (countsTowardsBalance(item)) runningBalance += signed;
    const d = new Date(item.created_at);
    const valid = !Number.isNaN(d.getTime());
    const typeLabel: CommissionLedgerRow['type'] =
      item.type === 'override' ? 'Override' : item.type === 'payout' ? 'Pencairan' : item.type === 'correction' ? 'Koreksi' : 'Direct';
    const suffix =
      item.source === 'payout' && item.status === 'rejected' ? ' (ditolak)' : item.held ? ' (tertahan)' : '';
    return {
      id: `${item.source}-${item.id}`,
      date: valid ? formatDateWIB(item.created_at) : '-',
      reference: `${item.source === 'payout' ? 'PAY' : 'KOM'}-${String(item.id).padStart(5, '0')}`,
      description: item.description + suffix,
      type: typeLabel,
      incoming: isIncoming ? Math.abs(item.amount) : 0,
      outgoing: !isIncoming ? Math.abs(item.amount) : 0,
      balance: runningBalance,
      year: valid ? d.getFullYear() : 0,
      month: valid ? d.getMonth() + 1 : 0,
    };
  });
  const displayCommissions = [...ledgerAsc].reverse();

  // Net commission booked for the agent (reversals from cancelled closings subtract).
  const totalKomisiMasuk = commissionItems.filter((c) => c.source === 'ledger').reduce((sum, c) => sum + c.amount, 0);
  const totalKomisiKeluar = commissionItems
    .filter((c) => c.source === 'payout' && countsTowardsBalance(c))
    .reduce((sum, c) => sum + Math.abs(c.amount), 0);
  const saldoLedger = agent.saldo_siap_cair || 0;
  const commissionEntryCount = commissionItems.filter((c) => c.source === 'ledger').length;

  const nowDate = new Date();
  const currentYear = nowDate.getFullYear();
  const currentMonth = nowDate.getMonth() + 1;
  const filteredCommissions = displayCommissions.filter((item) => {
    if (commSearch.trim()) {
      const q = commSearch.toLowerCase().trim();
      const matchRef = item.reference.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchType = item.type.toLowerCase().includes(q);
      if (!matchRef && !matchDesc && !matchType) return false;
    }
    if (commTypeFilter !== 'all') {
      const wanted = commTypeFilter === 'payout' ? 'pencairan' : commTypeFilter;
      if (item.type.toLowerCase() !== wanted) return false;
    }
    if (commDateFilter === 'year' && item.year !== currentYear) return false;
    if (commDateFilter === 'month' && (item.year !== currentYear || item.month !== currentMonth)) return false;
    return true;
  });

  const COMMISSIONS_PER_PAGE = 7;
  const totalCommissionPages = Math.max(1, Math.ceil(filteredCommissions.length / COMMISSIONS_PER_PAGE));
  const paginatedCommissions = filteredCommissions.slice(
    (commPage - 1) * COMMISSIONS_PER_PAGE,
    commPage * COMMISSIONS_PER_PAGE
  );

  // Activity timeline built from real records (prospects, closings, commission, payouts).
  const activityEntries: ActivityEntry[] = [
    ...realProspects.map((p) => ({
      key: `p-${p.id}`,
      at: p.created_at,
      title: p.entry_method === 'agent_manual' ? 'Menambah prospek manual' : 'Prospek masuk lewat link referral',
      detail: `${p.name} · ${p.package_name || 'Umroh'}`,
      kind: 'prospect' as const,
    })),
    ...realProspects
      .filter((p) => p.closed_at)
      .map((p) => ({
        key: `c-${p.id}`,
        at: p.closed_at as string,
        title: 'Jamaah closing (DP)',
        detail: p.name,
        kind: 'closing' as const,
      })),
    ...commissionItems.map((c) => ({
      key: `${c.source}-${c.id}`,
      at: c.created_at,
      title: c.source === 'payout' ? 'Mengajukan pencairan komisi' : 'Komisi tercatat',
      detail: `${c.amount < 0 ? '-' : ''}${formatIDR(Math.abs(c.amount))} · ${c.description}`,
      kind: (c.source === 'payout' ? 'payout' : 'commission') as ActivityEntry['kind'],
    })),
  ]
    .filter((e) => toTime(e.at) > 0)
    .sort((a, b) => toTime(b.at) - toTime(a.at))
    .slice(0, 60);
  const activityGroups: { label: string; items: ActivityEntry[] }[] = [];
  activityEntries.forEach((e) => {
    const label = dayLabel(e.at);
    const last = activityGroups[activityGroups.length - 1];
    if (last && last.label === label) last.items.push(e);
    else activityGroups.push({ label, items: [e] });
  });
  const lastActivityAt = activityEntries[0]?.at;

  const activeSubAgents = subAgents.filter((a) => a.status === 'active').length;
  const closingSubAgents = subAgents.filter((a) => closingAgentIds.has(a.id)).length;

  const exportCommissionCSV = () => {
    const headers = ['Tanggal', 'Referensi', 'Keterangan', 'Jenis', 'Masuk', 'Keluar', 'Saldo'];
    const rows = filteredCommissions.map((item) => [
      item.date,
      item.reference,
      `"${item.description.replace(/"/g, '""')}"`,
      item.type,
      item.incoming > 0 ? item.incoming : '',
      item.outgoing > 0 ? item.outgoing : '',
      item.balance,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `riwayat-komisi-${agent?.referral_code || 'agent'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

        <main className={`db-page-container ${styles.admain1}`}>
          {/* Top Notification Alerts */}
          {successMessage && (
            <div className={`db-alert db-alert--success ${styles.addiv7}`}>
              <CheckCircle2 size={18} />
              <span>{successMessage}</span>
            </div>
          )}

          {error && (
            <div className={`db-alert db-alert--error ${styles.addiv7}`}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Status Penolakan Banner */}
          {agent.status === 'rejected' && (
            <div
              className={`db-alert db-alert--error ${styles.addiv8}`}
            >
              <XCircle size={20} className={styles.iconTop} />
              <div className={styles.addiv9}>
                <strong className={styles.adstrong10}>Pendaftaran Agen Ditolak</strong>
                <p className={styles.adp11}>
                  Alasan penolakan: <strong>{agent.rejection_reason || 'Tidak memenuhi kriteria kelayakan mitra agen.'}</strong>
                </p>
                {agent.payment_proof_url && (
                  <div className={styles.addiv12}>
                    <Button variant="secondary" size="sm" onClick={() => setSelectedProofUrl(agent.payment_proof_url!)}>
                      <ReceiptText size={14} />
                      <span>Lihat Bukti Transfer Terakhir</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status Pending Banner */}
          {agent.status === 'pending' && (
            <div
              className={`db-alert db-alert--warning ${styles.addiv13}`}
            >
              <div className={styles.addiv14}>
                <AlertCircle size={20} className={styles.iconNoShrink} />
                <span className={styles.adstrong10}>
                  Pendaftaran agen ini sedang menunggu verifikasi dan persetujuan admin.
                </span>
              </div>
              <div className={styles.addiv15}>
                {agent.payment_proof_url && (
                  <Button variant="secondary" size="sm" onClick={() => setSelectedProofUrl(agent.payment_proof_url!)}>
                    <ReceiptText size={14} />
                    <span>Lihat Bukti Transfer</span>
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setConfirmStatusModal({
                      isOpen: true,
                      action: 'approve',
                      title: 'Setujui Pendaftaran Agen',
                      description: `Apakah Anda yakin ingin menyetujui pendaftaran ${agent.name}? Akun akan langsung aktif.`,
                    });
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>Setujui Pendaftaran</span>
                </Button>
              </div>
            </div>
          )}

          <div className="agent-detail-v2-container">
            {/* Agent Detail Page Header */}
            <div className="adv2-page-header">
              <div className="adv2-header-left">
                <button
                  type="button"
                  className="adv2-back-btn"
                  onClick={() => navigate('/agents')}
                  title="Kembali ke Sistem Agen"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="adv2-heading-copy">
                  <h1 className="adv2-title">Detail Agen</h1>
                  <p className="adv2-subtitle">Profil, performa prospek, dan komisi agen.</p>
                </div>
              </div>
              <div className="adv2-header-actions">
                <div className={styles.addiv16}>
                  <button
                    type="button"
                    className="adv2-btn-more"
                    onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                    title="Menu lainnya"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {moreMenuOpen && (
                    <div
                      className={styles.addiv17}
                    >
                      {waTarget && (
                        <a
                          href={`https://wa.me/${waTarget}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.ada18}
                          onClick={() => setMoreMenuOpen(false)}
                        >
                          <MessageCircle size={14} />
                          <span>Chat WhatsApp</span>
                        </a>
                      )}
                      <button
                        type="button"
                        className={styles.adbutton19}
                        onClick={() => {
                          setMoreMenuOpen(false);
                          openResetPasswordModal();
                        }}
                      >
                        <Lock size={14} />
                        <span>Ubah Password</span>
                      </button>
                      {agent.status === 'active' && (
                        <button
                          type="button"
                          className={styles.adbutton20}
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setConfirmStatusModal({
                              isOpen: true,
                              action: 'deactivate',
                              title: 'Konfirmasi Nonaktifkan Agen',
                              description: `Apakah Anda yakin ingin menonaktifkan akun agen ${agent.name}? Agen tidak akan dapat masuk atau menggunakan tautan referral selama berstatus nonaktif.`,
                            });
                          }}
                        >
                          <Ban size={14} />
                          <span>Nonaktifkan Agen</span>
                        </button>
                      )}
                      {agent.status === 'inactive' && (
                        <button
                          type="button"
                          className={styles.adbutton21}
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setConfirmStatusModal({
                              isOpen: true,
                              action: 'activate',
                              title: 'Konfirmasi Pengaktifan Kembali',
                              description: `Aktifkan kembali akun agen ${agent.name}? Agen akan dapat kembali masuk dan menyebarkan tautan referral.`,
                            });
                          }}
                        >
                          <CheckCircle2 size={14} />
                          <span>Aktifkan Kembali</span>
                        </button>
                      )}
                      {agent.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            className={styles.adbutton21}
                            onClick={() => {
                              setMoreMenuOpen(false);
                              setConfirmStatusModal({
                                isOpen: true,
                                action: 'approve',
                                title: 'Setujui Pendaftaran Agen',
                                description: `Apakah Anda yakin ingin menyetujui pendaftaran ${agent.name}? Akun akan langsung aktif.`,
                              });
                            }}
                          >
                            <CheckCircle2 size={14} />
                            <span>Setujui</span>
                          </button>
                          <button
                            type="button"
                            className={styles.adbutton20}
                            onClick={() => {
                              setMoreMenuOpen(false);
                              setConfirmStatusModal({
                                isOpen: true,
                                action: 'reject',
                                title: 'Tolak Pendaftaran Agen',
                                description: `Apakah Anda yakin ingin menolak pendaftaran ${agent.name}?`,
                              });
                            }}
                          >
                            <XCircle size={14} />
                            <span>Tolak</span>
                          </button>
                        </>
                      )}
                      {agent.status === 'rejected' && (
                        <button
                          type="button"
                          className={styles.adbutton21}
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setConfirmStatusModal({
                              isOpen: true,
                              action: 'approve',
                              title: 'Setujui Pendaftaran Agen',
                              description: `Apakah Anda yakin ingin menyetujui pendaftaran ${agent.name}? Akun akan langsung aktif.`,
                            });
                          }}
                        >
                          <CheckCircle2 size={14} />
                          <span>Setujui Pendaftaran</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="adv2-btn-edit"
                  onClick={openEditProfileModal}
                >
                  <Pencil size={13} />
                  <span>Edit profil</span>
                </button>
              </div>
            </div>

            {/* Agent Detail Identity Panel */}
            <div className="adv2-identity-panel">
              <div className="adv2-primary-identity">
                <div className="adv2-identity-avatar">
                  {agent.photo_url ? (
                    <img src={getFullImageUrl(agent.photo_url)} alt={agent.name} />
                  ) : (
                    <span>{agent.name.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className="adv2-primary-identity-copy">
                  <div className="adv2-name-status-row">
                    <span className="adv2-agent-name">{agent.name}</span>
                    <div className={`adv2-status-chip ${agent.status}`}>
                      <span className="adv2-status-dot" />
                      <span className="adv2-status-text">
                        {agent.status === 'active' ? 'Aktif' : agent.status === 'inactive' ? 'Nonaktif' : agent.status === 'rejected' ? 'Ditolak' : 'Pending'}
                      </span>
                    </div>
                  </div>
                  <div className="adv2-phone-city">
                    {agent.phone || '-'} · {agent.domisili || '-'}
                  </div>
                  <div className="adv2-referral-code">
                    Kode agen {agent.referral_code || '-'}
                  </div>
                </div>
              </div>
              <div className="adv2-identity-metadata">
                <div className="adv2-meta-item">
                  <GitBranch size={14} className="adv2-meta-icon" />
                  <div className="adv2-meta-copy">
                    <span className="adv2-meta-label">Direkrut oleh</span>
                    <span className="adv2-meta-value">{agent.parent_agent_name || 'Mendaftar langsung'}</span>
                  </div>
                </div>
                <div className="adv2-meta-item">
                  <CalendarDays size={14} className="adv2-meta-icon" />
                  <div className="adv2-meta-copy">
                    <span className="adv2-meta-label">Bergabung</span>
                    <span className="adv2-meta-value">
                      {agent.created_at
                        ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(agent.created_at))
                        : '-'}
                    </span>
                  </div>
                </div>
                <div className="adv2-meta-item">
                  <Clock3 size={14} className="adv2-meta-icon" />
                  <div className="adv2-meta-copy">
                    <span className="adv2-meta-label">Aktivitas terakhir</span>
                    <span className="adv2-meta-value">{relativeTime(lastActivityAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Detail V2 Tabs */}
            <div className="adv2-tabs-bar">
              <button
                type="button"
                className={`adv2-tab-btn ${activeTab === 'ringkasan' ? 'active' : ''}`}
                onClick={() => setActiveTab('ringkasan')}
              >
                <LayoutDashboard size={12} />
                <span>Ringkasan</span>
              </button>
              <button
                type="button"
                className={`adv2-tab-btn ${activeTab === 'aktivitas' ? 'active' : ''}`}
                onClick={() => setActiveTab('aktivitas')}
              >
                <Activity size={12} />
                <span>Aktivitas</span>
              </button>
              <button
                type="button"
                className={`adv2-tab-btn ${activeTab === 'prospek' ? 'active' : ''}`}
                onClick={() => setActiveTab('prospek')}
              >
                <Users size={12} />
                <span>Prospek</span>
              </button>
              <button
                type="button"
                className={`adv2-tab-btn ${activeTab === 'riwayat_komisi' ? 'active' : ''}`}
                onClick={() => setActiveTab('riwayat_komisi')}
              >
                <ReceiptText size={12} />
                <span>Riwayat komisi</span>
              </button>
              <button
                type="button"
                className={`adv2-tab-btn ${activeTab === 'jaringan' ? 'active' : ''}`}
                onClick={() => setActiveTab('jaringan')}
              >
                <Network size={12} />
                <span>Jaringan</span>
              </button>
            </div>

            {/* TAB CONTENT: Ringkasan */}
            {activeTab === 'ringkasan' && (
              <>
                {/* Agent Performance Metrics Row */}
                <div className="adv2-metrics-row">
                  <div className="adv2-metric-col">
                    <div className={`adv2-metric-icon-box ${styles.addiv22}`}>
                      <Users size={16} />
                    </div>
                    <div className="adv2-metric-copy">
                      <span className="adv2-metric-label">Total prospek</span>
                      <span className="adv2-metric-value">
                        {realProspects.length}
                      </span>
                      <span className="adv2-metric-subtext">Sejak bergabung</span>
                    </div>
                  </div>
                  <div className="adv2-metric-col">
                    <div className={`adv2-metric-icon-box ${styles.addiv23}`}>
                      <MessagesSquare size={16} />
                    </div>
                    <div className="adv2-metric-copy">
                      <span className="adv2-metric-label">Sedang ditangani</span>
                      <span className="adv2-metric-value">
                        {agent.ringkasan_jamaah ? agent.ringkasan_jamaah.diproses : 0}
                      </span>
                      <span className="adv2-metric-subtext">Perlu tindak lanjut</span>
                    </div>
                  </div>
                  <div className="adv2-metric-col">
                    <div className={`adv2-metric-icon-box ${styles.addiv22}`}>
                      <CheckCircle2 size={16} />
                    </div>
                    <div className="adv2-metric-copy">
                      <span className="adv2-metric-label">Jamaah closing</span>
                      <span className="adv2-metric-value">
                        {agent.ringkasan_jamaah ? agent.ringkasan_jamaah.closing : 0}
                      </span>
                      <span className="adv2-metric-subtext">
                        {(agent.ringkasan_jamaah?.batal || 0) > 0
                          ? `${agent.ringkasan_jamaah.batal} batal setelah DP (${Math.round(
                              ((agent.ringkasan_jamaah.batal || 0) /
                                ((agent.ringkasan_jamaah.closing || 0) + (agent.ringkasan_jamaah.batal || 0))) *
                                100
                            )}%)`
                          : 'Belum ada yang batal setelah DP'}
                      </span>
                    </div>
                  </div>
                  <div className="adv2-metric-col">
                    <div className={`adv2-metric-icon-box ${styles.addiv24}`}>
                      <Wallet size={16} />
                    </div>
                    <div className="adv2-metric-copy">
                      <span className="adv2-metric-label">Komisi tercatat</span>
                      <span className="adv2-metric-value">{formatIDR(totalKomisiMasuk)}</span>
                      <span className="adv2-metric-subtext">{commissionEntryCount} transaksi komisi</span>
                    </div>
                  </div>
                </div>

                {/* Columns Layout */}
                <div className="adv2-columns-row">
                  {/* Left / Main Column */}
                  <div className="adv2-main-col">
                    {/* Pipeline Overview */}
                    <div className="adv2-card">
                      <div className="adv2-card-header">
                        <Filter size={15} className={styles.cardIcon} />
                        <div className="adv2-card-header-copy">
                          <h3 className="adv2-card-title">Pipeline jamaah</h3>
                          <p className="adv2-card-subtitle">
                            Perkembangan {realProspects.length} prospek milik agen ini.
                          </p>
                        </div>
                      </div>
                      <div className="adv2-pipeline-body">
                        <div className="adv2-pipeline-item">
                          <span className="adv2-pipeline-val">{pipelineCounts.baru}</span>
                          <div className="adv2-pipeline-bar adv2-tone-bg--new" />
                          <span className="adv2-pipeline-lbl">Prospek baru</span>
                        </div>
                        <div className="adv2-pipeline-item">
                          <span className="adv2-pipeline-val">{pipelineCounts.dihubungi}</span>
                          <div className="adv2-pipeline-bar adv2-tone-bg--contacted" />
                          <span className="adv2-pipeline-lbl">Dihubungi</span>
                        </div>
                        <div className="adv2-pipeline-item">
                          <span className="adv2-pipeline-val">{pipelineCounts.tertarik}</span>
                          <div className="adv2-pipeline-bar adv2-tone-bg--interested" />
                          <span className="adv2-pipeline-lbl">Berminat</span>
                        </div>
                        <div className="adv2-pipeline-item">
                          <span className="adv2-pipeline-val">{pipelineCounts.closing}</span>
                          <div className="adv2-pipeline-bar adv2-tone-bg--closing" />
                          <span className="adv2-pipeline-lbl">Closing</span>
                        </div>
                      </div>
                    </div>

                    {/* Recent Prospects Table */}
                    <div className="adv2-card">
                      <div className="adv2-card-header">
                        <Users size={15} className={styles.cardIcon} />
                        <div className="adv2-card-header-copy">
                          <h3 className="adv2-card-title">Prospek terbaru</h3>
                          <p className="adv2-card-subtitle">Aktivitas jamaah yang terakhir diperbarui.</p>
                        </div>
                      </div>
                      <div className="adv2-table">
                        <div className="adv2-thead">
                          <span className="adv2-w-jamaah">JAMAAH</span>
                          <span className="adv2-w-paket">PAKET</span>
                          <span className="adv2-w-status">STATUS</span>
                          <span className="adv2-w-updated">DIPERBARUI</span>
                        </div>
                        <div className="adv2-tbody">
                          {recentProspects.length === 0 ? (
                            <div className="adv2-prospects-empty">
                              <span className="adv2-prospects-empty-title">Belum ada prospek</span>
                              <span className="adv2-prospects-empty-desc">Prospek dari link referral atau input agen akan muncul di sini.</span>
                            </div>
                          ) : (
                            recentProspects.map((p) => (
                              <div key={p.id} className="adv2-tr">
                                <div className="adv2-td-jamaah adv2-w-jamaah">
                                  <span className="adv2-jamaah-name">{p.name}</span>
                                  <span className="adv2-jamaah-phone">{p.phone}</span>
                                </div>
                                <div className="adv2-td-paket adv2-w-paket">{p.package_name}</div>
                                <div className="adv2-td-status adv2-w-status">
                                  <span className={`adv2-status-dot adv2-tone-bg--${p.tone}`} />
                                  <span className="adv2-status-name">{p.status_label}</span>
                                </div>
                                <div className="adv2-td-updated adv2-w-updated">{p.updated_at_relative}</div>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="adv2-tfoot">
                          <button
                            type="button"
                            className="adv2-see-all-btn"
                            onClick={() => setActiveTab('prospek')}
                          >
                            <span>Lihat semua prospek</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right / Side Column */}
                  <div className="adv2-side-col">
                    {/* Card: Kontak dan profil */}
                    <div className="adv2-card">
                      <div className="adv2-card-header">
                        <Users size={15} className={styles.cardIcon} />
                        <div className="adv2-card-header-copy">
                          <h3 className="adv2-card-title">Kontak dan profil</h3>
                          <p className="adv2-card-subtitle">Data terdaftar milik agen.</p>
                        </div>
                      </div>
                      <div className="adv2-contact-list">
                        <div className="adv2-contact-item">
                          <Phone size={13} />
                          <span>{agent.phone || '-'}</span>
                        </div>
                        <div className="adv2-contact-item">
                          <Mail size={13} />
                          <span>{agent.email || '-'}</span>
                        </div>
                        <div className="adv2-contact-item">
                          <MapPin size={13} />
                          <span>{agent.domisili || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card: Jaringan agen */}
                    <div className="adv2-card">
                      <div className="adv2-card-header">
                        <Network size={15} className={styles.cardIcon} />
                        <div className="adv2-card-header-copy">
                          <h3 className="adv2-card-title">Jaringan agen</h3>
                          <p className="adv2-card-subtitle">Struktur referral di bawah agen ini.</p>
                        </div>
                      </div>
                      <div className="adv2-network-stats">
                        <div className="adv2-net-stat">
                          <span className="adv2-net-val">{subAgents.length}</span>
                          <span className="adv2-net-lbl">Agen direkrut</span>
                        </div>
                        <div className="adv2-net-stat">
                          <span className="adv2-net-val">{activeSubAgents}</span>
                          <span className="adv2-net-lbl">Agen aktif</span>
                        </div>
                        <div className="adv2-net-stat">
                          <span className="adv2-net-val">{closingSubAgents}</span>
                          <span className="adv2-net-lbl">Pernah closing</span>
                        </div>
                      </div>
                    </div>

                    {/* Card: Saldo komisi */}
                    <div className="adv2-card">
                      <div className="adv2-card-header">
                        <Wallet size={15} className={styles.cardIcon} />
                        <div className="adv2-card-header-copy">
                          <h3 className="adv2-card-title">Saldo komisi</h3>
                          <p className="adv2-card-subtitle">Ringkasan komisi yang dapat dicairkan.</p>
                        </div>
                      </div>
                      <div className="adv2-saldo-body">
                        <span className="adv2-saldo-lbl">Saldo tersedia</span>
                        <span className="adv2-saldo-val">{formatIDR(agent.saldo_siap_cair || 0)}</span>
                        <div className="adv2-saldo-footer">
                          <span className="adv2-saldo-sub">
                            Tertahan (menunggu lunas) {formatIDR(agent.saldo_tertahan || 0)}
                          </span>
                          <button
                            type="button"
                            className="adv2-saldo-link"
                            onClick={() => setActiveTab('riwayat_komisi')}
                          >
                            {agent.riwayat_komisi?.length || 0} transaksi
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'aktivitas' && (
              <div className="adv2-card adv2-activity">
                {activityGroups.length === 0 ? (
                  <div className="adv2-prospects-empty">
                    <Activity size={24} className="adv2-empty-icon" />
                    <span className="adv2-prospects-empty-title">Belum ada aktivitas</span>
                    <span className="adv2-prospects-empty-desc">
                      Prospek, closing, komisi, dan pencairan agen ini akan tampil di sini.
                    </span>
                  </div>
                ) : (
                  activityGroups.map((group) => (
                    <div key={group.label} className="adv2-activity-group">
                      <span className="adv2-activity-day">{group.label}</span>
                      {group.items.map((item) => (
                        <div key={item.key} className="adv2-activity-row">
                          <span className={`adv2-activity-icon adv2-activity-icon--${item.kind}`}>
                            {item.kind === 'prospect' ? (
                              <Users size={14} />
                            ) : item.kind === 'closing' ? (
                              <CheckCircle2 size={14} />
                            ) : item.kind === 'payout' ? (
                              <Wallet size={14} />
                            ) : (
                              <ReceiptText size={14} />
                            )}
                          </span>
                          <div className="adv2-activity-copy">
                            <span className="adv2-activity-title">{item.title}</span>
                            <span className="adv2-activity-detail">{item.detail}</span>
                          </div>
                          <span className="adv2-activity-time">{formatTimeWIB(item.at)}</span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'prospek' && (
              <div className="adv2-prospects-panel">
                {/* Toolbar */}
                <div className="adv2-prospects-toolbar">
                  {/* Search Agent Prospects */}
                  <div className="adv2-prospects-search">
                    <Search size={14} className="adv2-search-icon" />
                    <input
                      type="text"
                      className="adv2-search-input"
                      placeholder="Cari jamaah atau nomor WhatsApp..."
                      value={prospectSearch}
                      onChange={(e) => {
                        setProspectSearch(e.target.value);
                        setProspectPage(1);
                      }}
                    />
                  </div>

                  {/* Status Filter */}
                  <div className="adv2-filter-wrap">
                    <ListFilter size={13} className="adv2-filter-icon" />
                    <select
                      className="adv2-filter-select"
                      value={prospectStatusFilter}
                      onChange={(e) => {
                        setProspectStatusFilter(e.target.value);
                        setProspectPage(1);
                      }}
                      aria-label="Filter status prospek"
                    >
                      <option value="all">Semua status</option>
                      <option value="baru">Prospek baru</option>
                      <option value="dihubungi">Dihubungi</option>
                      <option value="tertarik">Berminat</option>
                      <option value="closing">Closing</option>
                      <option value="tidak_lanjut">Tidak lanjut</option>
                    </select>
                    <ChevronDown size={12} className="adv2-filter-chevron" />
                  </div>

                  {/* Package Filter */}
                  <div className="adv2-filter-wrap">
                    <Package size={13} className="adv2-filter-icon" />
                    <select
                      className="adv2-filter-select"
                      value={prospectPackageFilter}
                      onChange={(e) => {
                        setProspectPackageFilter(e.target.value);
                        setProspectPage(1);
                      }}
                      aria-label="Filter paket"
                    >
                      <option value="all">Semua paket</option>
                      {distinctPackages.map((pkg) => (
                        <option key={pkg} value={pkg}>
                          {pkg}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="adv2-filter-chevron" />
                  </div>

                  {/* Date Filter */}
                  <div className="adv2-filter-wrap">
                    <CalendarDays size={13} className="adv2-filter-icon" />
                    <select
                      className="adv2-filter-select"
                      value={prospectDateFilter}
                      onChange={(e) => {
                        setProspectDateFilter(e.target.value);
                        setProspectPage(1);
                      }}
                      aria-label="Filter rentang tanggal"
                    >
                      <option value="30d">30 hari terakhir</option>
                      <option value="7d">7 hari terakhir</option>
                      <option value="90d">90 hari terakhir</option>
                      <option value="all">Semua tanggal</option>
                    </select>
                    <ChevronDown size={12} className="adv2-filter-chevron" />
                  </div>
                </div>

                {/* Table Header */}
                <div className="adv2-prospects-thead">
                  <div className="adv2-th adv2-col-jamaah">JAMAAH</div>
                  <div className="adv2-th adv2-col-paket">PAKET</div>
                  <div className="adv2-th adv2-col-status">STATUS</div>
                  <div className="adv2-th adv2-col-followup">MASUK</div>
                  <div className="adv2-th adv2-col-source">SUMBER</div>
                  <div className="adv2-th adv2-col-updated">DIPERBARUI</div>
                </div>

                {/* Table Rows */}
                <div className="adv2-prospects-tbody">
                  {displayedProspects.length > 0 ? (
                    displayedProspects.map((p) => (
                      <div key={p.id} className="adv2-prospects-tr">
                        <div className="adv2-col-jamaah">
                          <span className="adv2-jamaah-name">{p.name}</span>
                          <span className="adv2-jamaah-phone">{p.phone}</span>
                        </div>
                        <div className="adv2-col-paket">{p.package_name}</div>
                        <div className="adv2-col-status">
                          <span className={`adv2-status-dot adv2-tone-bg--${p.tone}`} />
                          <span className="adv2-status-text">{p.status_label}</span>
                        </div>
                        <div className="adv2-col-followup">{p.created_label}</div>
                        <div className="adv2-col-source">{p.source}</div>
                        <div className="adv2-col-updated">{p.updated_at_relative}</div>
                      </div>
                    ))
                  ) : (
                    <div className="adv2-prospects-empty">
                      <Users size={32} className={styles.emptyIcon} />
                      <span className="adv2-prospects-empty-title">Tidak ada prospek ditemukan</span>
                      <span className="adv2-prospects-empty-desc">
                        Coba sesuaikan kata kunci, filter status/paket, atau rentang tanggal.
                      </span>
                    </div>
                  )}
                </div>

                {/* Table Footer */}
                <div className="adv2-prospects-tfoot">
                  <div className="adv2-prospects-count">
                    {displayedProspects.length} dari {filteredProspects.length} prospek
                  </div>
                  <div className="adv2-prospects-pagination">
                    <button
                      type="button"
                      className="adv2-page-btn"
                      disabled={prospectPage === 1}
                      onClick={() => setProspectPage((prev) => Math.max(1, prev - 1))}
                      aria-label="Halaman sebelumnya"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    {Array.from({ length: totalProspectPages }, (_, idx) => idx + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        className={`adv2-page-btn ${prospectPage === pageNum ? 'active' : ''}`}
                        onClick={() => setProspectPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="adv2-page-btn"
                      disabled={prospectPage === totalProspectPages}
                      onClick={() => setProspectPage((prev) => Math.min(totalProspectPages, prev + 1))}
                      aria-label="Halaman berikutnya"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )}

          {activeTab === 'jaringan' && (
            <div className="adv2-card adv2-network-panel">
              {subAgents.length === 0 ? (
                <div className="adv2-prospects-empty">
                  <Network size={24} className="adv2-empty-icon" />
                  <span className="adv2-prospects-empty-title">Belum ada sub-agen</span>
                  <span className="adv2-prospects-empty-desc">
                    Agen yang mendaftar lewat tautan referral {agent.name} akan tampil di sini.
                  </span>
                </div>
              ) : (
                subAgents.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    className="adv2-network-row"
                    onClick={() => navigate(`/agents/${sub.id}`)}
                  >
                    <span className="adv2-network-name">{sub.name}</span>
                    <span className="adv2-network-meta">
                      {sub.status === 'active' ? 'Aktif' : sub.status === 'pending' ? 'Pending' : sub.status === 'inactive' ? 'Nonaktif' : 'Ditolak'}
                      {' · '}Bergabung {formatDateWIB(sub.created_at)}
                      {closingAgentIds.has(sub.id) ? ' · Pernah closing' : ''}
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))
              )}
            </div>
          )}

          {activeTab === 'riwayat_komisi' && (
            <div className="adv2-commission-panel">
              {/* 1. Audit Summary Strip */}
              <div className="adv2-commission-audit-strip">
                <span className="adv2-commission-audit-label">Ringkasan ledger</span>

                <div className="adv2-commission-audit-item">
                  <span className="adv2-commission-audit-item-label">Komisi masuk</span>
                  <span className="adv2-commission-audit-item-val incoming">{formatIDR(totalKomisiMasuk)}</span>
                </div>

                <div className="adv2-commission-audit-item">
                  <span className="adv2-commission-audit-item-label">Komisi keluar</span>
                  <span className="adv2-commission-audit-item-val outgoing">{formatIDR(totalKomisiKeluar)}</span>
                </div>

                <div className="adv2-commission-audit-item">
                  <span className="adv2-commission-audit-item-label">Saldo siap cair</span>
                  <span className="adv2-commission-audit-item-val balance">{formatIDR(saldoLedger)}</span>
                </div>
              </div>

              {/* 2. Toolbar */}
              <div className="adv2-commission-toolbar">
                <div className="adv2-comm-search-wrap">
                  <Search size={13} color="var(--db-text-muted)" />
                  <input
                    type="text"
                    placeholder="Cari transaksi atau jamaah..."
                    value={commSearch}
                    onChange={(e) => {
                      setCommSearch(e.target.value);
                      setCommPage(1);
                    }}
                  />
                </div>

                <div className="adv2-comm-filter-select-wrap">
                  <ListFilter size={12} color="var(--db-text-muted)" />
                  <span className="adv2-comm-filter-label">
                    {commTypeFilter === 'all'
                      ? 'Semua transaksi'
                      : commTypeFilter === 'direct'
                        ? 'Direct'
                        : commTypeFilter === 'override'
                          ? 'Override'
                          : commTypeFilter === 'payout'
                            ? 'Pencairan'
                            : 'Koreksi'}
                  </span>
                  <ChevronDown size={11} color="var(--db-text-muted)" />
                  <select
                    value={commTypeFilter}
                    onChange={(e) => {
                      setCommTypeFilter(e.target.value);
                      setCommPage(1);
                    }}
                    aria-label="Filter jenis transaksi"
                  >
                    <option value="all">Semua transaksi</option>
                    <option value="direct">Direct</option>
                    <option value="override">Override</option>
                    <option value="payout">Pencairan</option>
                    <option value="koreksi">Koreksi</option>
                  </select>
                </div>

                <div className="adv2-comm-filter-select-wrap">
                  <CalendarDays size={12} color="var(--db-text-muted)" />
                  <span className="adv2-comm-filter-label">
                    {commDateFilter === 'year'
                      ? `Tahun ${currentYear}`
                      : commDateFilter === 'month'
                        ? 'Bulan ini'
                        : 'Semua tahun'}
                  </span>
                  <ChevronDown size={11} color="var(--db-text-muted)" />
                  <select
                    value={commDateFilter}
                    onChange={(e) => {
                      setCommDateFilter(e.target.value);
                      setCommPage(1);
                    }}
                    aria-label="Filter periode tanggal"
                  >
                    <option value="year">Tahun {currentYear}</option>
                    <option value="month">Bulan ini</option>
                    <option value="all">Semua tahun</option>
                  </select>
                </div>

                <button
                  type="button"
                  className="adv2-comm-export-btn"
                  onClick={exportCommissionCSV}
                  title="Ekspor CSV"
                >
                  <Download size={12} color="var(--db-text-muted)" />
                  <span>CSV</span>
                </button>
              </div>

              {/* 3. Table Header */}
              <div className="adv2-commission-thead">
                <span className="adv2-comm-col-date">TANGGAL</span>
                <span className="adv2-comm-col-ref">REFERENSI</span>
                <span className="adv2-comm-col-desc">KETERANGAN</span>
                <span className="adv2-comm-col-type">JENIS</span>
                <span className="adv2-comm-col-in">MASUK</span>
                <span className="adv2-comm-col-out">KELUAR</span>
                <span className="adv2-comm-col-bal">SALDO</span>
              </div>

              {/* 4. Table Body & Rows */}
              <div className="adv2-commission-tbody">
                {paginatedCommissions.length > 0 ? (
                  paginatedCommissions.map((row) => (
                    <div key={row.id} className="adv2-commission-tr">
                      <div className="adv2-comm-col-date">{row.date}</div>
                      <div className="adv2-comm-col-ref">{row.reference}</div>
                      <div className="adv2-comm-col-desc">{row.description}</div>
                      <div className="adv2-comm-col-type">{row.type}</div>
                      <div className="adv2-comm-col-in">
                        {row.incoming > 0 ? `+${formatIDR(row.incoming)}` : <span className="adv2-comm-col-dash">—</span>}
                      </div>
                      <div className="adv2-comm-col-out">
                        {row.outgoing > 0 ? `-${formatIDR(row.outgoing)}` : <span className="adv2-comm-col-dash">—</span>}
                      </div>
                      <div className="adv2-comm-col-bal">{formatIDR(row.balance)}</div>
                    </div>
                  ))
                ) : (
                  <div className="adv2-prospects-empty">
                    <ReceiptText size={24} className={styles.emptyIcon} />
                    <div className="adv2-prospects-empty-title">Tidak ada transaksi yang cocok</div>
                    <div className="adv2-prospects-empty-desc">Coba ubah kata kunci pencarian atau filter transaksi.</div>
                  </div>
                )}
              </div>

              {/* 5. Table Footer */}
              <div className="adv2-commission-tfoot">
                <div className="adv2-commission-count">
                  {paginatedCommissions.length} dari {filteredCommissions.length} transaksi
                </div>

                <div className="adv2-commission-pagination">
                  <button
                    type="button"
                    className="adv2-page-btn"
                    disabled={commPage === 1}
                    onClick={() => setCommPage((prev: number) => Math.max(1, prev - 1))}
                    aria-label="Halaman sebelumnya"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  {Array.from({ length: totalCommissionPages }, (_, idx) => idx + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      className={`adv2-page-btn ${commPage === pageNum ? 'active' : ''}`}
                      onClick={() => setCommPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="adv2-page-btn"
                    disabled={commPage === totalCommissionPages}
                    onClick={() => setCommPage((prev: number) => Math.min(totalCommissionPages, prev + 1))}
                    aria-label="Halaman berikutnya"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}

          </div>

          {/* ================= MODAL: EDIT PROFIL ================= */}
          <Modal
            isOpen={editProfileModalOpen}
            onClose={() => !savingProfile && setEditProfileModalOpen(false)}
            title="Edit Profil Agen"
            footer={
              <div className={styles.addiv25}>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setEditProfileModalOpen(false)}
                  disabled={savingProfile}
                >
                  <span>Batal</span>
                </Button>
                <Button
                  type="submit"
                  form="edit-agent-profile-form"
                  variant="primary"
                  size="md"
                  disabled={savingProfile}
                >
                  <CheckCircle2 size={16} />
                  <span>{savingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                </Button>
              </div>
            }
          >
            <form id="edit-agent-profile-form" onSubmit={handleSaveProfile} className={styles.adform26}>
              {profileError && (
                <div className="db-alert db-alert--error">
                  <AlertCircle size={16} />
                  <span>{profileError}</span>
                </div>
              )}

              <FormInput
                label="Nama Lengkap"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama lengkap agen"
                required
              />

              <FormInput
                label="No. WhatsApp"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Contoh: 081234567890"
                hint="Format nomor handphone atau WhatsApp aktif"
              />

              <FormInput
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alamat@email.com"
              />

              <FormInput
                label="Domisili"
                value={domisili}
                onChange={(e) => setDomisili(e.target.value)}
                placeholder="Kota / Kabupaten tempat tinggal"
              />
            </form>
          </Modal>

          {/* ================= MODAL: RESET / UBAH PASSWORD ================= */}
          <Modal
            isOpen={resetPasswordModalOpen}
            onClose={() => !resettingPassword && setResetPasswordModalOpen(false)}
            title="Ubah Password Akun Agen"
            footer={
              <div className={styles.addiv25}>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setResetPasswordModalOpen(false)}
                  disabled={resettingPassword}
                >
                  <span>Batal</span>
                </Button>
                <Button
                  type="submit"
                  form="reset-agent-password-form"
                  variant="primary"
                  size="md"
                  disabled={resettingPassword || !newPassword || !confirmPassword}
                >
                  <Lock size={16} />
                  <span>{resettingPassword ? 'Menyimpan...' : 'Simpan Password Baru'}</span>
                </Button>
              </div>
            }
          >
            <form id="reset-agent-password-form" onSubmit={handleExecuteResetPassword} className={styles.adform26}>
              <div
                className={styles.addiv27}
              >
                <ShieldAlert size={18} className={styles.accentIconTop} />
                <span>
                  Admin memiliki wewenang override untuk mengganti password agen <strong>{agent.name}</strong>. Password lama akan langsung tidak berlaku setelah disimpan.
                </span>
              </div>

              {passwordError && (
                <div className="db-alert db-alert--error">
                  <AlertCircle size={16} />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="db-form-group">
                <div className="db-form-label-row">
                  <label htmlFor={newPasswordId} className="db-form-label">
                    Password Baru <span className="db-form-label__required">*</span>
                  </label>
                </div>
                <input
                  id={newPasswordId}
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  required
                  className="db-form-input"
                />
                <span className="db-form-hint">Minimal 8 karakter kombinasi huruf dan angka</span>
              </div>

              <div className="db-form-group">
                <div className="db-form-label-row">
                  <label htmlFor={confirmPasswordId} className="db-form-label">
                    Konfirmasi Password Baru <span className="db-form-label__required">*</span>
                  </label>
                </div>
                <input
                  id={confirmPasswordId}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi password baru"
                  required
                  className="db-form-input"
                />
              </div>
            </form>
          </Modal>

          {/* Modal Konfirmasi Tindakan Status (Nonaktifkan / Aktifkan / Setujui / Tolak) */}
          <Modal
            isOpen={confirmStatusModal !== null && confirmStatusModal.isOpen}
            onClose={() => {
              setConfirmStatusModal(null);
              setRejectionReasonInput('');
            }}
            title={confirmStatusModal?.title || 'Konfirmasi'}
            footer={
              <div className={styles.addiv25}>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setConfirmStatusModal(null);
                    setRejectionReasonInput('');
                  }}
                  disabled={processingStatus}
                >
                  <span>Batal</span>
                </Button>
                <Button
                  variant={
                    confirmStatusModal?.action === 'deactivate' || confirmStatusModal?.action === 'reject'
                      ? 'secondary'
                      : 'primary'
                  }
                  size="md"
                  onClick={handleExecuteStatusChange}
                  disabled={
                    processingStatus ||
                    (confirmStatusModal?.action === 'reject' && !rejectionReasonInput.trim())
                  }
                  style={
                    confirmStatusModal?.action === 'deactivate' || confirmStatusModal?.action === 'reject'
                      ? { borderColor: 'var(--db-negative)', color: 'var(--db-negative)' }
                      : undefined
                  }
                >
                  {confirmStatusModal?.action === 'deactivate' ? (
                    <Ban size={16} />
                  ) : confirmStatusModal?.action === 'reject' ? (
                    <XCircle size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  <span>{processingStatus ? 'Memproses...' : 'Lanjutkan'}</span>
                </Button>
              </div>
            }
          >
            <div className={styles.addiv28}>
              <p className={styles.adp29}>{confirmStatusModal?.description}</p>
              {confirmStatusModal?.action === 'reject' && (
                <div className={styles.addiv30}>
                  <label
                    className={styles.adlabel31}
                  >
                    Alasan Penolakan <span className={styles.adspan32}>*</span>
                  </label>
                  <textarea
                    value={rejectionReasonInput}
                    onChange={(e) => setRejectionReasonInput(e.target.value)}
                    placeholder="Contoh: Bukti transfer tidak terbaca atau nominal pembayaran pendaftaran tidak sesuai."
                    rows={3}
                    className={styles.adtextarea33}
                  />
                </div>
              )}
            </div>
          </Modal>

          {/* Modal Preview Bukti Transfer */}
          <Modal
            isOpen={selectedProofUrl !== null}
            onClose={() => setSelectedProofUrl(null)}
            title={`Bukti Transfer Pendaftaran — ${agent.name}`}
            footer={
              <div className={styles.addiv34}>
                {selectedProofUrl && (
                  <a
                    href={getFullImageUrl(selectedProofUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.ada35}
                  >
                    <ExternalLink size={14} />
                    <span>Buka Ukuran Penuh</span>
                  </a>
                )}
                <Button variant="secondary" size="md" onClick={() => setSelectedProofUrl(null)}>
                  <span>Tutup</span>
                </Button>
              </div>
            }
          >
            {selectedProofUrl && (
              <div
                className={styles.addiv36}
              >
                <img
                  src={getFullImageUrl(selectedProofUrl)}
                  alt={`Bukti Transfer ${agent.name}`}
                  className={styles.adimg37}
                />
              </div>
            )}
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default AgentDetailPage;
