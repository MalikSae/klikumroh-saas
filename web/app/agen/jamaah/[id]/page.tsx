'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, MessageCircle, AlertCircle, X, MessageSquare, Lock } from 'lucide-react';
import { MobileContainer } from '../../../../components/MobileContainer';
import styles from './page.module.css';
import './JamaahDetail.css';
import { logHabit } from '../../../../lib/agentHabits';
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

// Status labels; colors live in JamaahDetail.css (jd-status--{key}).
const STATUS_LABEL: Record<string, string> = {
  baru: 'Baru',
  dihubungi: 'Dihubungi',
  tertarik: 'Tertarik',
  closing: 'Closing',
  tidak_lanjut: 'Tidak Lanjut',
};

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

  const loadDetail = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
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

  // Refresh after an action: show the loader again, then load.
  const fetchDetail = () => {
    setLoading(true);
    setError(null);
    return loadDetail();
  };

  useEffect(() => {
    if (id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set when the response lands
      loadDetail();
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

  const getWhatsAppUrl = (phone: string, name: string): string => {
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '62');
    const greeting = `Assalamu'alaikum ${name}, perkenalkan saya mitra resmi ${tenantName}. Terkait rencana ibadah umroh Bapak/Ibu, apakah ada informasi yang ingin ditanyakan?`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(greeting)}`;
  };

  const header = (title: string) => (
    <header className="jd-header">
      <button type="button" onClick={() => router.back()} aria-label="Kembali" className="jd-icon-btn">
        <ArrowLeft size={20} />
      </button>
      <h1 className="jd-header__title">{title}</h1>
    </header>
  );

  if (loading) {
    return (
      <MobileContainer>
        {header('Detail jamaah')}
        <div className="jd-page jd-page--center">
          <p className="jd-muted">Memuat data jamaah...</p>
        </div>
      </MobileContainer>
    );
  }

  if (error || !data) {
    return (
      <MobileContainer>
        {header('Detail jamaah')}
        <div className="jd-page jd-page--center">
          <AlertCircle size={32} className="jd-muted" aria-hidden="true" />
          <h2 className="jd-title">Data tidak ditemukan</h2>
          <p className="jd-muted">{error || 'Informasi jamaah tidak dapat ditampilkan.'}</p>
          <Link href="/agen/jamaah" className="jd-btn">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Kembali ke daftar jamaah</span>
          </Link>
        </div>
      </MobileContainer>
    );
  }

  const { prospect, package: pkg, info_komisi, status_history, notes } = data;
  const isClosing = prospect.status === 'closing';
  const isAnonymized = !!prospect.anonymized_at;
  // Status and notes cannot change while the data is anonymized or the travel is suspended.
  const isReadOnly = isAnonymized || travelSuspended;
  const statusText =
    (STATUS_LABEL[prospect.status] || prospect.status) + (isClosing ? (prospect.paid_off_at ? ' · Lunas' : ' · Belum lunas') : '');
  const pax = prospect.jumlah_jamaah || 1;
  // Commission state: potential (before closing), held (DP paid), withdrawable (paid off).
  const komisiState = !isClosing
    ? { text: 'Potensi', tone: 'muted' }
    : prospect.paid_off_at || (info_komisi?.held_amount || 0) <= 0
    ? { text: 'Siap ditarik', tone: 'ok' }
    : { text: 'Tertahan', tone: 'wait' };

  return (
    <MobileContainer>
      {/* Drill-down page: back button, no bottom tab bar (same as Riwayat komisi and Tarik saldo). */}
      {header(prospect.name)}

      <div className="jd-page">
        {/* Registration details as label / value rows. */}
        <section className="jd-panel" aria-labelledby="jd-daftar">
          <div className="jd-panel__head">
            <h2 id="jd-daftar" className="jd-panel__title">Pendaftaran</h2>
          </div>
          <dl className="jd-rows">
            <div className="jd-rows__item">
              <dt>Nomor WA</dt>
              <dd className="jd-num">{prospect.phone || '-'}</dd>
            </div>
            <div className="jd-rows__item jd-rows__item--full">
              <dt>Paket</dt>
              <dd>{pkg ? pkg.name : 'Belum pilih paket'}</dd>
            </div>
            <div className="jd-rows__item">
              <dt>Jumlah jamaah</dt>
              <dd>{pax} orang</dd>
            </div>
            <div className="jd-rows__item">
              <dt>{pkg ? 'Berangkat' : 'Rencana berangkat'}</dt>
              <dd>{pkg ? (pkg.departure_date ? formatDate(pkg.departure_date) : 'Belum diatur') : formatDeparturePlan(prospect.departure_plan)}</dd>
            </div>
            <div className="jd-rows__item">
              <dt>Domisili</dt>
              <dd>{prospect.domicile || '-'}</dd>
            </div>
          </dl>
          <p className="jd-panel__foot">
            Masuk {formatDate(prospect.created_at)} lewat {prospect.entry_method === 'agent_manual' ? 'input manual Anda' : 'formulir website'}
          </p>
        </section>

        {/* Commission for this jamaah. */}
        {info_komisi && info_komisi.type !== 'dibatalkan' && (
          <section className="jd-panel" aria-labelledby="jd-komisi">
            <div className="jd-panel__head">
              <h2 id="jd-komisi" className="jd-panel__title">Komisi</h2>
              <span className={`jd-tag jd-tag--${komisiState.tone}`}>{komisiState.text}</span>
            </div>
            {/* Amount, then the per-jamaah breakdown on its own line (it wrapped awkwardly next to the 22px amount). */}
            <p className="jd-amount">{formatRupiah(info_komisi.total_amount)}</p>
            {info_komisi.rate_per_jamaah > 0 && pax > 1 && (
              <p className="jd-amount__calc">
                {formatRupiah(info_komisi.rate_per_jamaah)} x {pax} jamaah
              </p>
            )}
            <p className="jd-muted">
              {!isClosing
                ? 'Komisi tercatat saat jamaah membayar DP (closing).'
                : komisiState.tone === 'ok'
                ? 'Jamaah sudah lunas. Komisi ini sudah bisa Anda tarik.'
                : 'Jamaah sudah membayar DP. Komisi bisa ditarik setelah admin menandai jamaah lunas.'}
            </p>
          </section>
        )}

        {/* Status and its history in one panel. */}
        <section className="jd-panel" aria-labelledby="jd-status">
          <div className="jd-panel__head">
            <h2 id="jd-status" className="jd-panel__title">Status</h2>
            {!isClosing && !isReadOnly ? (
              <button type="button" onClick={handleOpenStatusModal} className="jd-btn jd-btn--sm">
                Ubah status
              </button>
            ) : (
              <span className="jd-lock">
                <Lock size={14} aria-hidden="true" />
                {isClosing ? 'Final' : 'Terkunci'}
              </span>
            )}
          </div>
          <p className={`jd-status jd-status--${prospect.status} jd-status--lg`}>{statusText}</p>
          <p className="jd-muted">
            {isAnonymized
              ? 'Data pribadi jamaah ini sudah dihapus atas permintaannya (UU PDP). Riwayat dan komisi tetap tersimpan.'
              : travelSuspended
              ? 'Layanan travel sedang ditangguhkan. Status dan catatan bisa diubah lagi setelah travel memperpanjang langganan.'
              : isClosing
              ? 'Status Closing sudah final.'
              : 'Status Closing ditetapkan admin travel setelah verifikasi pembayaran.'}
          </p>
          {status_history.length > 0 && (
            <ol className="jd-history">
              {status_history.map((hist) => (
                <li key={hist.id} className="jd-history__item">
                  <span className="jd-history__what">{STATUS_LABEL[hist.new_status] || hist.new_status}</span>
                  <span className="jd-muted">
                    {formatDateTime(hist.changed_at)} · {hist.changed_by_type === 'agent' ? 'oleh Anda' : 'oleh admin travel'}
                    {hist.lost_reason && ` · ${hist.lost_reason}`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Notes */}
        <section className="jd-panel" aria-labelledby="jd-catatan">
          <div className="jd-panel__head">
            <h2 id="jd-catatan" className="jd-panel__title">Catatan{notes.length > 0 ? ` (${notes.length})` : ''}</h2>
          </div>
          {!isReadOnly && (
            <form onSubmit={handleAddNote} className="jd-note-form">
              {noteError && (
                <p className="jd-error" role="alert">
                  {noteError}
                </p>
              )}
              <textarea
                rows={2}
                required
                aria-label="Catatan baru"
                placeholder="Tulis perkembangan jamaah ini"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                className="tw-field jd-note-form__input"
              />
              <button type="submit" disabled={noteSubmitting || !newNoteText.trim()} className="jd-btn jd-btn--sm jd-note-form__submit">
                {noteSubmitting ? 'Menyimpan...' : 'Simpan catatan'}
              </button>
            </form>
          )}
          {notes.length === 0 ? (
            isReadOnly && <p className="jd-muted">Belum ada catatan.</p>
          ) : (
            <ul className="jd-notes">
              {notes.map((note) => (
                <li key={note.id} className="jd-notes__item">
                  <p className="jd-notes__text">{note.note_text}</p>
                  <span className="jd-muted">
                    {note.author_type === 'agent' ? 'Anda' : 'Admin travel'} · {formatDateTime(note.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Contact actions stay at the bottom of the screen while scrolling. */}
      {!isAnonymized && (
        <div className="jd-actions">
          <a href={getWhatsAppUrl(prospect.phone, prospect.name)} target="_blank" rel="noopener noreferrer" className="jd-btn jd-btn--wa" onClick={() => logHabit('contact')}>
            <MessageCircle size={18} aria-hidden="true" />
            <span>Chat WhatsApp</span>
          </a>
          <Link href={`/agen/script-wa?prospect_id=${prospect.id}`} className="jd-btn jd-btn--soft">
            <MessageSquare size={18} aria-hidden="true" />
            <span>Script chat</span>
          </Link>
        </div>
      )}

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

    </MobileContainer>
  );
}
