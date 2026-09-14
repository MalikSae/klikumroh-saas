import React, { useState, useEffect, useMemo } from 'react';
import {
  Award,
  Plus,
  Calendar,
  CheckCircle2,
  Download,
  AlertCircle,
  Edit2,
  Trash2,
  Lock,
  Gift,
  Search,
  Check,
  X,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Button,
  Badge,
  Modal,
  Table,
  Card,
  FormInput,
  getStandardMenuItems,
  type Column,
} from '../components';
import {
  type AgentTarget,
  type AgentTargetProgressRow,
  type AchievementItem,
  type CreateTargetInput,
  type UpdateTargetInput,
  fetchTargets,
  createTarget,
  updateTarget,
  deleteTarget,
  fetchTargetProgress,
  closeTargetPeriod,
  fetchTargetAchievements,
  markRewardGiven,
  exportTargetAchievementsCSV,
  getStoredUser,
} from '../services/api';

export const AgentTargetsPage: React.FC = () => {
  const [targets, setTargets] = useState<AgentTarget[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Create / Edit Target Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingTarget, setEditingTarget] = useState<AgentTarget | null>(null);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formMetricType, setFormMetricType] = useState<'closing_pax' | 'mitra_baru_count'>('closing_pax');
  const [formMetricValue, setFormMetricValue] = useState<string>('10');
  const [formRewardDesc, setFormRewardDesc] = useState<string>('');
  const [formPeriodStart, setFormPeriodStart] = useState<string>('');
  const [formPeriodEnd, setFormPeriodEnd] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savingTarget, setSavingTarget] = useState<boolean>(false);

  // Progress Modal State
  const [isProgressModalOpen, setIsProgressModalOpen] = useState<boolean>(false);
  const [progressTarget, setProgressTarget] = useState<AgentTarget | null>(null);
  const [progressRows, setProgressRows] = useState<AgentTargetProgressRow[]>([]);
  const [loadingProgress, setLoadingProgress] = useState<boolean>(false);

  // Close Target Modal State
  const [isCloseModalOpen, setIsCloseModalOpen] = useState<boolean>(false);
  const [targetToClose, setTargetToClose] = useState<AgentTarget | null>(null);
  const [closing, setClosing] = useState<boolean>(false);

  // Achievements Modal State
  const [isAchievementsModalOpen, setIsAchievementsModalOpen] = useState<boolean>(false);
  const [achievementsTarget, setAchievementsTarget] = useState<AgentTarget | null>(null);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [loadingAchievements, setLoadingAchievements] = useState<boolean>(false);
  const [achievementRewardFilter, setAchievementRewardFilter] = useState<'all' | 'pending' | 'given'>('all');

  // Mark Reward Modal State
  const [isRewardModalOpen, setIsRewardModalOpen] = useState<boolean>(false);
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementItem | null>(null);
  const [rewardNotes, setRewardNotes] = useState<string>('');
  const [savingReward, setSavingReward] = useState<boolean>(false);

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [targetToDelete, setTargetToDelete] = useState<AgentTarget | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const user = getStoredUser();

  const loadTargets = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTargets();
      setTargets(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar target');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTargets();
  }, []);

  const filteredTargets = useMemo(() => {
    return targets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title?.toLowerCase().includes(q) || false;
        const matchReward = t.reward_description?.toLowerCase().includes(q) || false;
        return matchTitle || matchReward;
      }
      return true;
    });
  }, [targets, statusFilter, searchQuery]);

  const formatDateIndo = (dateStr: string): string => {
    if (!dateStr) return '-';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parts[0];
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = parts[2];
        const monthNames = [
          'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
          'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
        ];
        return `${day} ${monthNames[monthIndex] || parts[1]} ${year}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const getMetricLabel = (metricType: string): string => {
    if (metricType === 'mitra_baru_count') {
      return 'Rekrut Mitra Baru (Downline)';
    }
    return 'Closing Jamaah (Pax)';
  };

  const handleOpenCreateModal = () => {
    setEditingTarget(null);
    setFormTitle('');
    setFormMetricType('closing_pax');
    setFormMetricValue('10');
    setFormRewardDesc('');
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const firstDay = `${y}-${m}-01`;
    const lastDayObj = new Date(y, now.getMonth() + 1, 0);
    const lastDay = `${y}-${m}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
    setFormPeriodStart(firstDay);
    setFormPeriodEnd(lastDay);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (target: AgentTarget) => {
    setEditingTarget(target);
    setFormTitle(target.title || '');
    setFormMetricType(target.metric_type);
    setFormMetricValue(String(target.metric_value));
    setFormRewardDesc(target.reward_description || '');
    setFormPeriodStart(target.period_start);
    setFormPeriodEnd(target.period_end);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const val = parseInt(formMetricValue, 10);
    if (isNaN(val) || val <= 0) {
      setFormError('Nilai target harus berupa angka lebih dari 0');
      return;
    }
    if (!formPeriodStart || !formPeriodEnd) {
      setFormError('Tanggal mulai dan selesai periode wajib diisi');
      return;
    }
    if (new Date(formPeriodEnd) < new Date(formPeriodStart)) {
      setFormError('Tanggal selesai periode harus sama atau setelah tanggal mulai');
      return;
    }

    try {
      setSavingTarget(true);
      if (editingTarget) {
        const updateInput: UpdateTargetInput = {
          title: formTitle.trim() ? formTitle.trim() : undefined,
          metric_value: val,
          reward_description: formRewardDesc.trim() ? formRewardDesc.trim() : undefined,
          period_start: formPeriodStart,
          period_end: formPeriodEnd,
        };
        await updateTarget(editingTarget.id, updateInput);
        setSuccessMsg('Target berhasil diperbarui');
      } else {
        const createInput: CreateTargetInput = {
          title: formTitle.trim() ? formTitle.trim() : undefined,
          metric_type: formMetricType,
          metric_value: val,
          reward_description: formRewardDesc.trim() ? formRewardDesc.trim() : undefined,
          period_start: formPeriodStart,
          period_end: formPeriodEnd,
        };
        await createTarget(createInput);
        setSuccessMsg('Target baru berhasil dibuat');
      }
      setIsFormModalOpen(false);
      await loadTargets();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan target');
    } finally {
      setSavingTarget(false);
    }
  };

  const handleOpenProgress = async (target: AgentTarget) => {
    setProgressTarget(target);
    setIsProgressModalOpen(true);
    setLoadingProgress(true);
    try {
      const res = await fetchTargetProgress(target.id);
      setProgressRows(res.rows || []);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data progres agen');
    } finally {
      setLoadingProgress(false);
    }
  };

  const handleOpenCloseModal = (target: AgentTarget) => {
    setTargetToClose(target);
    setIsCloseModalOpen(true);
  };

  const handleConfirmClose = async () => {
    if (!targetToClose) return;
    try {
      setClosing(true);
      const res = await closeTargetPeriod(targetToClose.id);
      setSuccessMsg(`Periode target berhasil ditutup. Sebanyak ${res.achieved_count} agen mencapai target.`);
      setIsCloseModalOpen(false);
      setTargetToClose(null);
      await loadTargets();
    } catch (err: any) {
      setError(err.message || 'Gagal menutup periode target');
    } finally {
      setClosing(false);
    }
  };

  const handleOpenAchievements = async (target: AgentTarget) => {
    setAchievementsTarget(target);
    setAchievementRewardFilter('all');
    setIsAchievementsModalOpen(true);
    setLoadingAchievements(true);
    try {
      const list = await fetchTargetAchievements(target.id);
      setAchievements(list);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar pencapaian');
    } finally {
      setLoadingAchievements(false);
    }
  };

  const handleFilterAchievements = async (status: 'all' | 'pending' | 'given') => {
    setAchievementRewardFilter(status);
    if (!achievementsTarget) return;
    try {
      setLoadingAchievements(true);
      const filterParam = status === 'all' ? undefined : status;
      const list = await fetchTargetAchievements(achievementsTarget.id, filterParam);
      setAchievements(list);
    } catch (err: any) {
      setError(err.message || 'Gagal menyaring daftar pencapaian');
    } finally {
      setLoadingAchievements(false);
    }
  };

  const handleOpenRewardModal = (achievement: AchievementItem) => {
    setSelectedAchievement(achievement);
    setRewardNotes(achievement.notes || '');
    setIsRewardModalOpen(true);
  };

  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAchievement) return;
    try {
      setSavingReward(true);
      await markRewardGiven(selectedAchievement.id, rewardNotes.trim() ? rewardNotes.trim() : undefined);
      setSuccessMsg(`Reward untuk ${selectedAchievement.agent_name} berhasil ditandai telah diserahkan.`);
      setIsRewardModalOpen(false);
      setSelectedAchievement(null);

      // Refresh achievements list
      if (achievementsTarget) {
        const filterParam = achievementRewardFilter === 'all' ? undefined : achievementRewardFilter;
        const list = await fetchTargetAchievements(achievementsTarget.id, filterParam);
        setAchievements(list);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal menandai penyerahan reward');
    } finally {
      setSavingReward(false);
    }
  };

  const handleExportCSV = async (target: AgentTarget) => {
    try {
      await exportTargetAchievementsCSV(target.id);
    } catch (err: any) {
      setError(err.message || 'Gagal mengunduh laporan CSV');
    }
  };

  const handleOpenDelete = (target: AgentTarget) => {
    setTargetToDelete(target);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!targetToDelete) return;
    try {
      setDeleting(true);
      await deleteTarget(targetToDelete.id);
      setSuccessMsg('Target berhasil dihapus');
      setIsDeleteModalOpen(false);
      setTargetToDelete(null);
      await loadTargets();
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus target');
    } finally {
      setDeleting(false);
    }
  };

  const progressColumns: Column<AgentTargetProgressRow>[] = [
    {
      key: 'agent_name',
      label: 'Nama Agen',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>{row.agent_name}</div>
          {row.agent_phone && (
            <div style={{ fontSize: '13px', color: 'var(--db-text-secondary)', marginTop: '2px' }}>
              {row.agent_phone}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'achieved_value',
      label: 'Progres / Target',
      render: (row) => {
        const pct = Math.min(100, Math.round((row.achieved_value / (row.target_value || 1)) * 100));
        return (
          <div style={{ minWidth: '160px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>
                {row.achieved_value} / {row.target_value}
              </span>
              <span style={{ color: 'var(--db-text-secondary)' }}>{pct}%</span>
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'var(--db-border-color)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: row.achieved ? 'var(--db-primary)' : 'var(--db-accent, #0284c7)',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'achieved',
      label: 'Status Lolos',
      render: (row) => (
        <Badge variant={row.achieved ? 'positive' : 'neutral'}>
          {row.achieved ? 'Target Tercapai' : 'Dalam Proses'}
        </Badge>
      ),
    },
  ];

  const achievementColumns: Column<AchievementItem>[] = [
    {
      key: 'agent_name',
      label: 'Nama Agen',
      render: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>{item.agent_name}</div>
          <div style={{ fontSize: '12px', color: 'var(--db-text-secondary)', marginTop: '2px' }}>
            Lolos: {formatDateIndo(item.achieved_at.split('T')[0])}
          </div>
        </div>
      ),
    },
    {
      key: 'achieved_value',
      label: 'Capaian Akhir',
      render: (item) => (
        <span style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>
          {item.achieved_value}
        </span>
      ),
    },
    {
      key: 'reward_status',
      label: 'Status Hadiah',
      render: (item) => (
        <Badge variant={item.reward_status === 'given' ? 'positive' : 'interested'}>
          {item.reward_status === 'given' ? 'Sudah Diserahkan' : 'Belum Diserahkan'}
        </Badge>
      ),
    },
    {
      key: 'notes',
      label: 'Catatan Penyerahan',
      render: (item) => (
        <div style={{ fontSize: '13px', color: 'var(--db-text-secondary)', maxWidth: '240px' }}>
          {item.notes || '-'}
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Aksi',
      render: (item) => (
        <div>
          {item.reward_status === 'pending' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleOpenRewardModal(item)}
            >
              <Check size={14} />
              <span>Tandai Diserahkan</span>
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleOpenRewardModal(item)}
            >
              <Edit2 size={14} />
              <span>Edit Catatan</span>
            </Button>
          )}
        </div>
      ),
    },
  ];

  const menuItems = getStandardMenuItems('agents-targets');

  return (
    <div className="db-main-layout">
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={menuItems}
        footerContent="KlikUmroh.id 1.0"
      />
      <div className="db-content-area">
        <Topbar
          title="Target & Reward Agen"
          userName={user?.name || 'Admin Travel'}
          userRole="Admin Travel"
        />

        <div className="db-container" style={{ padding: '24px' }}>
          <PageHeader
            title="Target & Reward Agen"
            subtitle="Atur target berkala dan reward menarik untuk memotivasi agen mitra Anda mencapai closing optimal."
            actions={
              <Button variant="primary" onClick={handleOpenCreateModal}>
                <Plus size={16} />
                <span>Buat Target Baru</span>
              </Button>
            }
          />

          {error && (
            <div className="db-alert db-alert--error" style={{ marginBottom: '20px' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {successMsg && (
            <div className="db-alert db-alert--success" style={{ marginBottom: '20px' }}>
              <CheckCircle2 size={18} />
              <span>{successMsg}</span>
              <button
                type="button"
                onClick={() => setSuccessMsg(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                variant={statusFilter === 'all' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setStatusFilter('all')}
              >
                <span>Semua Target ({targets.length})</span>
              </Button>
              <Button
                variant={statusFilter === 'active' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setStatusFilter('active')}
              >
                <span>Aktif ({targets.filter((t) => t.status === 'active').length})</span>
              </Button>
              <Button
                variant={statusFilter === 'closed' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setStatusFilter('closed')}
              >
                <span>Selesai ({targets.filter((t) => t.status === 'closed').length})</span>
              </Button>
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--db-text-secondary)',
                }}
              />
              <input
                type="text"
                placeholder="Cari target atau reward..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  borderRadius: '6px',
                  border: '1px solid var(--db-border-color)',
                  backgroundColor: 'var(--db-bg-card)',
                  color: 'var(--db-text-primary)',
                  fontSize: '14px',
                }}
              />
            </div>
          </div>

          {/* Target Cards Grid */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--db-text-secondary)' }}>
              <RefreshCw size={24} className="db-spin" style={{ marginBottom: '12px' }} />
              <div>Memuat data target & reward...</div>
            </div>
          ) : filteredTargets.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--db-text-secondary)' }}>
                <Award size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--db-text-primary)', marginBottom: '8px' }}>
                  Belum Ada Target {statusFilter === 'active' ? 'Aktif' : statusFilter === 'closed' ? 'Selesai' : ''}
                </h3>
                <p style={{ maxWidth: '460px', margin: '0 auto 20px', fontSize: '14px' }}>
                  Buat target pencapaian jamaah atau rekrutmen mitra baru untuk memotivasi agen mitra Anda.
                </p>
                <Button variant="primary" onClick={handleOpenCreateModal}>
                  <Plus size={16} />
                  <span>Buat Target Sekarang</span>
                </Button>
              </div>
            </Card>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '20px',
              }}
            >
              {filteredTargets.map((target) => {
                const isActive = target.status === 'active';

                return (
                  <Card key={target.id}>
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      {/* Card Header */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '12px',
                          marginBottom: '16px',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                            <Badge variant={isActive ? 'positive' : 'neutral'}>
                              {isActive ? 'Aktif Berjalan' : 'Selesai'}
                            </Badge>
                            <Badge variant="neutral">
                              {getMetricLabel(target.metric_type)}
                            </Badge>
                          </div>
                          <h3
                            style={{
                              fontSize: '18px',
                              fontWeight: 700,
                              color: 'var(--db-text-primary)',
                              margin: 0,
                            }}
                          >
                            {target.title || `Target ${getMetricLabel(target.metric_type)}`}
                          </h3>
                        </div>

                        <div style={{ display: 'flex', gap: '4px' }}>
                          {isActive && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenEditModal(target)}
                              title="Edit Target"
                            >
                              <Edit2 size={15} />
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenDelete(target)}
                            title="Hapus Target"
                            style={{ color: 'var(--db-error, #ef4444)' }}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </div>

                      {/* Target KPI Value & Period */}
                      <div
                        style={{
                          backgroundColor: 'var(--db-bg-secondary, rgba(0,0,0,0.02))',
                          padding: '12px 16px',
                          borderRadius: '6px',
                          border: '1px solid var(--db-border-color)',
                          marginBottom: '16px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--db-primary)' }}>
                            {target.metric_value}
                          </span>
                          <span style={{ fontSize: '14px', color: 'var(--db-text-secondary)' }}>
                            {target.metric_type === 'closing_pax' ? 'Pax Jamaah Closing' : 'Mitra Baru Aktif'}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            color: 'var(--db-text-secondary)',
                          }}
                        >
                          <Calendar size={14} />
                          <span>
                            {formatDateIndo(target.period_start)} – {formatDateIndo(target.period_end)}
                          </span>
                        </div>
                      </div>

                      {/* Reward Info */}
                      {target.reward_description && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            padding: '12px 14px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--db-bg-card)',
                            border: '1px solid var(--db-border-color)',
                            marginBottom: '20px',
                          }}
                        >
                          <Gift size={18} style={{ color: 'var(--db-primary)', marginTop: '2px', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--db-text-secondary)', textTransform: 'uppercase' }}>
                              Hadiah / Reward
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--db-text-primary)', marginTop: '2px' }}>
                              {target.reward_description}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Card Footer Actions */}
                      <div
                        style={{
                          marginTop: 'auto',
                          paddingTop: '16px',
                          borderTop: '1px solid var(--db-border-color)',
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {isActive ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              style={{ flex: 1 }}
                              onClick={() => handleOpenProgress(target)}
                            >
                              <TrendingUp size={15} />
                              <span>Lihat Progres Agen</span>
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenCloseModal(target)}
                            >
                              <Lock size={15} />
                              <span>Tutup Periode</span>
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              style={{ flex: 1 }}
                              onClick={() => handleOpenAchievements(target)}
                            >
                              <Award size={15} />
                              <span>Pencapaian & Reward</span>
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleExportCSV(target)}
                              title="Unduh Laporan CSV"
                            >
                              <Download size={15} />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Modal: Buat / Edit Target */}
          <Modal
            isOpen={isFormModalOpen}
            onClose={() => setIsFormModalOpen(false)}
            title={editingTarget ? 'Edit Target Agen' : 'Buat Target Baru'}
          >
            <form onSubmit={handleSaveTarget}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {formError && (
                  <div className="db-alert db-alert--error" style={{ marginBottom: 0 }}>
                    <AlertCircle size={16} />
                    <span>{formError}</span>
                  </div>
                )}

                <FormInput
                  label="Judul Target"
                  placeholder="Contoh: Target Ramadhan Berkah"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  tooltip="Opsional. Judul yang memudahkan identifikasi target."
                />

                <div className="db-form-group">
                  <label className="db-form-label">
                    Jenis Metrik Target <span style={{ color: 'var(--db-error, #ef4444)' }}>*</span>
                  </label>
                  <select
                    value={formMetricType}
                    onChange={(e) => setFormMetricType(e.target.value as any)}
                    disabled={Boolean(editingTarget)}
                    className="db-form-input"
                    style={{ width: '100%' }}
                  >
                    <option value="closing_pax">Jumlah Closing Jamaah (Pax)</option>
                    <option value="mitra_baru_count">Rekrut Mitra Baru (Downline)</option>
                  </select>
                  {editingTarget && (
                    <div style={{ fontSize: '12px', color: 'var(--db-text-secondary)', marginTop: '4px' }}>
                      Jenis metrik tidak dapat diubah setelah target dibuat.
                    </div>
                  )}
                </div>

                <FormInput
                  label="Target Nilai"
                  type="number"
                  placeholder="Contoh: 10"
                  value={formMetricValue}
                  onChange={(e) => setFormMetricValue(e.target.value)}
                  required
                  tooltip="Angka target yang harus dicapai agen dalam periode."
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <FormInput
                    label="Tanggal Mulai Periode"
                    type="date"
                    value={formPeriodStart}
                    onChange={(e) => setFormPeriodStart(e.target.value)}
                    required
                  />
                  <FormInput
                    label="Tanggal Selesai Periode"
                    type="date"
                    value={formPeriodEnd}
                    onChange={(e) => setFormPeriodEnd(e.target.value)}
                    required
                  />
                </div>

                <div className="db-form-group">
                  <label className="db-form-label">Deskripsi Reward / Hadiah</label>
                  <textarea
                    rows={3}
                    className="db-form-input"
                    placeholder="Contoh: Emas 1 Gram + Plakat Penghargaan Travel"
                    value={formRewardDesc}
                    onChange={(e) => setFormRewardDesc(e.target.value)}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                  <div style={{ fontSize: '12px', color: 'var(--db-text-secondary)', marginTop: '4px' }}>
                    Reward akan tampil di beranda agen mitra sebagai penyemangat pencapaian.
                  </div>
                </div>

                <div className="db-modal-actions" style={{ marginTop: '8px' }}>
                  <Button variant="secondary" type="button" onClick={() => setIsFormModalOpen(false)}>
                    Batal
                  </Button>
                  <Button variant="primary" type="submit" disabled={savingTarget}>
                    {savingTarget ? 'Menyimpan...' : editingTarget ? 'Perbarui Target' : 'Buat Target'}
                  </Button>
                </div>
              </div>
            </form>
          </Modal>

          {/* Modal: Progres Agen Live */}
          <Modal
            isOpen={isProgressModalOpen}
            onClose={() => setIsProgressModalOpen(false)}
            title={
              progressTarget
                ? `Progres Agen: ${progressTarget.title || getMetricLabel(progressTarget.metric_type)}`
                : 'Progres Agen'
            }
          >
            <div>
              {progressTarget && (
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--db-bg-secondary, rgba(0,0,0,0.02))',
                    border: '1px solid var(--db-border-color)',
                    marginBottom: '20px',
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--db-text-secondary)' }}>Target: </span>
                    <strong style={{ color: 'var(--db-text-primary)' }}>
                      {progressTarget.metric_value} {progressTarget.metric_type === 'closing_pax' ? 'Pax' : 'Mitra'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--db-text-secondary)' }}>Periode: </span>
                    <strong style={{ color: 'var(--db-text-primary)' }}>
                      {formatDateIndo(progressTarget.period_start)} – {formatDateIndo(progressTarget.period_end)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--db-text-secondary)' }}>Agen Lolos: </span>
                    <strong style={{ color: 'var(--db-primary)' }}>
                      {progressRows.filter((r) => r.achieved).length} dari {progressRows.length} Agen
                    </strong>
                  </div>
                </div>
              )}

              {loadingProgress ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--db-text-secondary)' }}>
                  <RefreshCw size={20} className="db-spin" style={{ marginBottom: '8px' }} />
                  <div>Menghitung progres performa agen...</div>
                </div>
              ) : progressRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--db-text-secondary)' }}>
                  Belum ada agen aktif yang terdaftar di sistem.
                </div>
              ) : (
                <Table columns={progressColumns} data={progressRows} />
              )}

              <div className="db-modal-actions" style={{ marginTop: '20px' }}>
                <Button variant="secondary" onClick={() => setIsProgressModalOpen(false)}>
                  Tutup
                </Button>
              </div>
            </div>
          </Modal>

          {/* Modal: Tutup Periode Target */}
          <Modal
            isOpen={isCloseModalOpen}
            onClose={() => setIsCloseModalOpen(false)}
            title="Konfirmasi Penutupan Periode Target"
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '16px',
                  backgroundColor: 'var(--db-bg-secondary, rgba(0,0,0,0.02))',
                  borderRadius: '6px',
                  border: '1px solid var(--db-border-color)',
                  marginBottom: '20px',
                }}
              >
                <AlertCircle size={22} style={{ color: 'var(--db-warning, #f59e0b)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--db-text-primary)' }}>
                  Menutup periode target akan <strong>membekukan data pencapaian agen</strong> yang berhasil mencapai target
                  dan membuat daftar reward siap serah. Target yang sudah ditutup <strong>tidak dapat dibuka kembali</strong>.
                </div>
              </div>

              {targetToClose && (
                <div style={{ marginBottom: '20px', fontSize: '14px', color: 'var(--db-text-secondary)' }}>
                  Target yang akan ditutup: <strong>{targetToClose.title || getMetricLabel(targetToClose.metric_type)}</strong> (Periode: {formatDateIndo(targetToClose.period_start)} – {formatDateIndo(targetToClose.period_end)})
                </div>
              )}

              <div className="db-modal-actions">
                <Button variant="secondary" onClick={() => setIsCloseModalOpen(false)} disabled={closing}>
                  Batal
                </Button>
                <Button variant="primary" onClick={handleConfirmClose} disabled={closing}>
                  {closing ? 'Menutup Periode...' : 'Ya, Tutup Periode Sekarang'}
                </Button>
              </div>
            </div>
          </Modal>

          {/* Modal: Pencapaian & Penyerahan Reward */}
          <Modal
            isOpen={isAchievementsModalOpen}
            onClose={() => setIsAchievementsModalOpen(false)}
            title={
              achievementsTarget
                ? `Pencapaian & Reward: ${achievementsTarget.title || getMetricLabel(achievementsTarget.metric_type)}`
                : 'Pencapaian & Reward'
            }
          >
            <div>
              {achievementsTarget && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                      variant={achievementRewardFilter === 'all' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => handleFilterAchievements('all')}
                    >
                      <span>Semua ({achievements.length})</span>
                    </Button>
                    <Button
                      variant={achievementRewardFilter === 'pending' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => handleFilterAchievements('pending')}
                    >
                      <span>Belum Diserahkan</span>
                    </Button>
                    <Button
                      variant={achievementRewardFilter === 'given' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => handleFilterAchievements('given')}
                    >
                      <span>Sudah Diserahkan</span>
                    </Button>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleExportCSV(achievementsTarget)}
                  >
                    <Download size={14} />
                    <span>Unduh CSV</span>
                  </Button>
                </div>
              )}

              {loadingAchievements ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--db-text-secondary)' }}>
                  <RefreshCw size={20} className="db-spin" style={{ marginBottom: '8px' }} />
                  <div>Memuat data pencapaian agen...</div>
                </div>
              ) : achievements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--db-text-secondary)' }}>
                  Tidak ada data pencapaian agen untuk kriteria ini.
                </div>
              ) : (
                <Table columns={achievementColumns} data={achievements} />
              )}

              <div className="db-modal-actions" style={{ marginTop: '20px' }}>
                <Button variant="secondary" onClick={() => setIsAchievementsModalOpen(false)}>
                  Tutup
                </Button>
              </div>
            </div>
          </Modal>

          {/* Modal: Catatan Penyerahan Reward */}
          <Modal
            isOpen={isRewardModalOpen}
            onClose={() => setIsRewardModalOpen(false)}
            title="Penyerahan Reward Agen"
          >
            <form onSubmit={handleSaveReward}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {selectedAchievement && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--db-bg-secondary, rgba(0,0,0,0.02))',
                      border: '1px solid var(--db-border-color)',
                      fontSize: '14px',
                    }}
                  >
                    <div style={{ color: 'var(--db-text-secondary)', marginBottom: '4px' }}>Nama Agen:</div>
                    <div style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>{selectedAchievement.agent_name}</div>
                    {selectedAchievement.reward_description_snapshot && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ color: 'var(--db-text-secondary)', marginBottom: '2px' }}>Hadiah:</div>
                        <div style={{ fontWeight: 600, color: 'var(--db-primary)' }}>{selectedAchievement.reward_description_snapshot}</div>
                      </div>
                    )}
                  </div>
                )}

                <div className="db-form-group">
                  <label className="db-form-label">Catatan Penyerahan (Opsional)</label>
                  <textarea
                    rows={3}
                    className="db-form-input"
                    placeholder="Contoh: Diserahkan tunai pada saat acara gathering agen tgl 12 Syawal"
                    value={rewardNotes}
                    onChange={(e) => setRewardNotes(e.target.value)}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div className="db-modal-actions">
                  <Button variant="secondary" type="button" onClick={() => setIsRewardModalOpen(false)}>
                    Batal
                  </Button>
                  <Button variant="primary" type="submit" disabled={savingReward}>
                    {savingReward ? 'Menyimpan...' : 'Tandai Reward Diserahkan'}
                  </Button>
                </div>
              </div>
            </form>
          </Modal>

          {/* Modal: Hapus Target */}
          <Modal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            title="Hapus Target Agen"
          >
            <div>
              <p style={{ fontSize: '14px', color: 'var(--db-text-secondary)', marginBottom: '20px' }}>
                Apakah Anda yakin ingin menghapus target <strong>{targetToDelete?.title || 'ini'}</strong>?
                Target yang sudah memiliki histori pencapaian tidak dapat dihapus.
              </p>

              <div className="db-modal-actions">
                <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)} disabled={deleting}>
                  Batal
                </Button>
                <Button
                  variant="primary"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  style={{ backgroundColor: 'var(--db-error, #ef4444)' }}
                >
                  {deleting ? 'Menghapus...' : 'Hapus Target'}
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    </div>
  );
};

