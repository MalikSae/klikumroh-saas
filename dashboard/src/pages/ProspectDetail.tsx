import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Pencil,
  RefreshCw,
  MessageCircle,
  Phone,
  Users,
  Clock,
  Check,
  Package,
  CalendarDays,
  Waypoints,
  UserRound,
  Coins,
  Info,
  FileText,
  Send,
  History,
  Trash2,
  BadgeCheck,
  MapPin,
  Undo2,
  UserX,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Button,
  Badge,
  Modal,
  getStandardMenuItems,
} from '../components';
import {
  type ProspectDetailResponse,
  fetchProspectDetail,
  updateProspectStatus,
  addProspectNote,
  deleteProspect,
  markProspectPaidOff,
  LOST_REASON_OPTIONS,
  lostReasonCategoryLabel,
  formatDeparturePlan,
  cancelProspectClosing,
  anonymizeProspect,
  getStoredUser,
} from '../services/api';
import { formatDateWIB, formatDateTimeWIB, formatTimeWIB } from '../utils/datetime';
import { prospectListPath } from '../utils/prospectListQuery';
import './ProspectDetail.css';

const statusBadgeVariant = (
  status: string
): 'new' | 'contacted' | 'interested' | 'closing' | 'lost' | 'neutral' => {
  switch (status) {
    case 'baru':
      return 'new';
    case 'dihubungi':
      return 'contacted';
    case 'tertarik':
      return 'interested';
    case 'closing':
      return 'closing';
    case 'tidak_lanjut':
      return 'lost';
    default:
      return 'neutral';
  }
};

const formatStatusLabel = (status: string): string => {
  switch (status) {
    case 'baru':
      return 'Baru';
    case 'dihubungi':
      return 'Dihubungi';
    case 'tertarik':
      return 'Tertarik';
    case 'closing':
      return 'Closing';
    case 'tidak_lanjut':
      return 'Tidak Lanjut';
    default:
      return status;
  }
};

const formatIDR = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

const formatShortDate = (dateStr: string): string => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
};

const formatFullDate = (dateStr: string): string => (dateStr ? formatDateWIB(dateStr) : '—');

const formatDateTime = (dateStr: string): string => (dateStr ? formatDateTimeWIB(dateStr) : '—');

const PIPELINE_STAGES = [
  { key: 'baru', label: 'Baru' },
  { key: 'dihubungi', label: 'Dihubungi' },
  { key: 'tertarik', label: 'Tertarik' },
  { key: 'closing', label: 'Closing' },
  { key: 'tidak_lanjut', label: 'Tidak Lanjut' },
];

