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
  Briefcase,
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
  AgentActivityFeed,
} from '../components';
import {
  type AgentDashboardDetail,
  type ProspectItem,
  fetchAgentDetail,
  fetchProspects,
  updateDashboardAgentProfile,
  resetAgentPassword,
  toggleAgentStatus,
  approveAgent,
  rejectAgent,
  getFullImageUrl,
  getStoredUser,
} from '../services/api';
import './AgentDetail.css';

const formatIDR = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

interface AgentProspectRow {
  id: number;
  name: string;
  phone: string;
  package_name: string;
  status: 'baru' | 'dihubungi' | 'tertarik' | 'closing' | 'tidak_lanjut';
  status_label: string;
  status_color: string;
  follow_up: string;
  is_overdue?: boolean;
  source: string;
  updated_at_relative: string;
}

interface CommissionLedgerRow {
  id: number;
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

const SAMPLE_COMMISSION_LEDGER: CommissionLedgerRow[] = [
  { id: 1, date: '14 Mar', reference: 'COM-260314', description: 'Closing · Siti Aminah', type: 'Direct', incoming: 500000, outgoing: 0, balance: 2500000, year: 2026, month: 3 },
  { id: 2, date: '10 Mar', reference: 'PAY-260310', description: 'Pencairan komisi', type: 'Pencairan', incoming: 0, outgoing: 1500000, balance: 2000000, year: 2026, month: 3 },
  { id: 3, date: '8 Mar', reference: 'COM-260308', description: 'Override dari jaringan', type: 'Override', incoming: 250000, outgoing: 0, balance: 3500000, year: 2026, month: 3 },
  { id: 4, date: '1 Mar', reference: 'COM-260301', description: 'Penambahan jumlah jamaah', type: 'Koreksi', incoming: 250000, outgoing: 0, balance: 3250000, year: 2026, month: 3 },
  { id: 5, date: '20 Feb', reference: 'COM-260220', description: 'Closing · Dewi Kartika', type: 'Direct', incoming: 500000, outgoing: 0, balance: 2500000, year: 2026, month: 2 },
  { id: 6, date: '12 Feb', reference: 'COM-260212', description: 'Override dari jaringan', type: 'Override', incoming: 250000, outgoing: 0, balance: 2500000, year: 2026, month: 2 },
  { id: 7, date: '28 Jan', reference: 'COM-260128', description: 'Pengurangan jumlah jamaah', type: 'Koreksi', incoming: 0, outgoing: 250000, balance: 2250000, year: 2026, month: 1 },
  { id: 8, date: '24 Jan', reference: 'COM-260124', description: 'Closing · Farhan Maulana', type: 'Direct', incoming: 500000, outgoing: 0, balance: 2500000, year: 2026, month: 1 },
  { id: 9, date: '20 Jan', reference: 'COM-260120', description: 'Override dari jaringan', type: 'Override', incoming: 250000, outgoing: 0, balance: 2000000, year: 2026, month: 1 },
  { id: 10, date: '15 Jan', reference: 'COM-260115', description: 'Closing · Nur Aisyah', type: 'Direct', incoming: 500000, outgoing: 0, balance: 1750000, year: 2026, month: 1 },
  { id: 11, date: '10 Jan', reference: 'COM-260110', description: 'Closing · Hendra Wijaya', type: 'Direct', incoming: 500000, outgoing: 0, balance: 1250000, year: 2026, month: 1 },
  { id: 12, date: '5 Jan', reference: 'COM-260105', description: 'Bonus aktivasi referral', type: 'Direct', incoming: 250000, outgoing: 0, balance: 750000, year: 2026, month: 1 },
  { id: 13, date: '28 Des', reference: 'PAY-251228', description: 'Pencairan komisi akhir tahun', type: 'Pencairan', incoming: 0, outgoing: 1000000, balance: 500000, year: 2025, month: 12 },
  { id: 14, date: '20 Des', reference: 'COM-251220', description: 'Closing · Rudi Hartono', type: 'Direct', incoming: 500000, outgoing: 0, balance: 1500000, year: 2025, month: 12 },
  { id: 15, date: '15 Des', reference: 'COM-251215', description: 'Override dari jaringan', type: 'Override', incoming: 250000, outgoing: 0, balance: 1000000, year: 2025, month: 12 },
  { id: 16, date: '10 Des', reference: 'COM-251210', description: 'Closing · Aulia Rahman', type: 'Direct', incoming: 500000, outgoing: 0, balance: 750000, year: 2025, month: 12 },
  { id: 17, date: '25 Nov', reference: 'COM-251125', description: 'Closing · Faisal Akbar', type: 'Direct', incoming: 500000, outgoing: 0, balance: 250000, year: 2025, month: 11 },
  { id: 18, date: '20 Nov', reference: 'COM-251120', description: 'Override dari jaringan', type: 'Override', incoming: 250000, outgoing: 0, balance: 500000, year: 2025, month: 11 },
  { id: 19, date: '15 Nov', reference: 'PAY-251115', description: 'Pencairan komisi', type: 'Pencairan', incoming: 0, outgoing: 750000, balance: 250000, year: 2025, month: 11 },
  { id: 20, date: '5 Nov', reference: 'COM-251105', description: 'Closing · Bambang Sutrisno', type: 'Direct', incoming: 500000, outgoing: 0, balance: 1000000, year: 2025, month: 11 },
  { id: 21, date: '28 Okt', reference: 'COM-251028', description: 'Closing · Rina Marlina', type: 'Direct', incoming: 500000, outgoing: 0, balance: 500000, year: 2025, month: 10 },
  { id: 22, date: '20 Okt', reference: 'COM-251020', description: 'Override dari jaringan', type: 'Override', incoming: 250000, outgoing: 0, balance: 250000, year: 2025, month: 10 },
  { id: 23, date: '15 Okt', reference: 'COM-251015', description: 'Bonus registrasi agen pertama', type: 'Direct', incoming: 250000, outgoing: 0, balance: 250000, year: 2025, month: 10 },
];

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

