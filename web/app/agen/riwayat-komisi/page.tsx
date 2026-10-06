'use client';

// Agent commission history, bank-statement style: one summary card (released / held / withdrawn), segmented
// filter, then transactions grouped by day as compact rows (in/out icon, title, status, amount).
// A one-task page reached from Beranda or Tarik saldo: back button, no bottom tab bar.
import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, ArrowDownToLine, ReceiptText, Search, X, AlertCircle, RefreshCw } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { summarizeCommissionHistory } from '../../../lib/commissionSummary';
import { jakartaDayKey, jakartaDayLabel, jakartaTimeLabel, jakartaDateLabel } from '../../../lib/jakartaTime';
import './RiwayatKomisi.css';

interface CommissionHistoryItem {
  id: number;
  source: string; // 'ledger' | 'payout'
  type: string; // 'direct' | 'override' | 'correction' | 'payout'
  description: string;
  amount: number;
  direction: string; // 'masuk' | 'keluar'
  status?: string; // 'pending' | 'approved' | 'rejected' | 'paid'
  held?: boolean; // ledger entry not withdrawable yet (jamaah belum lunas)
  rejection_reason?: string | null; // why a payout was rejected or cancelled by the travel admin
  created_at: string;
}

const FILTER_TABS = [
  { key: '', label: 'Semua' },
  { key: 'masuk', label: 'Masuk' },
  { key: 'keluar', label: 'Penarikan' },
];

// The search box appears once the list is long enough to need it.
const SEARCH_FROM = 10;

const formatRupiah = (val: number): string =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Math.abs(val));

// Times are labelled WIB, so days and clock times are all computed in Asia/Jakarta.
const dayKey = (iso: string) => jakartaDayKey(iso);
const dayLabel = (key: string) => jakartaDayLabel(key);
const timeLabel = (iso: string) => jakartaTimeLabel(iso);

// Status shown under the title: what the agent needs to know about this entry, in words.
const statusOf = (item: CommissionHistoryItem): { text: string; tone: 'ok' | 'wait' | 'muted' | 'info' } => {
  if (item.source === 'payout') {
    switch (item.status) {
      case 'pending':
        return { text: 'Diproses admin', tone: 'info' };
      case 'approved':
        return { text: 'Menunggu transfer', tone: 'info' };
      case 'paid':
        return { text: 'Sudah ditransfer', tone: 'ok' };
      case 'rejected':
        return { text: 'Ditolak', tone: 'muted' };
      default:
        return { text: '', tone: 'muted' };
    }
  }
  if (item.held) return { text: 'Tertahan', tone: 'wait' };
  if (item.type === 'override') return { text: 'Komisi tim · masuk saldo', tone: 'ok' };
  if (item.type === 'correction') return { text: 'Koreksi admin', tone: 'muted' };
  return { text: 'Masuk saldo', tone: 'ok' };
};

const typeLabel = (item: CommissionHistoryItem) => {
  if (item.type === 'payout') return 'Penarikan ke rekening';
  if (item.type === 'override') return 'Komisi tim (dari agen rekrutan)';
  if (item.type === 'correction') return 'Koreksi oleh admin';
  return 'Komisi jamaah';
};

const fullDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${jakartaDateLabel(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${timeLabel(iso)}`;
};

const splitDescription = (text: string): { title: string; extra: string } => {
  const m = /^Komisi (?:override )?dari (.+?)\s*\((\d+) jamaah\)\s*$/i.exec(text || '');
  return m ? { title: m[1], extra: `${m[2]} jamaah` } : { title: text, extra: '' };
};

export default function RiwayatKomisiPage() {
  const router = useRouter();
  const [items, setItems] = useState<CommissionHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [detail, setDetail] = useState<CommissionHistoryItem | null>(null);
  // Card deck order: the first key is the card in front.
  const [deck, setDeck] = useState<Array<'main' | 'wait' | 'done'>>(['main', 'wait', 'done']);
  const bringToFront = (key: 'main' | 'wait' | 'done') => setDeck((d) => [key, ...d.filter((k) => k !== key)]);

  // Card face: travel name as the issuer (current profile).
  const [travelName, setTravelName] = useState('');
  useEffect(() => {
    fetch('/api/public/tenant-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.name) setTravelName(json.name);
      })
      .catch(() => {});
  }, []);

  const loadHistory = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }
    try {
      const res = await fetch('/api/agent/commission-history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('agent_token');
        router.push('/agen/login');
        return;
      }
      if (res.status === 403) {
        router.push('/agen/status');
        return;
      }
      if (!res.ok) throw new Error('Gagal memuat riwayat komisi');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  const retry = () => {
    setLoading(true);
    setError(null);
    return loadHistory();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set when the response lands
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Released vs held commission, and what was withdrawn (rejected requests excluded).
  const summary = useMemo(() => summarizeCommissionHistory(items), [items]);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        // "Penarikan" lists withdrawal requests only; "Masuk" lists commission entries, corrections included.
        if (activeTab === 'masuk' && item.source !== 'ledger') return false;
        if (activeTab === 'keluar' && item.source !== 'payout') return false;
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return item.description?.toLowerCase().includes(q) || String(item.amount).includes(q);
      }),
    [items, activeTab, searchQuery]
  );

  // Newest first, grouped by day.
  const groups = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const map = new Map<string, CommissionHistoryItem[]>();
    sorted.forEach((item) => {
      const k = dayKey(item.created_at);
      map.set(k, [...(map.get(k) || []), item]);
    });
    return [...map.entries()];
  }, [filtered]);

  return (
    <MobileContainer>
      <header className="rk-header">
        <button type="button" className="rk-icon-btn" onClick={() => router.push('/agen/dashboard')} aria-label="Kembali ke beranda">
          <ArrowLeft size={20} />
        </button>
        <h1 className="rk-header__title">Riwayat komisi</h1>
        <button type="button" className="rk-icon-btn" onClick={() => router.push('/agen/tarik-saldo')} aria-label="Tarik saldo">
          <ArrowDownToLine size={20} />
        </button>
      </header>

      <div className="rk-page">
        {loading ? (
          <div className="rk-center" role="status">
            <span className="rk-spinner" aria-hidden="true" />
            <span>Memuat riwayat...</span>
          </div>
        ) : error ? (
          <div className="rk-center">
            <AlertCircle size={28} className="rk-center__icon" aria-hidden="true" />
            <p className="rk-title">Riwayat belum bisa dimuat</p>
            <p className="rk-muted">{error}</p>
            <button type="button" className="rk-btn" onClick={() => retry()}>
              <RefreshCw size={18} aria-hidden="true" />
              Coba lagi
            </button>
          </div>
        ) : (
          <>
            <section className="rk-summary" role="tablist" aria-label="Ringkasan komisi">
              {[
                { key: 'main' as const, label: 'Siap ditarik', value: summary.bisaDicairkan },
                { key: 'wait' as const, label: 'Tertahan', value: summary.tertahan },
                { key: 'done' as const, label: 'Sudah ditarik', value: summary.sudahCair },
              ].map((card) => {
                const pos = deck.indexOf(card.key);
                const front = pos === 0;
                return (
                  <button
                    key={card.key}
                    type="button"
                    className={`rk-stat rk-stat--${card.key} rk-stat--pos${pos}`}
                    role="tab"
                    aria-selected={front}
                    aria-label={`${card.label}: ${formatRupiah(card.value)}`}
                    onClick={() => bringToFront(card.key)}
                  >
                    {/* Title on the visible edge while the card is behind */}
                    <span className="rk-stat__edge" aria-hidden="true">
                      {card.label}
                    </span>
                    {/* Credit-card layout: issuer (travel) and icon on top, amount in the middle, holder below */}
                    <span className="rk-stat__issuer">{travelName || 'Komisi agen'}</span>
                    <span className="rk-stat__label">{card.label}</span>
                    <strong className={`rk-stat__value${formatRupiah(card.value).length > 14 ? ' rk-stat__value--long' : ''}`}>
                      {formatRupiah(card.value)}
                    </strong>
                    {/* Approved by the travel but not transferred yet: not counted as withdrawn. */}
                    {card.key === 'done' && summary.menungguTransfer > 0 && (
                      <span className="rk-stat__note">Menunggu transfer {formatRupiah(summary.menungguTransfer)}</span>
                    )}
                  </button>
                );
              })}
            </section>

            <div className="rk-tabs" role="tablist" aria-label="Jenis transaksi">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`rk-tab${activeTab === tab.key ? ' rk-tab--on' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {items.length >= SEARCH_FROM && (
              <div className="rk-search">
                <Search size={18} className="rk-search__icon" aria-hidden="true" />
                <input
                  type="text"
                  className="tw-field rk-search__input"
                  placeholder="Cari nama jamaah atau nominal"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Cari transaksi"
                />
                {searchQuery && (
                  <button type="button" className="rk-search__clear" onClick={() => setSearchQuery('')} aria-label="Hapus pencarian">
                    <X size={16} />
                  </button>
                )}
              </div>
            )}

            {groups.length === 0 ? (
              <div className="rk-center rk-center--empty">
                <ReceiptText size={32} className="rk-muted-icon" aria-hidden="true" />
                <p className="rk-title">
                  {searchQuery ? 'Tidak ada yang cocok' : activeTab === 'keluar' ? 'Belum ada penarikan' : 'Belum ada komisi'}
                </p>
                <p className="rk-muted">
                  {searchQuery
                    ? `Tidak ada transaksi yang cocok dengan "${searchQuery}".`
                    : 'Komisi tercatat di sini setelah calon jamaah dari link Anda closing.'}
                </p>
              </div>
            ) : (
              groups.map(([key, list]) => (
                <section key={key || 'none'} className="rk-day" aria-label={dayLabel(key)}>
                  <h2 className="rk-day__label">{dayLabel(key)}</h2>
                  <ul className="rk-list">
                    {list.map((tx) => {
                      const payout = tx.source === 'payout';
                      // Money going out: a withdrawal, or a negative correction (not a withdrawal).
                      const keluar = payout || tx.amount < 0;
                      const rejected = payout && tx.status === 'rejected';
                      const st = statusOf(tx);
                      return (
                        <li key={`${tx.source}-${tx.id}`}>
                          <button type="button" className="rk-row" onClick={() => setDetail(tx)}>
                          <span className={`rk-row__icon${keluar ? ' rk-row__icon--out' : ''}`} aria-hidden="true">
                            {keluar ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                          </span>
                          <span className="rk-row__text">
                            <span className="rk-row__title">{payout ? 'Penarikan ke rekening' : splitDescription(tx.description).title}</span>
                            <span className="rk-row__meta">
                              {/* Second line: jamaah count (or time) then the status; a withdrawal shows its status only. Full time is in the detail. */}
                              {!payout && <span>{splitDescription(tx.description).extra || timeLabel(tx.created_at)}</span>}
                              {st.text && <span className={`rk-status rk-status--${st.tone}`}>{st.text}</span>}
                            </span>
                          </span>
                          <span
                            className={`rk-row__amount${keluar ? '' : ' rk-row__amount--in'}${rejected ? ' rk-row__amount--void' : ''}`}
                          >
                            {keluar ? '−' : '+'}
                            {formatRupiah(tx.amount)}
                          </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </div>

      {detail && (
        <div className="rk-sheet" role="presentation" onClick={() => setDetail(null)}>
          <div className="rk-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="rk-sheet-title" onClick={(e) => e.stopPropagation()}>
            <span className="rk-sheet__grip" aria-hidden="true" />
            <p className="rk-muted">{typeLabel(detail)}</p>
            <p
              id="rk-sheet-title"
              className={`rk-sheet__amount${detail.source === 'payout' || detail.amount < 0 ? '' : ' rk-row__amount--in'}${
                detail.source === 'payout' && detail.status === 'rejected' ? ' rk-row__amount--void' : ''
              }`}
            >
              {detail.source === 'payout' || detail.amount < 0 ? '−' : '+'}
              {formatRupiah(detail.amount)}
            </p>
            <dl className="rk-sheet__list">
              <div>
                <dt>Keterangan</dt>
                <dd>{detail.source === 'payout' ? 'Penarikan saldo ke rekening Anda' : detail.description}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd className={`rk-status rk-status--${statusOf(detail).tone}`}>{statusOf(detail).text || '-'}</dd>
              </div>
              {detail.source === 'payout' && detail.status === 'rejected' && detail.rejection_reason?.trim() && (
                <div>
                  <dt>Alasan</dt>
                  <dd>{detail.rejection_reason.trim()}</dd>
                </div>
              )}
              <div>
                <dt>Waktu</dt>
                <dd>{fullDateTime(detail.created_at)}</dd>
              </div>
            </dl>
            <button type="button" className="rk-btn rk-sheet__close" onClick={() => setDetail(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </MobileContainer>
  );
}