export const ProspectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const prospectId = id ? parseInt(id, 10) : 0;

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProspectDetailResponse | null>(null);

  // Status Change Modal State
  const [statusModalOpen, setStatusModalOpen] = useState<boolean>(false);
  const [targetStatus, setTargetStatus] = useState<string>('dihubungi');
  const [lostReason, setLostReason] = useState<string>('');
  const [lostCategory, setLostCategory] = useState<string>('');
  const [submittingStatus, setSubmittingStatus] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [confirmClosing, setConfirmClosing] = useState<boolean>(false);

  // Delete (spam / test data)
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // UU PDP: remove the jamaah's personal data when the prospect cannot be deleted (commission history).
  const [anonymizeModalOpen, setAnonymizeModalOpen] = useState<boolean>(false);
  const [anonymizing, setAnonymizing] = useState<boolean>(false);
  const [anonymizeError, setAnonymizeError] = useState<string | null>(null);

  // Closing = DP. "Tandai Lunas" releases the held agent commission; "Batalkan Closing" reverses it.
  const [paidOffModalOpen, setPaidOffModalOpen] = useState<boolean>(false);
  const [cancelModalOpen, setCancelModalOpen] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [closingActionBusy, setClosingActionBusy] = useState<boolean>(false);
  const [closingActionError, setClosingActionError] = useState<string | null>(null);

  // Note Submission State
  const [noteText, setNoteText] = useState<string>('');
  const [submittingNote, setSubmittingNote] = useState<boolean>(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const currentUser = getStoredUser();

  const loadDetail = async () => {
    if (!prospectId) return;
    try {
      setLoading(true);
      setError(null);
      const detail = await fetchProspectDetail(prospectId);
      setData(detail);
      setTargetStatus(detail.prospect.status);
      const cat = detail.prospect.lost_reason_category;
      setLostCategory(cat && cat !== 'batal_setelah_dp' ? cat : '');
      setLostReason(cat === 'lainnya' ? detail.prospect.lost_reason || '' : '');
    } catch (err: any) {
      setError(err.message || 'Gagal memuat detail prospek');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [prospectId]);

  const handleStatusSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!data || submittingStatus) return;

    if (targetStatus === 'tidak_lanjut' && !lostCategory) {
      setStatusError('Pilih alasan tidak lanjut.');
      return;
    }
    if (targetStatus === 'tidak_lanjut' && lostCategory === 'lainnya' && !lostReason.trim()) {
      setStatusError('Jelaskan alasan untuk pilihan Lainnya.');
      return;
    }
    // Closing is final and books the agent commission: require a second, explicit click.
    if (targetStatus === 'closing' && !confirmClosing) {
      setConfirmClosing(true);
      return;
    }

    try {
      setSubmittingStatus(true);
      setStatusError(null);
      await updateProspectStatus(
        prospectId,
        targetStatus,
        targetStatus === 'tidak_lanjut' ? lostReason.trim() || undefined : undefined,
        targetStatus === 'tidak_lanjut' ? lostCategory : undefined
      );
      setStatusModalOpen(false);
      await loadDetail();
    } catch (err: any) {
      setStatusError(err.message || 'Gagal mengubah status');
      setConfirmClosing(false);
    } finally {
      setSubmittingStatus(false);
    }
  };

  const openStatusModal = () => {
    setStatusError(null);
    setConfirmClosing(false);
    setStatusModalOpen(true);
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      setDeleteError(null);
      await deleteProspect(prospectId);
      navigate(prospectListPath());
    } catch (err: any) {
      setDeleteError(err.message || 'Gagal menghapus prospek');
    } finally {
      setDeleting(false);
    }
  };

  const handleAnonymize = async () => {
    try {
      setAnonymizing(true);
      setAnonymizeError(null);
      await anonymizeProspect(prospectId);
      setAnonymizeModalOpen(false);
      await loadDetail();
    } catch (err: any) {
      setAnonymizeError(err.message || 'Gagal menghapus data pribadi');
    } finally {
      setAnonymizing(false);
    }
  };

  const handleMarkPaidOff = async () => {
    try {
      setClosingActionBusy(true);
      setClosingActionError(null);
      await markProspectPaidOff(prospectId);
      setPaidOffModalOpen(false);
      await loadDetail();
    } catch (err: any) {
      setClosingActionError(err.message || 'Gagal menandai lunas');
    } finally {
      setClosingActionBusy(false);
    }
  };

  const handleCancelClosing = async () => {
    if (!cancelReason.trim()) {
      setClosingActionError('Alasan pembatalan wajib diisi.');
      return;
    }
    try {
      setClosingActionBusy(true);
      setClosingActionError(null);
      await cancelProspectClosing(prospectId, cancelReason.trim());
      setCancelModalOpen(false);
      setCancelReason('');
      await loadDetail();
    } catch (err: any) {
      setClosingActionError(err.message || 'Gagal membatalkan closing');
    } finally {
      setClosingActionBusy(false);
    }
  };

  const openClosingAction = (which: 'paid' | 'cancel') => {
    setClosingActionError(null);
    if (which === 'paid') setPaidOffModalOpen(true);
    else setCancelModalOpen(true);
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    try {
      setSubmittingNote(true);
      setNoteError(null);
      await addProspectNote(prospectId, noteText.trim());
      setNoteText('');
      await loadDetail();
    } catch (err: any) {
      setNoteError(err.message || 'Gagal menambahkan catatan');
    } finally {
      setSubmittingNote(false);
    }
  };

  const menuItems = getStandardMenuItems('prospects');
  // Commission history (closing, or a cancelled closing) means the prospect cannot be deleted.
  const hasCommissionHistory =
    data?.prospect.status === 'closing' || data?.info_komisi?.type === 'dibatalkan';
  const isAnonymized = !!data?.prospect.anonymized_at;
  // Closing an agent's prospect books commission only with a package that has a commission set.
  const closingCommissionGap = !data?.agent
    ? null
    : !data.package
    ? 'Prospek ini belum punya paket'
    : !data.package.commission_amount || data.package.commission_amount <= 0
    ? `Komisi paket ${data.package.name} belum diatur`
    : null;

  const waNormalized = data?.prospect.phone
    ? data.prospect.phone.replace(/\D/g, '')
    : '';
  const waTarget = waNormalized.startsWith('0')
    ? '62' + waNormalized.slice(1)
    : waNormalized;

  // Derive 2-letter initials from prospect name
  const prospectInitials = data?.prospect.name
    ? data.prospect.name
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'PR';

  // Stepper helper logic
  const currentStatus = data?.prospect.status || 'baru';

  // Determine stage completion and active states
  const isStageCompleted = (stageKey: string): boolean => {
    if (!data) return false;
    if (currentStatus === 'closing') {
      return ['baru', 'dihubungi', 'tertarik', 'closing'].includes(stageKey);
    }
    if (currentStatus === 'tertarik') {
      return ['baru', 'dihubungi'].includes(stageKey);
    }
    if (currentStatus === 'dihubungi') {
      return stageKey === 'baru';
    }
    if (currentStatus === 'tidak_lanjut') {
      // Check if this stage was recorded in history
      if (stageKey === 'baru') return true;
      return data.status_history.some((h) => h.new_status === stageKey);
    }
    return false;
  };

  const isStageActive = (stageKey: string): boolean => {
    if (currentStatus === 'closing' && stageKey === 'closing') {
      return true;
    }
    return currentStatus === stageKey;
  };

  const isConnectorCompleted = (fromIndex: number): boolean => {
    // Connectors between standard progression stages
    if (fromIndex === 0) {
      // Baru -> Dihubungi
      return ['dihubungi', 'tertarik', 'closing'].includes(currentStatus) ||
        data?.status_history.some((h) => h.new_status === 'dihubungi') || false;
    }
    if (fromIndex === 1) {
      // Dihubungi -> Tertarik
      return ['tertarik', 'closing'].includes(currentStatus) ||
        data?.status_history.some((h) => h.new_status === 'tertarik') || false;
    }
    if (fromIndex === 2) {
      // Tertarik -> Closing
      return currentStatus === 'closing';
    }
    // Closing -> Tidak lanjut is an alternative branch, remains gray
    return false;
  };

  const getStageDate = (stageKey: string): string => {
    if (!data) return '—';
    if (stageKey === 'baru') {
      return formatShortDate(data.prospect.created_at);
    }
    const match = data.status_history.find((h) => h.new_status === stageKey);
    if (match) {
      return formatShortDate(match.changed_at);
    }
    return '—';
  };

  const lastUpdatedDateStr = data?.status_history?.length
    ? data.status_history[0].changed_at
    : data?.prospect.updated_at || data?.prospect.created_at || '';

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
          userInitial={
            currentUser?.name
              ? currentUser.name.slice(0, 2).toUpperCase()
              : 'AD'
          }
        />

        <main className="db-page-container db-prospect-detail-container">
          {/* Top Page Header */}
          <PageHeader
            title="Detail Prospek"
            subtitle="Rincian data, progres follow-up, dan riwayat calon jamaah."
            backButton={
              <button
                type="button"
                className="db-back-btn"
                onClick={() => navigate(prospectListPath())}
                aria-label="Kembali ke Daftar Prospek"
                title="Kembali ke Daftar Prospek"
              >
                <ArrowLeft size={16} />
              </button>
            }
            actions={
              <div className="db-prospect-header-actions">
                {data && !hasCommissionHistory && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="db-detail-danger-btn"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteModalOpen(true);
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Hapus</span>
                  </Button>
                )}
                {data && hasCommissionHistory && !isAnonymized && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="db-detail-danger-btn"
                    onClick={() => {
                      setAnonymizeError(null);
                      setAnonymizeModalOpen(true);
                    }}
                  >
                    <UserX size={14} />
                    <span>Hapus Data Pribadi</span>
                  </Button>
                )}
                {!isAnonymized && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/prospects/${prospectId}/edit`)}
                  >
                    <Pencil size={14} />
                    <span>Edit Data</span>
                  </Button>
                )}

                {isAnonymized && data?.prospect.status !== 'closing' ? null : data?.prospect.status !== 'closing' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={openStatusModal}
                  >
                    <RefreshCw size={14} />
                    <span>Ubah Status</span>
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" className="db-detail-danger-btn" onClick={() => openClosingAction('cancel')}>
                      <Undo2 size={14} />
                      <span>Batalkan Closing</span>
                    </Button>
                    {data?.prospect.paid_off_at ? (
                      <div className="db-status-final-badge">
                        <BadgeCheck size={13} />
                        <span>Lunas</span>
                      </div>
                    ) : (
                      <Button variant="primary" size="sm" onClick={() => openClosingAction('paid')}>
                        <BadgeCheck size={14} />
                        <span>Tandai Lunas</span>
                      </Button>
                    )}
                  </>
                )}
              </div>
            }
          />

          {loading ? (
            <div className="db-detail-loading">
              <RefreshCw size={22} className="db-spin" />
              <span>Memuat data prospek...</span>
            </div>
          ) : error || !data ? (
            <div className="db-detail-card db-detail-error-card">
              <p className="db-detail-error-title">
                Terjadi Kesalahan
              </p>
              <p className="db-detail-error-text">
                {error || 'Prospek tidak ditemukan'}
              </p>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(prospectListPath())}
                >
                  Kembali ke Daftar Prospek
                </Button>
              </div>
            </div>
          ) : (
            <div className="db-prospect-detail-page">
              {isAnonymized && (
                <p className="db-prospect-anonymized-note">
                  <UserX size={14} />
                  <span>
                    Data pribadi jamaah ini dihapus pada {formatDateTime(data.prospect.anonymized_at!)} atas permintaan
                    jamaah (UU PDP). Riwayat status dan komisi tetap disimpan.
                  </span>
                </p>
              )}
              {/* 1. Identity Summary Banner Card */}
              <div className="db-prospect-id-card">
                <div className="db-prospect-id-card__main">
                  <div className={`db-prospect-id-avatar db-prospect-id-avatar--${data.prospect.status}`}>
                    {prospectInitials}
                  </div>
                  <div className="db-prospect-id-info">
                    <div className="db-prospect-id-name-row">
                      <span className="db-prospect-id-name">
                        {data.prospect.name}
                      </span>
                      <Badge variant={statusBadgeVariant(data.prospect.status)}>
                        {formatStatusLabel(data.prospect.status)}
                      </Badge>
                    </div>
                    <div className="db-prospect-id-meta-row">
                      <span className="db-prospect-id-meta-item">
                        <Phone size={12} />
                        <span>{data.prospect.phone}</span>
                      </span>
                      <span className="db-prospect-id-meta-item">
                        <Users size={12} />
                        <span>
                          {data.prospect.jumlah_jamaah && data.prospect.jumlah_jamaah > 0
                            ? `${data.prospect.jumlah_jamaah} jamaah`
                            : '1 jamaah'}
                        </span>
                      </span>
                      <span className="db-prospect-id-meta-item">
                        <CalendarDays size={12} />
                        <span>Berangkat: {formatDeparturePlan(data.prospect.departure_plan)}</span>
                      </span>
                      <span className="db-prospect-id-meta-item">
                        <MapPin size={12} />
                        <span>{data.prospect.domicile || 'Domisili belum diisi'}</span>
                      </span>
                      <span className="db-prospect-id-meta-item">
                        <Clock size={12} />
                        <span>
                          Masuk {formatDateTime(data.prospect.created_at)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {waTarget && (
                  <div className="db-prospect-id-card__action">
                    <a
                      href={`https://wa.me/${waTarget}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="db-whatsapp-btn"
                      aria-label={`Chat WhatsApp dengan ${data.prospect.name}`}
                    >
                      <MessageCircle size={15} />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                )}
              </div>

              {/* 2. Pipeline Stepper Card */}
              <div className="db-prospect-pipeline-card">
                <div className="db-pipeline-header">
                  <span className="db-pipeline-title">Progres Pipeline</span>
                  <span className="db-pipeline-updated">
                    Diperbarui {formatDateTime(lastUpdatedDateStr)}
                  </span>
                </div>

                <div className="db-pipeline-steps">
                  {PIPELINE_STAGES.map((stage, idx) => {
                    const completed = isStageCompleted(stage.key);
                    const active = isStageActive(stage.key);
                    const inactive = !completed && !active;

                    let markerClass = 'db-step-marker--inactive';
                    if (completed) {
                      markerClass = 'db-step-marker--completed';
                    } else if (active) {
                      if (stage.key === 'baru') markerClass = 'db-step-marker--active-new';
                      else if (stage.key === 'dihubungi') markerClass = 'db-step-marker--active-contacted';
                      else if (stage.key === 'tertarik') markerClass = 'db-step-marker--active-interested';
                      else if (stage.key === 'closing') markerClass = 'db-step-marker--active-closing';
                      else if (stage.key === 'tidak_lanjut') markerClass = 'db-step-marker--active-lost';
                      else markerClass = 'db-step-marker--active';
                    }

                    return (
                      <React.Fragment key={stage.key}>
                        <div className="db-pipeline-step-item">
                          <div className={`db-step-marker ${markerClass}`}>
                            {completed ? (
                              <Check size={13} strokeWidth={3} />
                            ) : (
                              <div className="db-step-marker-dot" />
                            )}
                          </div>
                          <div className="db-step-copy">
                            <span
                              className={`db-step-label ${
                                inactive ? 'db-step-label--inactive' : ''
                              }`}
                            >
                              {stage.label}
                            </span>
                            <span className="db-step-date">
                              {getStageDate(stage.key)}
                            </span>
                          </div>
                        </div>

                        {idx < PIPELINE_STAGES.length - 1 && (
                          <div
                            className={`db-step-connector ${
                              isConnectorCompleted(idx)
                                ? 'db-step-connector--completed'
                                : ''
                            }`}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* 3. Two-Column Layout */}
              <div className="db-prospect-columns">
                {/* Left Column: Info Grid & Commission Banner */}
                <div className="db-prospect-col-left">
                  {/* Card Informasi Prospek */}
                  <div className="db-detail-card">
                    <div className="db-detail-card-header">
                      <span className="db-detail-card-title">
                        <Package size={15} />
                        <span>Informasi Prospek</span>
                      </span>
                      <span className="db-detail-card-id">
                        ID #{String(data.prospect.id).padStart(4, '0')}
                      </span>
                    </div>

                    <div className="db-info-grid">
                      {/* 1. Paket */}
                      <div className="db-info-field">
                        <div className="db-info-field__header">
                          <Package size={12} />
                          <span className="db-info-field__label">PAKET</span>
                        </div>
                        <span className="db-info-field__value">
                          {data.package ? data.package.name : 'Belum ditentukan'}
                        </span>
                        <span className="db-info-field__supporting">
                          {data.package?.price
                            ? `${formatIDR(data.package.price)} / jamaah`
                            : '—'}
                        </span>
                      </div>

                      {/* 2. Keberangkatan */}
                      <div className="db-info-field">
                        <div className="db-info-field__header">
                          <CalendarDays size={12} />
                          <span className="db-info-field__label">
                            KEBERANGKATAN
                          </span>
                        </div>
                        <span className="db-info-field__value">
                          {data.package?.departure_date
                            ? formatFullDate(data.package.departure_date)
                            : 'Menyesuaikan'}
                        </span>
                        <span className="db-info-field__supporting">
                          {data.package?.flight_info || 'Penerbangan reguler'}
                        </span>
                      </div>

                      {/* 3. Sumber */}
                      <div className="db-info-field">
                        <div className="db-info-field__header">
                          <Waypoints size={12} />
                          <span className="db-info-field__label">SUMBER</span>
                        </div>
                        <span className="db-info-field__value">
                          {data.prospect.entry_method === 'agent_manual'
                            ? 'Input Manual Agen'
                            : data.agent
                            ? 'Referral Agen'
                            : data.prospect.source_channel === 'paid'
                            ? 'Iklan'
                            : 'Website (Organik)'}
                        </span>
                        <span className="db-info-field__supporting">
                          {data.agent
                            ? `Kode ${data.agent.referral_code}`
                            : data.prospect.source_channel === 'paid'
                            ? data.prospect.utm_campaign
                              ? `Kampanye ${data.prospect.utm_campaign}`
                              : data.prospect.utm_source
                              ? `Sumber ${data.prospect.utm_source}`
                              : 'Kampanye tidak tercatat'
                            : 'Langsung via website'}
                        </span>
                      </div>

                      {/* 4. Agen */}
                      <div className="db-info-field">
                        <div className="db-info-field__header">
                          <UserRound size={12} />
                          <span className="db-info-field__label">AGEN</span>
                        </div>
                        <span className="db-info-field__value">
                          {data.agent ? data.agent.name : 'Tanpa Agen (Organik)'}
                        </span>
                        <span className="db-info-field__supporting">
                          {data.agent
                            ? data.info_komisi?.rate_per_jamaah &&
                              data.info_komisi.rate_per_jamaah > 0
                              ? `Komisi ${formatIDR(
                                  data.info_komisi.rate_per_jamaah
                                )} / jamaah`
                              : 'Komisi paket belum diatur'
                            : '—'}
                        </span>
                      </div>

                      {/* 5. Jumlah */}
                      <div className="db-info-field">
                        <div className="db-info-field__header">
                          <Users size={12} />
                          <span className="db-info-field__label">JUMLAH</span>
                        </div>
                        <span className="db-info-field__value">
                          {data.prospect.jumlah_jamaah && data.prospect.jumlah_jamaah > 0
                            ? `${data.prospect.jumlah_jamaah} jamaah`
                            : '1 jamaah'}
                        </span>
                        <span className="db-info-field__supporting">
                          {data.package?.price
                            ? `Estimasi transaksi ${formatIDR(
                                (data.prospect.jumlah_jamaah || 1) *
                                  data.package.price
                              )}`
                            : '—'}
                        </span>
                      </div>

                      {/* 6. Masuk */}
                      <div className="db-info-field">
                        <div className="db-info-field__header">
                          <Clock size={12} />
                          <span className="db-info-field__label">TERDAFTAR</span>
                        </div>
                        <span className="db-info-field__value">
                          {formatFullDate(data.prospect.created_at)}, {formatTimeWIB(data.prospect.created_at)}
                        </span>
                        <span className="db-info-field__supporting">
                          {data.prospect.consent_at
                            ? `Setuju dihubungi ${formatDateTime(data.prospect.consent_at)}`
                            : 'Persetujuan kontak tidak tercatat'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Komisi Agen: only when there is an agent and a commission to show
                      (a Tidak Lanjut prospect without booked commission has none). */}
                  {data.agent && data.info_komisi && (
                    <div className="db-detail-card">
                      <div className="db-detail-card-header">
                        <span className="db-detail-card-title">
                          <Coins size={15} />
                          <span>Komisi Agen</span>
                        </span>
                        <Badge
                          variant={
                            data.info_komisi?.type === 'final'
                              ? 'positive'
                              : 'neutral'
                          }
                        >
                          {data.info_komisi?.type === 'final'
                            ? 'FINAL'
                            : data.info_komisi?.type === 'dibatalkan'
                            ? 'DIBATALKAN'
                            : 'ESTIMASI'}
                        </Badge>
                      </div>

                      <div className="db-commission-banner">
                        <div className="db-commission-stat">
                          <span className="db-commission-stat__label">
                            Komisi {data.agent.name}
                          </span>
                          <span className="db-commission-stat__value">
                            {formatIDR(data.info_komisi?.direct_amount || 0)}
                          </span>
                          <span className="db-commission-stat__sub">
                            {data.info_komisi?.rate_per_jamaah &&
                            data.info_komisi.rate_per_jamaah > 0
                              ? `${formatIDR(
                                  data.info_komisi.rate_per_jamaah
                                )} × ${data.prospect.jumlah_jamaah || 1} jamaah`
                              : `Komisi paket belum diatur (${data.prospect.jumlah_jamaah || 1} jamaah)`}
                          </span>
                        </div>

                        <div className="db-commission-stat">
                          <span className="db-commission-stat__label">
                            Total Transaksi
                          </span>
                          <span className="db-commission-stat__value">
                            {data.package?.price
                              ? formatIDR(
                                  (data.prospect.jumlah_jamaah || 1) *
                                    data.package.price
                                )
                              : '—'}
                          </span>
                          <span className="db-commission-stat__sub">
                            Harga paket × jumlah jamaah
                          </span>
                        </div>
                      </div>

                      <div className="db-commission-notice">
                        <Info size={14} />
                        <span>
                          {data.info_komisi?.type === 'dibatalkan'
                            ? 'Closing dibatalkan: komisi agen sudah dibalik dengan entri koreksi.'
                            : data.info_komisi?.type !== 'final'
                            ? 'Komisi dibukukan saat prospek Closing (jamaah sudah membayar DP).'
                            : (data.info_komisi?.held_amount || 0) > 0
                            ? `Komisi ${formatIDR(data.info_komisi?.held_amount || 0)} tertahan sampai jamaah ditandai lunas.`
                            : 'Komisi sudah dapat dicairkan agen.'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Follow-up Notes & Status History */}
                <div className="db-prospect-col-right">
                  {/* Card Catatan Follow-up */}
                  <div className="db-detail-card">
                    <div className="db-detail-card-header">
                      <span className="db-detail-card-title">
                        <FileText size={15} />
                        <span>Catatan Follow-up</span>
                      </span>
                      <span className="db-detail-card-id">
                        {data.notes.length} catatan
                      </span>
                    </div>

                    {!isAnonymized && (
                    <form onSubmit={handleNoteSubmit} className="db-note-composer">
                      <textarea
                        rows={2}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Tulis catatan hasil follow-up..."
                        className="db-note-textarea"
                      />
                      {noteError && (
                        <span className="db-detail-inline-error">{noteError}</span>
                      )}
                      <div className="db-note-composer-footer">
                        <Button
                          variant="primary"
                          size="sm"
                          type="submit"
                          disabled={submittingNote || !noteText.trim()}
                        >
                          {submittingNote ? (
                            <RefreshCw size={13} className="db-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          <span>Simpan Catatan</span>
                        </Button>
                      </div>
                    </form>
                    )}

                    <div className="db-notes-list">
                      {data.notes.length === 0 ? (
                        <div className="db-detail-empty">
                          <FileText size={20} className="db-detail-empty__icon" />
                          <p className="db-detail-empty__text">Belum ada catatan follow-up.</p>
                        </div>
                      ) : (
                        data.notes.map((note) => {
                          const isAdmin = note.author_type === 'admin';
                          const isSystem = note.author_type === 'system';
                          const timeStr = formatDateTime(note.created_at);
                          return (
                            <div key={note.id} className="db-note-item">
                              <div className="db-note-item-header">
                                <div className="db-note-author-wrap">
                                  <div
                                    className={`db-note-author-dot ${
                                      isAdmin || isSystem
                                        ? 'db-note-author-dot--admin'
                                        : 'db-note-author-dot--agent'
                                    }`}
                                  />
                                  <span className="db-note-author-name">
                                    {note.author_name ||
                                      (isSystem ? 'Sistem' : isAdmin ? 'Admin Travel' : 'Agen')}
                                  </span>
                                  <span className="db-note-role-badge">
                                    {isSystem ? 'OTOMATIS' : isAdmin ? 'ADMIN' : 'AGEN'}
                                  </span>
                                </div>
                                <span className="db-note-time">{timeStr}</span>
                              </div>
                              <p className="db-note-text">{note.note_text}</p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Card Riwayat Status Pipeline */}
                  <div className="db-detail-card">
                    <div className="db-detail-card-header">
                      <span className="db-detail-card-title">
                        <History size={15} />
                        <span>Riwayat Status Pipeline</span>
                      </span>
                      <span className="db-detail-card-id">
                        {data.status_history.length} perubahan
                      </span>
                    </div>

                    <div className="db-status-timeline">
                      {data.status_history.length === 0 ? (
                        <div className="db-detail-empty">
                          <History size={20} className="db-detail-empty__icon" />
                          <p className="db-detail-empty__text">Belum ada riwayat perubahan status.</p>
                        </div>
                      ) : (
                        data.status_history.map((hist) => {
                          const authorLabel =
                            hist.changed_by_name ||
                            (hist.changed_by_type === 'admin'
                              ? 'Admin Travel'
                              : hist.changed_by_type);
                          const dateFormatted = formatDateTime(hist.changed_at);

                          return (
                            <div key={hist.id} className="db-timeline-row">
                              <div className="db-timeline-track">
                                <div className="db-timeline-dot" />
                                <div className="db-timeline-line" />
                              </div>
                              <div className="db-timeline-copy">
                                <div className="db-timeline-transition">
                                  <span className="db-timeline-from">
                                    {formatStatusLabel(hist.old_status)}
                                  </span>
                                  <ArrowRight size={11} />
                                  <span className="db-timeline-to">
                                    {formatStatusLabel(hist.new_status)}
                                  </span>
                                </div>
                                <span className="db-timeline-meta">
                                  {authorLabel} · {dateFormatted}
                                </span>
                                {hist.new_status === 'tidak_lanjut' &&
                                  data.prospect.lost_reason && (
                                    <div className="db-timeline-reason">
                                      Alasan:{' '}
                                      {lostReasonCategoryLabel(data.prospect.lost_reason_category) || data.prospect.lost_reason}
                                      {data.prospect.lost_reason_category &&
                                      data.prospect.lost_reason &&
                                      data.prospect.lost_reason !== lostReasonCategoryLabel(data.prospect.lost_reason_category)
                                        ? ` (${data.prospect.lost_reason})`
                                        : ''}
                                    </div>
                                  )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Ubah Status Modal */}
      <Modal
        isOpen={statusModalOpen && data?.prospect.status !== 'closing'}
        onClose={() => setStatusModalOpen(false)}
        title="Ubah Status Prospek"
        footer={
          <div className="db-detail-modal-footer">
            <Button variant="secondary" size="md" type="button" onClick={() => setStatusModalOpen(false)} disabled={submittingStatus}>
              Batal
            </Button>
            <Button variant="primary" size="md" type="button" onClick={() => handleStatusSubmit()} disabled={submittingStatus}>
              {submittingStatus ? <RefreshCw size={15} className="db-spin" /> : <Check size={15} />}
              <span>
                {targetStatus === 'closing'
                  ? confirmClosing
                    ? 'Ya, Closing & Bukukan Komisi'
                    : 'Lanjutkan'
                  : 'Simpan Status'}
              </span>
            </Button>
          </div>
        }
      >
        <form onSubmit={handleStatusSubmit} className="db-detail-modal-form">
          <div>
            <span className="db-detail-modal-label">Pilih Status Baru</span>
            <div className="db-status-choice-grid">
              {PIPELINE_STAGES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setTargetStatus(item.key);
                    setConfirmClosing(false);
                  }}
                  className={`db-status-choice ${targetStatus === item.key ? 'db-status-choice--selected' : ''}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {targetStatus === 'tidak_lanjut' && (
            <div>
              <label className="db-detail-modal-label" htmlFor="prospect-lost-category">
                Alasan Tidak Lanjut <span className="db-detail-required">*</span>
              </label>
              <select
                id="prospect-lost-category"
                value={lostCategory}
                onChange={(e) => setLostCategory(e.target.value)}
                className="db-detail-modal-input"
              >
                <option value="">Pilih alasan</option>
                {LOST_REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                id="prospect-lost-reason"
                type="text"
                value={lostReason}
                maxLength={255}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder={lostCategory === 'lainnya' ? 'Jelaskan alasannya (wajib)' : 'Keterangan tambahan (opsional)'}
                className="db-detail-modal-input db-detail-modal-input--spaced"
                aria-label="Keterangan alasan"
              />
            </div>
          )}

          {targetStatus === 'closing' && (
            <div className={`db-detail-closing-warning ${confirmClosing ? 'db-detail-closing-warning--confirm' : ''}`}>
              {confirmClosing ? (
                <span>
                  Konfirmasi closing untuk <strong>{data?.prospect.name}</strong>: jamaah sudah membayar DP. Jika jamaah batal nanti, gunakan tombol Batalkan Closing.
                </span>
              ) : closingCommissionGap ? (
                <span>
                  <strong>Closing = jamaah sudah membayar DP.</strong> <strong>{closingCommissionGap}, jadi komisi agen tidak dibukukan.</strong>{' '}
                  Isi paket lewat Edit Data dulu jika agen berhak komisi.
                </span>
              ) : data?.agent ? (
                <span>
                  <strong>Closing = jamaah sudah membayar DP.</strong> Komisi agen langsung dibukukan dan tertahan sampai jamaah ditandai lunas (sesuai pengaturan pencairan komisi).
                </span>
              ) : (
                <span>
                  <strong>Closing = jamaah sudah membayar DP.</strong>
                </span>
              )}
            </div>
          )}

          {statusError && <div className="db-detail-inline-error">{statusError}</div>}
        </form>
      </Modal>

      {/* Tandai Lunas Modal */}
      <Modal
        isOpen={paidOffModalOpen}
        onClose={() => setPaidOffModalOpen(false)}
        title="Tandai Jamaah Lunas"
        footer={
          <div className="db-detail-modal-footer">
            <Button variant="secondary" size="md" type="button" onClick={() => setPaidOffModalOpen(false)} disabled={closingActionBusy}>
              Batal
            </Button>
            <Button variant="primary" size="md" type="button" onClick={handleMarkPaidOff} disabled={closingActionBusy}>
              {closingActionBusy ? <RefreshCw size={15} className="db-spin" /> : <BadgeCheck size={15} />}
              <span>Ya, Jamaah Sudah Lunas</span>
            </Button>
          </div>
        }
      >
        <div className="db-detail-modal-form">
          <p className="db-detail-modal-text">
            Pastikan <strong>{data?.prospect.name}</strong> sudah melunasi pembayaran paket.
            {data?.agent ? (
              <>
                {' '}Komisi agen
                {data?.info_komisi?.held_amount ? <> sebesar <strong>{formatIDR(data.info_komisi.held_amount)}</strong></> : null}{' '}
                akan bisa dicairkan setelah ini.
              </>
            ) : null}
          </p>
          {closingActionError && <div className="db-detail-inline-error">{closingActionError}</div>}
        </div>
      </Modal>

      {/* Batalkan Closing Modal (jamaah batal setelah DP) */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Batalkan Closing"
        footer={
          <div className="db-detail-modal-footer">
            <Button variant="secondary" size="md" type="button" onClick={() => setCancelModalOpen(false)} disabled={closingActionBusy}>
              Kembali
            </Button>
            <Button variant="secondary" size="md" type="button" className="db-detail-danger-btn" onClick={handleCancelClosing} disabled={closingActionBusy}>
              {closingActionBusy ? <RefreshCw size={15} className="db-spin" /> : <Undo2 size={15} />}
              <span>Batalkan Closing</span>
            </Button>
          </div>
        }
      >
        <div className="db-detail-modal-form">
          <p className="db-detail-modal-text">
            Status <strong>{data?.prospect.name}</strong> akan menjadi Tidak Lanjut dan komisi agen dibatalkan.
          </p>
          {(data?.info_komisi?.released_amount || 0) > 0 && (
            <div className="db-detail-closing-warning db-detail-closing-warning--confirm">
              Komisi {formatIDR(data?.info_komisi?.released_amount || 0)} sudah bisa dicairkan agen. Jumlah ini akan
              dipotong dari komisi agen berikutnya.
            </div>
          )}
          <div>
            <label className="db-detail-modal-label" htmlFor="cancel-closing-reason">
              Alasan Pembatalan <span className="db-detail-required">*</span>
            </label>
            <input
              id="cancel-closing-reason"
              type="text"
              value={cancelReason}
              maxLength={200}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Contoh: Visa ditolak, jamaah sakit, refund"
              className="db-detail-modal-input"
            />
          </div>
          {closingActionError && <div className="db-detail-inline-error">{closingActionError}</div>}
        </div>
      </Modal>

      {/* Hapus Data Pribadi Modal (UU PDP) for prospects with commission history. */}
      <Modal
        isOpen={anonymizeModalOpen}
        onClose={() => setAnonymizeModalOpen(false)}
        title="Hapus Data Pribadi Jamaah"
        footer={
          <div className="db-detail-modal-footer">
            <Button variant="secondary" size="md" type="button" onClick={() => setAnonymizeModalOpen(false)} disabled={anonymizing}>
              Batal
            </Button>
            <Button variant="secondary" size="md" type="button" className="db-detail-danger-btn" onClick={handleAnonymize} disabled={anonymizing}>
              {anonymizing ? <RefreshCw size={15} className="db-spin" /> : <UserX size={15} />}
              <span>Hapus Data Pribadi</span>
            </Button>
          </div>
        }
      >
        <div className="db-detail-modal-form">
          <p className="db-detail-modal-text">
            Gunakan hanya jika <strong>{data?.prospect.name}</strong> meminta datanya dihapus (UU PDP). Nama, nomor
            WhatsApp, email, domisili, dan semua catatan follow-up akan dihapus permanen. Status, paket, jumlah jamaah,
            dan riwayat komisi agen tetap disimpan. Tindakan ini tidak dapat dibatalkan.
          </p>
          {anonymizeError && <div className="db-detail-inline-error">{anonymizeError}</div>}
        </div>
      </Modal>

      {/* Hapus Prospek Modal (spam / data uji). Prospek closing tidak bisa dihapus. */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Hapus Prospek"
        footer={
          <div className="db-detail-modal-footer">
            <Button variant="secondary" size="md" type="button" onClick={() => setDeleteModalOpen(false)} disabled={deleting}>
              Batal
            </Button>
            <Button variant="secondary" size="md" type="button" className="db-detail-danger-btn" onClick={handleDelete} disabled={deleting}>
              {deleting ? <RefreshCw size={15} className="db-spin" /> : <Trash2 size={15} />}
              <span>Hapus Permanen</span>
            </Button>
          </div>
        }
      >
        <div className="db-detail-modal-form">
          <p className="db-detail-modal-text">
            Hapus prospek <strong>{data?.prospect.name}</strong> beserta catatan dan riwayat statusnya? Gunakan untuk data
            spam atau data uji. Tindakan ini tidak dapat dibatalkan.
          </p>
          {deleteError && <div className="db-detail-inline-error">{deleteError}</div>}
        </div>
      </Modal>
    </div>
  );
};