  // Tab Prospek Filter & Pagination States
  const [prospectSearch, setProspectSearch] = useState<string>('');
  const [prospectStatusFilter, setProspectStatusFilter] = useState<string>('all');
  const [prospectPackageFilter, setProspectPackageFilter] = useState<string>('all');
  const [prospectDateFilter, setProspectDateFilter] = useState<string>('30d');
  const [prospectPage, setProspectPage] = useState<number>(1);

  // Tab Riwayat Komisi Filter & Pagination States
  const [commSearch, setCommSearch] = useState<string>('');
  const [commTypeFilter, setCommTypeFilter] = useState<string>('all');
  const [commDateFilter, setCommDateFilter] = useState<string>('2026');
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
      const [agentData, prospectsData] = await Promise.all([
        fetchAgentDetail(agentId),
        fetchProspects().catch(() => [] as ProspectItem[]),
      ]);
      setAgent(agentData);
      setRealProspects(prospectsData.filter((p: ProspectItem) => p.agent_id === agentId));
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
          <main className="db-page-container" style={{ maxWidth: '1400px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '320px', color: 'var(--db-text-muted)', gap: '10px' }}>
              <RefreshCw size={24} className="db-spin" />
              <span style={{ fontSize: 'var(--font-size-lg)' }}>Memuat data agen...</span>
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
          <main className="db-page-container" style={{ maxWidth: '1400px' }}>
            <Card>
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--db-negative)' }}>
                <AlertCircle size={32} style={{ marginBottom: '12px' }} />
                <p style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-lg)', marginBottom: '8px' }}>Terjadi Kesalahan</p>
                <p style={{ color: 'var(--db-text-muted)', fontSize: 'var(--font-size-md)', marginBottom: '16px' }}>{error || 'Agen tidak ditemukan'}</p>
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

