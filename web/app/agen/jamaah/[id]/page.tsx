'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  MessageCircle,
  Calendar,
  Package as PackageIcon,
  Users,
  Send,
  AlertCircle,
  RefreshCw,
  X,
  Info,
  MessageSquare,
  Lock,
} from 'lucide-react';
import { MobileContainer } from '../../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../../components/AgentBottomNavbar';
import styles from './page.module.css';
import { LOST_REASON_OPTIONS, formatDeparturePlan } from '../../../../lib/lostReasons';

interface ProspectData {
  id: number;
  tenant_id: number;
  package_id?: number | null;
  agent_id?: number | null;
  name: string;
  phone: string;
  email?: string | null;
  jumlah_jamaah?: number | null;
  status: string;
  source_channel?: string;
  entry_method: string;
  departure_plan?: string | null;
  domicile?: string | null;
  /** Jamaah ditandai lunas oleh admin: komisi bisa dicairkan. */
  paid_off_at?: string | null;
  /** Personal data removed on the jamaah's request (UU PDP): no contact, no status change, no notes. */
  anonymized_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface PackageData {
  id: number;
  name: string;
  price?: number | null;
  status?: string;
  departure_date?: string | null;
}

interface CommissionInfo {
  type: string; // "potensi" | "final" | "dibatalkan"
  direct_amount: number;
  override_amount: number;
  total_amount: number; // agent's own commission (the upline override is not included for agents)
  rate_per_jamaah: number;
  held_amount?: number; // part still held until the jamaah is lunas
  released_amount?: number;
}

interface StatusHistoryItem {
  id: number;
  prospect_id: number;
  old_status?: string | null;
  new_status: string;
  changed_by_type: string; // "agent" or "admin"
  changed_by_id: number;
  lost_reason?: string | null;
  changed_at: string;
}

interface NoteItem {
  id: number;
  prospect_id: number;
  author_type: string; // "agent" or "admin"
  author_id: number;
  note_text: string;
  created_at: string;
}

interface ProspectDetailResponse {
  prospect: ProspectData;
  package?: PackageData | null;
  info_komisi?: CommissionInfo | null;
  status_history: StatusHistoryItem[];
  notes: NoteItem[];
}

export default function AgenJamaahDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [data, setData] = useState<ProspectDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>('Portal Mitra Agen');
  const [travelSuspended, setTravelSuspended] = useState<boolean>(false);

