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
  Lock,
  X,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Button,
  Badge,
  getStandardMenuItems,
} from '../components';
import {
  type ProspectDetailResponse,
  fetchProspectDetail,
  updateProspectStatus,
  addProspectNote,
  getStoredUser,
} from '../services/api';
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
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  } catch {
    return '—';
  }
};

const formatFullDate = (dateStr: string): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const datePart = d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timePart = d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return dateStr;
  }
};

const formatTimeWIB = (dateStr: string): string => {
  if (!dateStr) return '';
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
  const [submittingStatus, setSubmittingStatus] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);

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
      setLostReason(detail.prospect.lost_reason || '');
    } catch (err: any) {
      setError(err.message || 'Gagal memuat detail prospek');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [prospectId]);

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;

    try {
      setSubmittingStatus(true);
      setStatusError(null);
      await updateProspectStatus(
        prospectId,
        targetStatus,
        targetStatus === 'tidak_lanjut' ? lostReason : undefined
      );
      setStatusModalOpen(false);
      await loadDetail();
    } catch (err: any) {
      setStatusError(err.message || 'Gagal mengubah status');
    } finally {
      setSubmittingStatus(false);
    }
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

        <main className="db-page-container" style={{ maxWidth: '1400px' }}>
          {/* Top Page Header */}
          <PageHeader
            title="Detail Prospek"
            subtitle="Rincian data, progres follow-up, dan riwayat calon jamaah."
            backButton={
              <button
                type="button"
                className="db-back-btn"
                onClick={() => navigate('/prospects')}
                aria-label="Kembali ke Daftar Prospek"
                title="Kembali ke Daftar Prospek"
              >
                <ArrowLeft size={16} />
              </button>
            }
            actions={
              <div className="db-prospect-header-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/prospects/${prospectId}/edit`)}
                >
                  <Pencil size={14} />
                  <span>Edit Data</span>
                </Button>

                {data?.prospect.status !== 'closing' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setStatusModalOpen(true)}
                  >
                    <RefreshCw size={14} />
                    <span>Ubah Status</span>
                  </Button>
                ) : (
                  <div className="db-status-final-badge">
                    <Lock size={13} />
                    <span>Closing (Terkunci)</span>
                  </div>
                )}
              </div>
            }
          />

          {loading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '320px',
                color: 'var(--db-text-muted)',
                gap: '10px',
              }}
            >
              <RefreshCw size={22} className="db-spin" />
              <span>Memuat data prospek...</span>
            </div>
          ) : error || !data ? (
            <div className="db-detail-card" style={{ padding: '36px', textAlign: 'center' }}>
              <p
                style={{
                  fontWeight: 700,
                  fontSize: '16px',
                  color: 'var(--db-negative)',
                  marginBottom: '8px',
                }}
              >
                Terjadi Kesalahan
              </p>
              <p
                style={{
                  color: 'var(--db-text-muted)',
                  fontSize: '14px',
                  marginBottom: '16px',
                }}
              >
                {error || 'Prospek tidak ditemukan'}
              </p>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/prospects')}
                >
                  Kembali ke Daftar Prospek
                </Button>
              </div>
            </div>
          ) : (
            <div className="db-prospect-detail-page">
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
                          {data.agent
                            ? 'Referral Agen'
                            : data.prospect.source_channel === 'meta_ads'
                            ? 'Meta Ads'
                            : data.prospect.source_channel === 'google'
                            ? 'Google Search'
                            : 'Website (Organik)'}
                        </span>
                        <span className="db-info-field__supporting">
                          {data.agent
                            ? `Kode ${data.agent.referral_code}`
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
                          {formatFullDate(data.prospect.created_at)}
                        </span>
                        <span className="db-info-field__supporting">
                          {formatTimeWIB(data.prospect.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Komisi Agen: Only displayed if agent exists */}
                  {data.agent && (
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
                          {data.info_komisi?.type === 'final'
                            ? 'Nominal komisi terkunci permanen karena prospek sudah Closing.'
                            : 'Nominal komisi akan dikunci permanen saat prospek berstatus Closing.'}
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

                    <form onSubmit={handleNoteSubmit} className="db-note-composer">
                      <textarea
                        rows={2}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Tulis catatan hasil follow-up..."
                        className="db-note-textarea"
                      />
                      {noteError && (
                        <span
                          style={{
                            color: 'var(--db-negative)',
                            fontSize: '11px',
                          }}
                        >
                          {noteError}
                        </span>
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

                    <div className="db-notes-list">
                      {data.notes.length === 0 ? (
                        <div
                          style={{
                            padding: '24px',
                            textAlign: 'center',
                            backgroundColor: 'var(--db-page-bg)',
                            borderRadius: '7px',
                            border: '1px dashed var(--db-border)',
                          }}
                        >
                          <FileText
                            size={20}
                            color="var(--db-text-muted)"
                            style={{ margin: '0 auto 6px' }}
                          />
                          <p
                            style={{
                              color: 'var(--db-text-muted)',
                              fontSize: '12px',
                              margin: 0,
                            }}
                          >
                            Belum ada catatan follow-up.
                          </p>
                        </div>
                      ) : (
                        data.notes.map((note) => {
                          const isAdmin = note.author_type === 'admin';
                          const timeStr = formatDateTime(note.created_at);
                          return (
                            <div key={note.id} className="db-note-item">
                              <div className="db-note-item-header">
                                <div className="db-note-author-wrap">
                                  <div
                                    className={`db-note-author-dot ${
                                      isAdmin
                                        ? 'db-note-author-dot--admin'
                                        : 'db-note-author-dot--agent'
                                    }`}
                                  />
                                  <span className="db-note-author-name">
                                    {note.author_name ||
                                      (isAdmin ? 'Admin Travel' : 'Agen')}
                                  </span>
                                  <span className="db-note-role-badge">
                                    {isAdmin ? 'ADMIN' : 'AGEN'}
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
                        <div
                          style={{
                            padding: '24px',
                            textAlign: 'center',
                            backgroundColor: 'var(--db-page-bg)',
                            borderRadius: '7px',
                            border: '1px dashed var(--db-border)',
                          }}
                        >
                          <History
                            size={20}
                            color="var(--db-text-muted)"
                            style={{ margin: '0 auto 6px' }}
                          />
                          <p
                            style={{
                              color: 'var(--db-text-muted)',
                              fontSize: '12px',
                              margin: 0,
                            }}
                          >
                            Belum ada riwayat perubahan status.
                          </p>
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
                                      Alasan: {data.prospect.lost_reason}
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
      {statusModalOpen && data?.prospect.status !== 'closing' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--db-modal-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--db-card-bg)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              boxShadow: 'var(--db-modal-shadow)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3
                style={{
                  fontSize: 'var(--font-size-xl, 18px)',
                  fontWeight: 700,
                  color: 'var(--db-text-primary)',
                  margin: 0,
                }}
              >
                Ubah Status Prospek
              </h3>
              <button
                type="button"
                onClick={() => setStatusModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--db-text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px',
                }}
                aria-label="Tutup"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleStatusSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div>
                <label
                  style={{
                    fontSize: 'var(--font-size-sm, 13px)',
                    fontWeight: 700,
                    color: 'var(--db-text-primary)',
                    display: 'block',
                    marginBottom: '8px',
                  }}
                >
                  Pilih Status Baru
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '8px',
                  }}
                >
                  {[
                    { val: 'baru', label: 'Baru' },
                    { val: 'dihubungi', label: 'Dihubungi' },
                    { val: 'tertarik', label: 'Tertarik' },
                    { val: 'closing', label: 'Closing' },
                    { val: 'tidak_lanjut', label: 'Tidak Lanjut' },
                  ].map((item) => {
                    const isSelected = targetStatus === item.val;
                    return (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => setTargetStatus(item.val)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: isSelected
                            ? '2px solid var(--db-sidebar-bg)'
                            : '1px solid var(--db-border)',
                          backgroundColor: isSelected
                            ? 'var(--db-page-bg)'
                            : 'var(--db-card-bg)',
                          color: isSelected
                            ? 'var(--db-sidebar-bg)'
                            : 'var(--db-text-primary)',
                          fontWeight: isSelected ? 800 : 500,
                          fontSize: '13px',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {targetStatus === 'tidak_lanjut' && (
                <div>
                  <label
                    style={{
                      fontSize: 'var(--font-size-sm, 13px)',
                      fontWeight: 700,
                      color: 'var(--db-text-primary)',
                      display: 'block',
                      marginBottom: '6px',
                    }}
                  >
                    Alasan Tidak Lanjut
                  </label>
                  <input
                    type="text"
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                    placeholder="Contoh: Menunda keberangkatan, memilih travel lain"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--db-border)',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              {targetStatus === 'closing' && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'color-mix(in srgb, var(--db-positive) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--db-positive) 30%, transparent)',
                    color: 'var(--db-positive)',
                    fontSize: '12px',
                    lineHeight: '1.5',
                  }}
                >
                  <strong>Perhatian:</strong> Status Closing akan membukukan komisi agen secara permanen dan mengunci data transaksi.
                </div>
              )}

              {statusError && (
                <div
                  style={{
                    color: 'var(--db-negative)',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {statusError}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '8px',
                }}
              >
                <Button
                  variant="secondary"
                  size="md"
                  type="button"
                  onClick={() => setStatusModalOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  disabled={submittingStatus}
                >
                  {submittingStatus ? (
                    <RefreshCw size={15} className="db-spin" />
                  ) : (
                    <Check size={15} />
                  )}
                  <span>Simpan Status</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