  const activeProspects: AgentProspectRow[] = realProspects.length > 0
    ? realProspects.map((p) => {
        const getStatusMeta = (s: string) => {
          switch (s) {
            case 'baru':
              return { label: 'Prospek baru', color: '#0369A1' };
            case 'dihubungi':
              return { label: 'Dihubungi', color: '#4338CA' };
            case 'tertarik':
              return { label: 'Berminat', color: '#F59E0B' };
            case 'closing':
              return { label: 'Closing', color: '#0D9488' };
            case 'tidak_lanjut':
              return { label: 'Tidak lanjut', color: '#64748B' };
            default:
              return { label: s, color: '#64748B' };
          }
        };
        const meta = getStatusMeta(p.status);
        return {
          id: p.id,
          name: p.name,
          phone: p.phone,
          package_name: p.package_name || 'Umroh Reguler',
          status: p.status,
          status_label: meta.label,
          status_color: meta.color,
          follow_up: p.status === 'closing' ? 'Selesai' : p.status === 'tidak_lanjut' ? '—' : 'Hari ini',
          source: p.source_channel || 'Referral',
          updated_at_relative: 'Hari ini',
        };
      })
    : [];

  const filteredProspects = activeProspects.filter((p) => {
    if (prospectSearch.trim()) {
      const q = prospectSearch.toLowerCase().trim();
      const matchName = p.name.toLowerCase().includes(q);
      const matchPhone = p.phone.toLowerCase().includes(q);
      const matchPkg = p.package_name.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchPkg) return false;
    }
    if (prospectStatusFilter !== 'all') {
      if (p.status !== prospectStatusFilter) return false;
    }
    if (prospectPackageFilter !== 'all') {
      if (p.package_name !== prospectPackageFilter) return false;
    }
    return true;
  });

  const PROSPECTS_PER_PAGE = 9;
  const totalProspectPages = Math.max(1, Math.ceil(filteredProspects.length / PROSPECTS_PER_PAGE));
  const displayedProspects = filteredProspects.slice(
    (prospectPage - 1) * PROSPECTS_PER_PAGE,
    prospectPage * PROSPECTS_PER_PAGE
  );

  const distinctPackages = Array.from(new Set(activeProspects.map((p) => p.package_name)));

  // Tab Riwayat Komisi calculations
  const hasRealCommission = Boolean(agent?.riwayat_komisi && agent.riwayat_komisi.length > 0);
  const displayCommissions: CommissionLedgerRow[] = hasRealCommission
    ? (agent?.riwayat_komisi?.map((item, idx) => {
        const d = new Date(item.created_at);
        const dateStr = !isNaN(d.getTime())
          ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
          : '14 Mar';
        const typeLabel: 'Direct' | 'Override' | 'Pencairan' | 'Koreksi' =
          item.type === 'override' ? 'Override' :
          item.type === 'payout' ? 'Pencairan' :
          item.type === 'correction' ? 'Koreksi' : 'Direct';
        const isIncoming = item.direction === 'masuk';
        return {
          id: item.id || idx + 1,
          date: dateStr,
          reference: item.type === 'payout' ? `PAY-2603${String(idx + 1).padStart(2, '0')}` : `COM-2603${String(idx + 1).padStart(2, '0')}`,
          description: item.description,
          type: typeLabel,
          incoming: isIncoming ? item.amount : 0,
          outgoing: !isIncoming ? item.amount : 0,
          balance: 2500000,
          year: !isNaN(d.getTime()) ? d.getFullYear() : 2026,
          month: !isNaN(d.getTime()) ? d.getMonth() + 1 : 3,
        };
      }) ?? [])
    : SAMPLE_COMMISSION_LEDGER;

  const totalKomisiMasuk = hasRealCommission
    ? (agent?.riwayat_komisi?.filter((c) => c.direction === 'masuk').reduce((sum, c) => sum + c.amount, 0) ?? 0)
    : 4000000;
  const totalKomisiKeluar = hasRealCommission
    ? (agent?.riwayat_komisi?.filter((c) => c.direction === 'keluar').reduce((sum, c) => sum + c.amount, 0) ?? 0)
    : 1500000;
  const saldoLedger = hasRealCommission
    ? (agent?.saldo_siap_cair ?? (totalKomisiMasuk - totalKomisiKeluar))
    : 2500000;

  const filteredCommissions = displayCommissions.filter((item) => {
    if (commSearch.trim()) {
      const q = commSearch.toLowerCase().trim();
      const matchRef = item.reference.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchType = item.type.toLowerCase().includes(q);
      if (!matchRef && !matchDesc && !matchType) return false;
    }
    if (commTypeFilter !== 'all') {
      if (item.type.toLowerCase() !== commTypeFilter.toLowerCase()) return false;
    }
    if (commDateFilter === '2026') {
      if (item.year !== 2026) return false;
    } else if (commDateFilter === 'month') {
      if (item.year !== 2026 || item.month !== 3) return false;
    }
    return true;
  });

  const COMMISSIONS_PER_PAGE = 7;
  const totalCommissionPages = Math.max(1, Math.ceil(filteredCommissions.length / COMMISSIONS_PER_PAGE));
  const paginatedCommissions = filteredCommissions.slice(
    (commPage - 1) * COMMISSIONS_PER_PAGE,
    commPage * COMMISSIONS_PER_PAGE
  );

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

        <main className="db-page-container" style={{ maxWidth: '1400px' }}>
          {/* Top Notification Alerts */}
          {successMessage && (
            <div className="db-alert db-alert--success" style={{ marginBottom: '16px' }}>
              <CheckCircle2 size={18} />
              <span>{successMessage}</span>
            </div>
          )}

          {error && (
            <div className="db-alert db-alert--error" style={{ marginBottom: '16px' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Status Penolakan Banner */}
          {agent.status === 'rejected' && (
            <div
              className="db-alert db-alert--error"
              style={{
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '14px 16px',
              }}
            >
              <XCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 'var(--font-size-md)' }}>Pendaftaran Agen Ditolak</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--db-text-primary)' }}>
                  Alasan penolakan: <strong>{agent.rejection_reason || 'Tidak memenuhi kriteria kelayakan mitra agen.'}</strong>
                </p>
                {agent.payment_proof_url && (
                  <div style={{ marginTop: '10px' }}>
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
              className="db-alert db-alert--warning"
              style={{
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '14px 16px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={20} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--font-size-md)' }}>
                  Pendaftaran agen ini sedang menunggu verifikasi dan persetujuan admin.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
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
                <div style={{ position: 'relative' }}>
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
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '42px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        zIndex: 50,
                        minWidth: '180px',
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '6px 0',
                      }}
                    >
                      {waTarget && (
                        <a
                          href={`https://wa.me/${waTarget}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 14px',
                            fontSize: 'var(--font-size-sm)',
                            color: '#10B981',
                            textDecoration: 'none',
                          }}
                          onClick={() => setMoreMenuOpen(false)}
                        >
                          <MessageCircle size={14} />
                          <span>Chat WhatsApp</span>
                        </a>
                      )}
                      <button
                        type="button"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 14px',
                          fontSize: 'var(--font-size-sm)',
                          color: '#0F172A',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                        }}
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
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 14px',
                            fontSize: 'var(--font-size-sm)',
                            color: '#EF4444',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
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
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 14px',
                            fontSize: 'var(--font-size-sm)',
                            color: '#10B981',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
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
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 14px',
                              fontSize: 'var(--font-size-sm)',
                              color: '#10B981',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                            }}
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
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 14px',
                              fontSize: 'var(--font-size-sm)',
                              color: '#EF4444',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                            }}
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
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 14px',
                            fontSize: 'var(--font-size-sm)',
                            color: '#10B981',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
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
                    {agent.phone || '0812 7788 1021'} · {agent.domisili || 'Jakarta'}
                  </div>
                  <div className="adv2-referral-code">
                    Kode agen {agent.referral_code || 'AHMAD24'}
                  </div>
                </div>
              </div>
              <div className="adv2-identity-metadata">
                <div className="adv2-meta-item">
                  <GitBranch size={14} className="adv2-meta-icon" />
                  <div className="adv2-meta-copy">
                    <span className="adv2-meta-label">Direkrut oleh</span>
                    <span className="adv2-meta-value">Mandiri</span>
                  </div>
                </div>
                <div className="adv2-meta-item">
                  <CalendarDays size={14} className="adv2-meta-icon" />
                  <div className="adv2-meta-copy">
                    <span className="adv2-meta-label">Bergabung</span>
                    <span className="adv2-meta-value">
                      {agent.created_at
                        ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(agent.created_at))
                        : '12 Jan 2026'}
                    </span>
                  </div>
                </div>
                <div className="adv2-meta-item">
                  <Clock3 size={14} className="adv2-meta-icon" />
                  <div className="adv2-meta-copy">
                    <span className="adv2-meta-label">Aktivitas terakhir</span>
                    <span className="adv2-meta-value">Hari ini, 10.18</span>
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
                    <div className="adv2-metric-icon-box" style={{ color: '#0F766E' }}>
                      <Users size={16} />
                    </div>
                    <div className="adv2-metric-copy">
                      <span className="adv2-metric-label">Total prospek</span>
                      <span className="adv2-metric-value">
                        {agent.ringkasan_jamaah ? (agent.ringkasan_jamaah.baru + agent.ringkasan_jamaah.diproses + agent.ringkasan_jamaah.closing) : 34}
                      </span>
                      <span className="adv2-metric-subtext">Sejak bergabung</span>
                    </div>
                  </div>
                  <div className="adv2-metric-col">
                    <div className="adv2-metric-icon-box" style={{ color: '#F59E0B' }}>
                      <MessagesSquare size={16} />
                    </div>
                    <div className="adv2-metric-copy">
                      <span className="adv2-metric-label">Sedang ditangani</span>
                      <span className="adv2-metric-value">
                        {agent.ringkasan_jamaah ? agent.ringkasan_jamaah.diproses : 6}
                      </span>
                      <span className="adv2-metric-subtext">Perlu tindak lanjut</span>
                    </div>
                  </div>
                  <div className="adv2-metric-col">
                    <div className="adv2-metric-icon-box" style={{ color: '#0D9488' }}>
                      <CheckCircle2 size={16} />
                    </div>
                    <div className="adv2-metric-copy">
                      <span className="adv2-metric-label">Jamaah closing</span>
                      <span className="adv2-metric-value">
                        {agent.ringkasan_jamaah ? agent.ringkasan_jamaah.closing : 8}
                      </span>
                      <span className="adv2-metric-subtext">23,5% dari prospek</span>
                    </div>
                  </div>
                  <div className="adv2-metric-col">
                    <div className="adv2-metric-icon-box" style={{ color: '#4338CA' }}>
                      <Wallet size={16} />
                    </div>
                    <div className="adv2-metric-copy">
                      <span className="adv2-metric-label">Komisi tercatat</span>
                      <span className="adv2-metric-value">Rp4.000.000</span>
                      <span className="adv2-metric-subtext">8 transaksi</span>
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
                        <Filter size={15} style={{ color: '#0F766E' }} />
                        <div className="adv2-card-header-copy">
                          <h3 className="adv2-card-title">Pipeline jamaah</h3>
                          <p className="adv2-card-subtitle">
                            Perkembangan {agent.ringkasan_jamaah ? (agent.ringkasan_jamaah.baru + agent.ringkasan_jamaah.diproses + agent.ringkasan_jamaah.closing) : 34} prospek milik agen ini.
                          </p>
                        </div>
                      </div>
                      <div className="adv2-pipeline-body">
                        <div className="adv2-pipeline-item">
                          <span className="adv2-pipeline-val">12</span>
                          <div className="adv2-pipeline-bar" style={{ backgroundColor: '#0369A1' }} />
                          <span className="adv2-pipeline-lbl">Prospek baru</span>
                        </div>
                        <div className="adv2-pipeline-item">
                          <span className="adv2-pipeline-val">9</span>
                          <div className="adv2-pipeline-bar" style={{ backgroundColor: '#4338CA' }} />
                          <span className="adv2-pipeline-lbl">Dihubungi</span>
                        </div>
                        <div className="adv2-pipeline-item">
                          <span className="adv2-pipeline-val">5</span>
                          <div className="adv2-pipeline-bar" style={{ backgroundColor: '#F59E0B' }} />
                          <span className="adv2-pipeline-lbl">Berminat</span>
                        </div>
                        <div className="adv2-pipeline-item">
                          <span className="adv2-pipeline-val">8</span>
                          <div className="adv2-pipeline-bar" style={{ backgroundColor: '#0D9488' }} />
                          <span className="adv2-pipeline-lbl">Closing</span>
                        </div>
                      </div>
                    </div>

                    {/* Recent Prospects Table */}
                    <div className="adv2-card">
                      <div className="adv2-card-header">
                        <Users size={15} style={{ color: '#0F766E' }} />
                        <div className="adv2-card-header-copy">
                          <h3 className="adv2-card-title">Prospek terbaru</h3>
                          <p className="adv2-card-subtitle">Aktivitas jamaah yang terakhir diperbarui.</p>
                        </div>
                      </div>
                      <div className="adv2-table">
                        <div className="adv2-thead">
                          <span style={{ width: '230px' }}>JAMAAH</span>
                          <span style={{ width: '220px' }}>PAKET</span>
                          <span style={{ width: '120px' }}>STATUS</span>
                          <span style={{ width: '110px' }}>DIPERBARUI</span>
                        </div>
                        <div className="adv2-tbody">
                          <div className="adv2-tr">
                            <div className="adv2-td-jamaah" style={{ width: '230px' }}>
                              <span className="adv2-jamaah-name">Siti Aminah</span>
                              <span className="adv2-jamaah-phone">0813 8821 0091</span>
                            </div>
                            <div className="adv2-td-paket" style={{ width: '220px' }}>
                              Umroh Syawal 9 Hari
                            </div>
                            <div className="adv2-td-status" style={{ width: '120px' }}>
                              <span className="adv2-status-dot" style={{ backgroundColor: '#F59E0B' }} />
                              <span className="adv2-status-name">Berminat</span>
                            </div>
                            <div className="adv2-td-updated" style={{ width: '110px' }}>
                              15 menit lalu
                            </div>
                          </div>

                          <div className="adv2-tr">
                            <div className="adv2-td-jamaah" style={{ width: '230px' }}>
                              <span className="adv2-jamaah-name">Hendra Wijaya</span>
                              <span className="adv2-jamaah-phone">0821 1109 7742</span>
                            </div>
                            <div className="adv2-td-paket" style={{ width: '220px' }}>
                              Umroh Hemat 12 Hari
                            </div>
                            <div className="adv2-td-status" style={{ width: '120px' }}>
                              <span className="adv2-status-dot" style={{ backgroundColor: '#4338CA' }} />
                              <span className="adv2-status-name">Dihubungi</span>
                            </div>
                            <div className="adv2-td-updated" style={{ width: '110px' }}>
                              1 jam lalu
                            </div>
                          </div>

                          <div className="adv2-tr">
                            <div className="adv2-td-jamaah" style={{ width: '230px' }}>
                              <span className="adv2-jamaah-name">Nur Aisyah</span>
                              <span className="adv2-jamaah-phone">0856 7720 3319</span>
                            </div>
                            <div className="adv2-td-paket" style={{ width: '220px' }}>
                              Umroh Syawal 9 Hari
                            </div>
                            <div className="adv2-td-status" style={{ width: '120px' }}>
                              <span className="adv2-status-dot" style={{ backgroundColor: '#0D9488' }} />
                              <span className="adv2-status-name">Closing</span>
                            </div>
                            <div className="adv2-td-updated" style={{ width: '110px' }}>
                              Kemarin
                            </div>
                          </div>
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
                        <Users size={15} style={{ color: '#0F766E' }} />
                        <div className="adv2-card-header-copy">
                          <h3 className="adv2-card-title">Kontak dan profil</h3>
                          <p className="adv2-card-subtitle">Data terdaftar milik agen.</p>
                        </div>
                      </div>
                      <div className="adv2-contact-list">
                        <div className="adv2-contact-item">
                          <Phone size={13} />
                          <span>{agent.phone || '0812 7788 1021'}</span>
                        </div>
                        <div className="adv2-contact-item">
                          <Mail size={13} />
                          <span>{agent.email || 'ahmad.fauzi@email.com'}</span>
                        </div>
                        <div className="adv2-contact-item">
                          <MapPin size={13} />
                          <span>{agent.domisili || 'Jakarta Selatan'}</span>
                        </div>
                        <div className="adv2-contact-item">
                          <Briefcase size={13} />
                          <span>Wiraswasta</span>
                        </div>
                      </div>
                    </div>

                    {/* Card: Jaringan agen */}
                    <div className="adv2-card">
                      <div className="adv2-card-header">
                        <Network size={15} style={{ color: '#0F766E' }} />
                        <div className="adv2-card-header-copy">
                          <h3 className="adv2-card-title">Jaringan agen</h3>
                          <p className="adv2-card-subtitle">Struktur referral di bawah agen ini.</p>
                        </div>
                      </div>
                      <div className="adv2-network-stats">
                        <div className="adv2-net-stat">
                          <span className="adv2-net-val">14</span>
                          <span className="adv2-net-lbl">Agen direkrut</span>
                        </div>
                        <div className="adv2-net-stat">
                          <span className="adv2-net-val">9</span>
                          <span className="adv2-net-lbl">Agen aktif</span>
                        </div>
                        <div className="adv2-net-stat">
                          <span className="adv2-net-val">3</span>
                          <span className="adv2-net-lbl">Pernah closing</span>
                        </div>
                      </div>
                    </div>

                    {/* Card: Saldo komisi */}
                    <div className="adv2-card">
                      <div className="adv2-card-header">
                        <Wallet size={15} style={{ color: '#0F766E' }} />
                        <div className="adv2-card-header-copy">
                          <h3 className="adv2-card-title">Saldo komisi</h3>
                          <p className="adv2-card-subtitle">Ringkasan komisi yang dapat dicairkan.</p>
                        </div>
                      </div>
                      <div className="adv2-saldo-body">
                        <span className="adv2-saldo-lbl">Saldo tersedia</span>
                        <span className="adv2-saldo-val">{formatIDR(agent.saldo_siap_cair || 2500000)}</span>
                        <div className="adv2-saldo-footer">
                          <span className="adv2-saldo-sub">
                            Sudah dicairkan {formatIDR(agent.saldo_tertunda || 1500000)}
                          </span>
                          <button
                            type="button"
                            className="adv2-saldo-link"
                            onClick={() => setActiveTab('riwayat_komisi')}
                          >
                            8 transaksi
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'aktivitas' && (
              <AgentActivityFeed />
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
                  <div className="adv2-th adv2-col-followup">TINDAK LANJUT</div>
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
                          <span
                            className={`adv2-status-dot ${p.status}`}
                            style={{ backgroundColor: p.status_color }}
                          />
                          <span className="adv2-status-text">{p.status_label}</span>
                        </div>
                        <div className={`adv2-col-followup ${p.is_overdue ? 'overdue' : ''}`}>
                          {p.follow_up}
                        </div>
                        <div className="adv2-col-source">{p.source}</div>
                        <div className="adv2-col-updated">{p.updated_at_relative}</div>
                      </div>
                    ))
                  ) : (
                    <div className="adv2-prospects-empty">
                      <Users size={32} style={{ color: '#64748B', opacity: 0.5, marginBottom: '8px' }} />
                      <span className="adv2-prospects-empty-title">Tidak ada prospek ditemukan</span>
                      <span className="adv2-prospects-empty-desc">
                        Coba sesuaikan kata kunci pencarian atau filter status/paket.
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
            <div style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: 'var(--db-card-bg)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--db-border)' }}>
              <MessageCircle size={32} style={{ color: 'var(--db-text-muted)', opacity: 0.6, marginBottom: '16px' }} />
              <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--db-text-primary)', marginBottom: '8px' }}>Jaringan Sub-Agen</h3>
              <p style={{ color: 'var(--db-text-muted)', fontSize: 'var(--font-size-md)', maxWidth: '400px', margin: '0 auto' }}>Daftar sub-agen yang mendaftar melalui tautan referral agen ini akan ditampilkan di sini.</p>
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
                  <span className="adv2-commission-audit-item-label">Saldo</span>
                  <span className="adv2-commission-audit-item-val balance">{formatIDR(saldoLedger)}</span>
                </div>
              </div>

              {/* 2. Toolbar */}
              <div className="adv2-commission-toolbar">
                <div className="adv2-comm-search-wrap">
                  <Search size={13} color="#64748B" />
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
                  <ListFilter size={12} color="#64748B" />
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
                  <ChevronDown size={11} color="#64748B" />
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
                  <CalendarDays size={12} color="#64748B" />
                  <span className="adv2-comm-filter-label">
                    {commDateFilter === '2026'
                      ? 'Tahun 2026'
                      : commDateFilter === 'month'
                        ? 'Bulan ini'
                        : 'Semua tahun'}
                  </span>
                  <ChevronDown size={11} color="#64748B" />
                  <select
                    value={commDateFilter}
                    onChange={(e) => {
                      setCommDateFilter(e.target.value);
                      setCommPage(1);
                    }}
                    aria-label="Filter periode tanggal"
                  >
                    <option value="2026">Tahun 2026</option>
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
                  <Download size={12} color="#64748B" />
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
                    <ReceiptText size={24} style={{ color: '#64748B', opacity: 0.6, marginBottom: '8px' }} />
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%' }}>
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
            <form id="edit-agent-profile-form" onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%' }}>
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
            <form id="reset-agent-password-form" onSubmit={handleExecuteResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px 14px',
                  backgroundColor: 'var(--db-chart-area-fill)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-base)',
                  color: 'var(--db-text-muted)',
                  lineHeight: 1.5,
                }}
              >
                <ShieldAlert size={18} style={{ color: 'var(--db-accent-teal)', flexShrink: 0, marginTop: '2px' }} />
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%' }}>
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
            <div style={{ fontSize: 'var(--font-size-md)', lineHeight: 1.6, color: 'var(--db-text-primary)' }}>
              <p style={{ margin: 0 }}>{confirmStatusModal?.description}</p>
              {confirmStatusModal?.action === 'reject' && (
                <div style={{ marginTop: '14px' }}>
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
                    value={rejectionReasonInput}
                    onChange={(e) => setRejectionReasonInput(e.target.value)}
                    placeholder="Contoh: Bukti transfer tidak terbaca atau nominal pembayaran pendaftaran tidak sesuai."
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
              )}
            </div>
          </Modal>

          {/* Modal Preview Bukti Transfer */}
          <Modal
            isOpen={selectedProofUrl !== null}
            onClose={() => setSelectedProofUrl(null)}
            title={`Bukti Transfer Pendaftaran — ${agent.name}`}
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
                <Button variant="secondary" size="md" onClick={() => setSelectedProofUrl(null)}>
                  <span>Tutup</span>
                </Button>
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
                  alt={`Bukti Transfer ${agent.name}`}
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
        </main>
      </div>
    </div>
  );
};

export default AgentDetailPage;