  // Status Change Modal
  const [isStatusModalOpen, setIsStatusModalOpen] = useState<boolean>(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('baru');
  const [lostReason, setLostReason] = useState<string>('');
  const [lostCategory, setLostCategory] = useState<string>('');
  const [statusSubmitting, setStatusSubmitting] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Note Form
  const [newNoteText, setNewNoteText] = useState<string>('');
  const [noteSubmitting, setNoteSubmitting] = useState<boolean>(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const fetchDetail = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch me for branding
      try {
        const meRes = await fetch('/api/agent/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const meJson = await meRes.json();
          if (meJson.tenant_name) setTenantName(meJson.tenant_name);
          setTravelSuspended(Boolean(meJson.travel_suspended));
        }
      } catch {
        // Soft fail
      }

      // 2. Fetch jamaah detail
      const res = await fetch(`/api/agent/jamaah/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        localStorage.removeItem('agent_token');
        router.push('/agen/login');
        return;
      }

      if (res.status === 404) {
        setError('Data jamaah tidak ditemukan atau Anda tidak memiliki akses ke data ini.');
        return;
      }

      if (!res.ok) {
        throw new Error('Gagal memuat detail jamaah');
      }

      const resData: ProspectDetailResponse = await res.json();
      setData(resData);
      setSelectedStatus(resData.prospect.status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleOpenStatusModal = () => {
    if (data?.prospect && data.prospect.status !== 'closing') {
      setSelectedStatus(data.prospect.status);
      setLostReason('');
      setLostCategory('');
      setStatusError(null);
      setIsStatusModalOpen(true);
    }
  };

  const handleCloseStatusModal = () => {
    if (!statusSubmitting) {
      setIsStatusModalOpen(false);
      setStatusError(null);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setStatusSubmitting(true);
      setStatusError(null);

      const payload: { status: string; lost_reason?: string; lost_reason_category?: string } = {
        status: selectedStatus,
      };
      if (selectedStatus === 'tidak_lanjut') {
        if (!lostCategory) {
          throw new Error('Pilih alasan tidak lanjut');
        }
        if (lostCategory === 'lainnya' && !lostReason.trim()) {
          throw new Error('Jelaskan alasan untuk pilihan Lainnya');
        }
        payload.lost_reason_category = lostCategory;
        if (lostReason.trim()) payload.lost_reason = lostReason.trim();
      }

      const res = await fetch(`/api/agent/jamaah/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Gagal mengubah status');
      }

      setIsStatusModalOpen(false);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat mengubah status';
      setStatusError(msg);
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    if (!newNoteText.trim()) return;

    try {
      setNoteSubmitting(true);
      setNoteError(null);

      const res = await fetch(`/api/agent/jamaah/${id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note_text: newNoteText.trim() }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Gagal menambahkan catatan');
      }

      setNewNoteText('');
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setNoteError(msg);
    } finally {
      setNoteSubmitting(false);
    }
  };

  const formatRupiah = (val: number): string => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '-';
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
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'baru':
        return {
          label: 'Baru',
          bg: 'color-mix(in srgb, var(--tw-status-new) 12%, var(--tw-background))',
          color: 'var(--tw-status-new-text)',
          border: '1px solid color-mix(in srgb, var(--tw-status-new) 30%, transparent)',
        };
      case 'dihubungi':
        return {
          label: 'Dihubungi',
          bg: 'color-mix(in srgb, var(--tw-status-contacted) 12%, var(--tw-background))',
          color: 'var(--tw-status-contacted-text)',
          border: '1px solid color-mix(in srgb, var(--tw-status-contacted) 30%, transparent)',
        };
      case 'tertarik':
        return {
          label: 'Tertarik',
          bg: 'color-mix(in srgb, var(--tw-brand-primary) 12%, var(--tw-background))',
          color: 'var(--tw-brand-primary)',
          border: '1px solid color-mix(in srgb, var(--tw-brand-primary) 28%, transparent)',
        };
      case 'closing':
        return {
          label: 'Closing',
          bg: 'var(--tw-badge-success-bg)',
          color: 'var(--tw-income)',
          border: '1px solid color-mix(in srgb, var(--tw-status-closing) 30%, transparent)',
        };
      case 'tidak_lanjut':
        return {
          label: 'Tidak Lanjut',
          bg: 'var(--tw-badge-neutral-bg)',
          color: 'var(--tw-text-muted)',
          border: '1px solid var(--tw-border)',
        };
      default:
        return {
          label: status,
          bg: 'var(--tw-badge-neutral-bg)',
          color: 'var(--tw-text-muted)',
          border: '1px solid var(--tw-border)',
        };
    }
  };

  const getWhatsAppUrl = (phone: string, name: string): string => {
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '62');
    const greeting = `Assalamu'alaikum ${name}, perkenalkan saya mitra resmi ${tenantName}. Terkait rencana ibadah umroh Bapak/Ibu, apakah ada informasi yang ingin ditanyakan?`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(greeting)}`;
  };

  if (loading) {
    return (
      <MobileContainer>
        <header
          className={styles.detailheader1}
        >
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Kembali"
            className={styles.detailbutton2}
          >
            <ArrowLeft size={20} />
          </button>
          <span
            className={styles.detailspan3}
          >
            Detail Jamaah
          </span>
        </header>
        <div
          className={styles.detaildiv4}
        >
          <div
            className={styles.detaildiv5}
          />
          <span className={styles.detailspan6}>
            Memuat data detail jamaah...
          </span>
          <style jsx>{`
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </div>
      </MobileContainer>
    );
  }

  if (error || !data) {
    return (
      <MobileContainer>
        <header
          className={styles.detailheader1}
        >
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Kembali"
            className={styles.detailbutton7}
          >
            <ArrowLeft size={20} />
          </button>
          <span
            className={styles.detailspan3}
          >
            Detail Jamaah
          </span>
        </header>
        <div
          className={styles.detaildiv8}
        >
          <div className={styles.detaildiv9}>
            <AlertCircle size={36} />
          </div>
          <h2 className={styles.detailh210}>
            Data Tidak Ditemukan
          </h2>
          <p className={styles.detailp11}>
            {error || 'Informasi jamaah tidak dapat ditampilkan.'}
          </p>
          <Link
            href="/agen/jamaah"
            className={styles.detaillink12}
          >
            <ArrowLeft size={15} />
            <span>Kembali ke Daftar Jamaah</span>
          </Link>
        </div>
      </MobileContainer>
    );
  }

  const { prospect, package: pkg, info_komisi, status_history, notes } = data;
  const statusBadge = getStatusBadge(prospect.status);
  const isClosing = prospect.status === 'closing';
  const isAnonymized = !!prospect.anonymized_at;
  // Status and notes cannot change while the data is anonymized or the travel is suspended.
  const isReadOnly = isAnonymized || travelSuspended;

  return (
    <MobileContainer>
      {/* Sticky Header */}
      <header
        className={styles.detailheader1}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Kembali"
          className={styles.detailbutton13}
        >
          <ArrowLeft size={20} />
        </button>

        <div className={styles.detaildiv14}>
          <h1
            className={styles.detailh115}
          >
            {prospect.name}
          </h1>
          <span className={styles.detailspan16}>
            Detail Calon Jamaah
          </span>
        </div>

        <span
          className={styles.detailspan17} style={{
  backgroundColor: statusBadge.bg,
  color: statusBadge.color,
  border: statusBadge.border
}}
        >
          {statusBadge.label}
          {isClosing && (prospect.paid_off_at ? ' · Lunas' : ' · Menunggu lunas')}
        </span>
      </header>

      {/* Main Canvas */}
      <div
        className={styles.detaildiv18}
      >
        {/* 1. Info Kontak Section */}
        <section
          aria-label="Info Kontak Jamaah"
          className={styles.detailsection19}
        >
          <div className={styles.detaildiv20}>
            <span
              className={styles.detailspan21}
            >
              Calon Jamaah
            </span>
            <h2
              className={styles.detailh222}
            >
              {prospect.name}
            </h2>
            <span
              className={styles.detailspan23}
            >
              {prospect.phone}
            </span>
          </div>

          {/* Action Buttons (none once the jamaah's personal data was removed) */}
          {!isAnonymized && (
          <div className={styles.detaildiv24}>
            <a
              href={getWhatsAppUrl(prospect.phone, prospect.name)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.detaila25}
            >
              <MessageCircle size={15} color="var(--tw-on-brand)" />
              <span>Chat WhatsApp</span>
            </a>

            <Link
              href={`/agen/script-wa?prospect_id=${prospect.id}`}
              className={styles.detaillink26}
            >
              <MessageSquare size={15} />
              <span>Script Chat</span>
            </Link>
          </div>
          )}
        </section>

        {/* 2. Konteks Pendaftaran Section */}
        <section
          aria-label="Konteks Pendaftaran"
          className={styles.detailsection27}
        >
          <span
            className={styles.detailspan28}
          >
            Konteks Pendaftaran
          </span>

          <div className={styles.detaildiv29}>
            <div className={styles.detaildiv20}>
              <span className={styles.detailspan30}>Paket Diminati</span>
              <div className={styles.detaildiv31}>
                <PackageIcon size={13} color="var(--tw-text-secondary)" className={styles.noShrink} />
                <span className={styles.detailspan32}>
                  {pkg ? pkg.name : 'Paket Pilihan'}
                </span>
              </div>
            </div>

            <div className={styles.detaildiv20}>
              <span className={styles.detailspan30}>Jumlah Jamaah</span>
              <div className={styles.detaildiv31}>
                <Users size={13} color="var(--tw-text-secondary)" className={styles.noShrink} />
                <span className={styles.detailspan32}>
                  {prospect.jumlah_jamaah || 1} Orang
                </span>
              </div>
            </div>

            <div className={styles.detaildiv20}>
              <span className={styles.detailspan30}>{pkg ? 'Berangkat' : 'Rencana Berangkat'}</span>
              <div className={styles.detaildiv31}>
                <span className={styles.detailspan32}>
                  {pkg ? (pkg.departure_date ? formatDate(pkg.departure_date) : 'Belum diatur di paket') : formatDeparturePlan(prospect.departure_plan)}
                </span>
              </div>
            </div>

            <div className={styles.detaildiv20}>
              <span className={styles.detailspan30}>Domisili</span>
              <div className={styles.detaildiv31}>
                <span className={styles.detailspan32}>{prospect.domicile || '-'}</span>
              </div>
            </div>

            <div className={styles.detaildiv20}>
              <span className={styles.detailspan30}>Jalur Pendaftaran</span>
              <span className={styles.detailspan33}>
                {prospect.entry_method === 'agent_manual' ? 'Input Manual Agen' : 'Formulir Website'}
              </span>
            </div>

            <div className={styles.detaildiv20}>
              <span className={styles.detailspan30}>Tanggal Masuk</span>
              <div className={styles.detaildiv31}>
                <Calendar size={12} color="var(--tw-text-secondary)" />
                <span className={styles.detailspan33}>
                  {formatDate(prospect.created_at)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Info Komisi Section */}
        {info_komisi && info_komisi.type !== 'dibatalkan' && (
          <section
            aria-label="Informasi Komisi"
            className={styles.detailsection34}
          >
            <div className={styles.detaildiv35}>
              <span
                className={styles.detailspan28}
              >
                Informasi Komisi
              </span>

              <span
                className={`${styles.detailspan36} ${isClosing ? styles.detailspan37 : styles.detailspan38}`}
              >
                {!isClosing
                  ? 'Potensi Komisi'
                  : prospect.paid_off_at
                  ? 'Lunas, siap dicairkan'
                  : 'Tertahan, menunggu lunas'}
              </span>
            </div>

            <div className={styles.detaildiv39}>
              <span
                className={styles.detailspan40}
              >
                {formatRupiah(info_komisi.total_amount)}
              </span>
              {info_komisi.rate_per_jamaah > 0 && (prospect.jumlah_jamaah || 1) > 1 && (
                <span className={styles.detailspan30}>
                  ({formatRupiah(info_komisi.rate_per_jamaah)} x {prospect.jumlah_jamaah} jamaah)
                </span>
              )}
            </div>

            <p
              className={styles.detailp41}
            >
              {!isClosing
                ? 'Komisi berstatus potensi. Komisi tercatat saat jamaah membayar DP (closing).'
                : prospect.paid_off_at || (info_komisi.held_amount || 0) <= 0
                ? 'Jamaah sudah lunas. Komisi ini sudah bisa Anda cairkan.'
                : 'Jamaah sudah membayar DP. Komisi tercatat dan bisa dicairkan setelah admin menandai jamaah lunas.'}
            </p>
          </section>
        )}

        {/* 4. Pipeline Status & Ubah Status Button */}
        <section
          aria-label="Status Prospek"
          className={styles.detailsection27}
        >
          <div className={styles.detaildiv35}>
            <div className={styles.detaildiv20}>
              <span
                className={styles.detailspan28}
              >
                Status Tahapan
              </span>
              <span className={styles.detailspan42}>
                {statusBadge.label}
          {isClosing && (prospect.paid_off_at ? ' · Lunas' : ' · Menunggu lunas')}
              </span>
            </div>

            {!isClosing && !isReadOnly ? (
              <button
                type="button"
                onClick={handleOpenStatusModal}
                className={styles.detailbutton43}
              >
                Ubah Status
              </button>
            ) : (
              <span
                className={styles.detailspan44}
              >
                <Lock size={12} />
                <span>{isClosing ? 'Closing — Status Final' : 'Status Terkunci'}</span>
              </span>
            )}
          </div>

          <div
            className={styles.detaildiv45}
          >
            <Info size={14} color="var(--tw-text-muted)" className={styles.noShrink} />
            <span className={styles.detailspan46}>
              {isAnonymized
                ? 'Data pribadi jamaah ini sudah dihapus atas permintaannya (UU PDP). Riwayat dan komisi tetap tersimpan.'
                : travelSuspended
                ? 'Layanan travel sedang ditangguhkan. Status dan catatan bisa diubah lagi setelah travel memperpanjang langganan.'
                : isClosing
                ? 'Status prospek ini sudah Closing dan bersifat final.'
                : 'Status Closing akan ditetapkan oleh admin travel setelah verifikasi pembayaran.'}
            </span>
          </div>
        </section>

        {/* 5. Riwayat Status Timeline */}
        <section
          aria-label="Riwayat Status"
          className={styles.detailsection27}
        >
          <span
            className={styles.detailspan28}
          >
            Riwayat Status
          </span>

          {status_history.length === 0 ? (
            <span className={styles.detailspan47}>
              Belum ada perubahan status.
            </span>
          ) : (
            <div className={styles.detaildiv48}>
              {status_history.map((hist, idx) => {
                const isAgent = hist.changed_by_type === 'agent';
                const isLast = idx === status_history.length - 1;

                return (
                  <div
                    key={hist.id}
                    className={styles.detaildiv49}
                  >
                    <div
                      className={styles.detaildiv50}
                    />

                    <div
                      className={`${styles.detaildiv51} ${isLast ? styles.detaildiv52 : styles.detaildiv53}`}
                    >
                      <div className={styles.detaildiv54}>
                        <span className={styles.detailspan33}>
                          Status: {hist.new_status}
                        </span>
                        <span className={styles.detailspan55}>
                          {formatDateTime(hist.changed_at)}
                        </span>
                      </div>

                      <span className={styles.detailspan56}>
                        {isAgent ? 'Diubah oleh Anda' : 'Diubah oleh Admin Travel'}
                        {hist.lost_reason && ` - Alasan: ${hist.lost_reason}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 6. Catatan Perkembangan Section */}
        <section
          aria-label="Catatan Perkembangan"
          className={styles.detailsection27}
        >
          <span
            className={styles.detailspan28}
          >
            Catatan Prospek ({notes.length})
          </span>

          {/* Form Tambah Catatan */}
          {!isReadOnly && (
          <form onSubmit={handleAddNote} className={styles.detailform57}>
            {noteError && (
              <span className={styles.detailspan58}>
                {noteError}
              </span>
            )}
            <textarea
              rows={2}
              required
              placeholder="Tulis catatan perkembangan jamaah..."
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              className={styles.detailtextarea59}
            />

            <div className={styles.detaildiv60}>
              <button
                type="submit"
                disabled={noteSubmitting || !newNoteText.trim()}
                className={`${styles.detailbutton61} ${noteSubmitting || !newNoteText.trim() ? styles.detailbutton62 : styles.detailbutton63}`}
              >
                <Send size={12} />
                <span>{noteSubmitting ? 'Mengirim...' : 'Tambah Catatan'}</span>
              </button>
            </div>
          </form>
          )}

          {/* List of Notes */}
          {notes.length === 0 ? (
            <div className={styles.detaildiv64}>
              <span className={styles.detailspan47}>
                Belum ada catatan. Tambahkan catatan untuk memantau follow-up.
              </span>
            </div>
          ) : (
            <div className={styles.detaildiv65}>
              {notes.map((note) => {
                const isAuthorAgent = note.author_type === 'agent';
                return (
                  <div
                    key={note.id}
                    className={`${styles.detaildiv66} ${isAuthorAgent ? styles.detaildiv67 : styles.detaildiv68}`}
                  >
                    <p
                      className={styles.detailp69}
                    >
                      {note.note_text}
                    </p>
                    <div className={styles.detaildiv70}>
                      <span className={styles.detailspan71}>
                        {isAuthorAgent ? 'Catatan Anda' : 'Admin Travel'}
                      </span>
                      <span className={styles.detailspan55}>
                        {formatDateTime(note.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Modal Ubah Status (TIDAK ADA OPSI CLOSING) */}
      {!isClosing && !isReadOnly && isStatusModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-status-title"
          className={styles.detaildiv72}
        >
          <div
            className={styles.detaildiv73}
          >
            <div className={styles.detaildiv35}>
              <h2
                id="modal-status-title"
                className={styles.detailh274}
              >
                Ubah Status Prospek
              </h2>
              <button
                type="button"
                onClick={handleCloseStatusModal}
                disabled={statusSubmitting}
                aria-label="Tutup modal"
                className={styles.detailbutton75}
              >
                <X size={15} />
              </button>
            </div>

            {statusError && (
              <div
                className={styles.detaildiv76}
              >
                {statusError}
              </div>
            )}

            <form onSubmit={handleUpdateStatus} className={styles.detailform77}>
              {/* Status Radio Choices */}
              <div className={styles.detailform57}>
                {[
                  { key: 'baru', label: 'Baru', desc: 'Calon jamaah baru mendaftar / masuk' },
                  { key: 'dihubungi', label: 'Dihubungi', desc: 'Sudah dihubungi via WhatsApp atau telepon' },
                  { key: 'tertarik', label: 'Tertarik', desc: 'Sedang mempertimbangkan tanggal / paket' },
                  { key: 'tidak_lanjut', label: 'Tidak Lanjut', desc: 'Batal berangkat atau belum berminat' },
                ].map((opt) => {
                  const isChecked = selectedStatus === opt.key;
                  return (
                    <label
                      key={opt.key}
                      className={`${styles.detaillabel78} ${isChecked ? styles.detaillabel79 : styles.detaillabel80}`}
                    >
                      <input
                        type="radio"
                        name="prospect_status"
                        value={opt.key}
                        checked={isChecked}
                        onChange={() => setSelectedStatus(opt.key)}
                        className={styles.detailinput81}
                      />
                      <div className={styles.detaildiv82}>
                        <span className={styles.detailspan32}>
                          {opt.label}
                        </span>
                        <span className={styles.detailspan30}>
                          {opt.desc}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Alasan Tidak Lanjut (Conditional) */}
              {selectedStatus === 'tidak_lanjut' && (
                <div className={styles.detaildiv83}>
                  <label className={styles.detailspan33} htmlFor="lost-category">
                    Alasan Tidak Lanjut
                  </label>
                  <select
                    id="lost-category"
                    value={lostCategory}
                    onChange={(e) => setLostCategory(e.target.value)}
                    className={styles.detailinput84}
                  >
                    <option value="">Pilih alasan</option>
                    {LOST_REASON_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder={lostCategory === 'lainnya' ? 'Jelaskan alasannya (wajib)' : 'Keterangan tambahan (opsional)'}
                    value={lostReason}
                    maxLength={255}
                    onChange={(e) => setLostReason(e.target.value)}
                    className={styles.detailinput84}
                  />
                </div>
              )}

              {/* Notice */}
              <div
                className={styles.detaildiv85}
              >
                Status <strong>Closing</strong> hanya dapat ditetapkan oleh admin travel setelah verifikasi pembayaran.
              </div>

              {/* Buttons */}
              <div className={styles.detaildiv86}>
                <button
                  type="button"
                  onClick={handleCloseStatusModal}
                  disabled={statusSubmitting}
                  className={styles.detailbutton87}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={statusSubmitting}
                  className={`${styles.detailbutton88} ${statusSubmitting ? styles.detailbutton89 : styles.detailbutton63}`}
                >
                  {statusSubmitting ? 'Menyimpan...' : 'Simpan Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
