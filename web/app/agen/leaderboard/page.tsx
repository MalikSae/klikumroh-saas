'use client';

// Agent leaderboard: active agents ranked by closed jamaah for a chosen period (this month, this year, all time).
// Tab page of the agent bottom navbar, so no back button. Brand color marks "your" position.
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw, Medal, Loader2, Crown, User } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentPage } from '../../../components/agent/AgentPage';
import { AgentPageHeader } from '../../../components/agent/AgentPageHeader';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import { CustomDropdown } from '../../../components/CustomDropdown';
import { HabitBadge } from '../../../components/HabitBadge';
import { hasRank, medalTier, myRankText, podiumEntries, podiumScreenOrder, rankCellText } from '../../../lib/leaderboardRank';
import './Leaderboard.css';

interface LeaderboardEntry {
  rank: number;
  name: string;
  total_jamaah_closing: number;
  is_me: boolean;
  photo_url?: string | null;
  /** Highest habit streak badge in days (7, 30, 100); 0 when none. */
  habit_badge?: number;
}

// Period options; keys match the API query parameter "period".
const PERIODS = [
  { key: 'bulan', label: 'Bulan ini', caption: 'bulan ini' },
  { key: 'tahun', label: 'Tahun ini', caption: 'tahun ini' },
  { key: 'semua', label: 'Semua', caption: 'sejak bergabung' },
] as const;
type PeriodKey = (typeof PERIODS)[number]['key'];

const PAGE_SIZE = 10;

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export default function AgenLeaderboardPage() {
  const router = useRouter();

  const [period, setPeriod] = useState<PeriodKey>('semua');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Infinite scroll: PAGE_SIZE rows more each time the end of the list comes into view.
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  // Only the latest request may fill the list (switching periods quickly).
  const requestSeq = useRef(0);

  const fetchLeaderboard = async (p: PeriodKey) => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }
    const seq = ++requestSeq.current;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/agent/leaderboard?period=${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('agent_token');
        router.push('/agen/login');
        return;
      }
      // Leaderboard is for active partners only; a pending/inactive agent sees their account status.
      if (res.status === 403) {
        router.push('/agen/status');
        return;
      }
      if (!res.ok) throw new Error('Gagal memuat data leaderboard');
      const data = await res.json();
      if (seq !== requestSeq.current) return;
      setLeaderboard(Array.isArray(data) ? data : []);
      setVisibleCount(PAGE_SIZE);
    } catch (err: unknown) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set when the response lands
    fetchLeaderboard(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const myEntry = leaderboard.find((item) => item.is_me);
  const periodInfo = PERIODS.find((p) => p.key === period) ?? PERIODS[2];
  const displayed = useMemo(() => leaderboard.slice(0, visibleCount), [leaderboard, visibleCount]);
  const hasMore = displayed.length < leaderboard.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, leaderboard.length));
  }, [leaderboard.length]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root: null, rootMargin: '300px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Tapping "Peringkat Anda" loads the list down to your row, scrolls to it and highlights it briefly.
  const [jumpPending, setJumpPending] = useState<boolean>(false);
  const [flashMe, setFlashMe] = useState<boolean>(false);
  const jumpToMe = () => {
    if (!myEntry) return;
    const index = leaderboard.indexOf(myEntry);
    setVisibleCount((prev) => Math.max(prev, Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE));
    setJumpPending(true);
  };
  useEffect(() => {
    if (!jumpPending) return;
    const row = document.getElementById('lb-row-me');
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runs once the row is rendered after the jump
    setJumpPending(false);
    setFlashMe(true);
    const t = setTimeout(() => setFlashMe(false), 1600);
    return () => clearTimeout(t);
  }, [jumpPending, visibleCount]);

  // Podium: first up to 3 agents that have a rank (ties keep their shared rank; rank 0 = no closing).
  const podium = useMemo(() => podiumScreenOrder(podiumEntries(leaderboard)), [leaderboard]);
  // Nobody closed in the period (no ranked agent), so a ranking means nothing yet.
  const allZero = leaderboard.length > 0 && podium.length === 0;
  const myIndex = myEntry ? leaderboard.indexOf(myEntry) : -1;

  return (
    <MobileContainer>
      <AgentPageHeader title="Leaderboard" />

      <AgentPage withTabBar>
        <div className="ag-shell-toolbar">
          <CustomDropdown
            name="period"
            className="lb-period"
            value={period}
            options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
            onChange={(e) => setPeriod(String(e.target.value) as PeriodKey)}
          />
        </div>
        {loading ? (
          <div className="lb-state">
            <Loader2 size={24} className="ag-shell-spin" aria-hidden="true" />
            <p className="lb-muted">Memuat peringkat...</p>
          </div>
        ) : error ? (
          <div className="lb-state">
            <AlertCircle size={28} aria-hidden="true" />
            <p className="lb-muted">{error}</p>
            <button type="button" className="lb-btn" onClick={() => fetchLeaderboard(period)}>
              <RefreshCw size={16} aria-hidden="true" />
              <span>Coba lagi</span>
            </button>
          </div>
        ) : leaderboard.length === 0 || allZero ? (
          <div className="lb-state">
            <Medal size={28} aria-hidden="true" />
            <h2 className="lb-title">Belum ada closing {periodInfo.caption}</h2>
            <p className="lb-muted">Peringkat muncul setelah ada jamaah closing dari link agen.</p>
          </div>
        ) : (
          <>
            {/* Gamified podium for the top 3 on the travel's brand color, then your own position.
                Tapping it jumps to your row in the list. */}
            {myEntry ? (
              <>
                <button
                  type="button"
                  className="lb-hero"
                  onClick={jumpToMe}
                  aria-label={`Peringkat Anda ${myRankText(myEntry.rank)} dari ${leaderboard.length} agen, ${myEntry.total_jamaah_closing} jamaah closing. Lihat di daftar`}
                >
                  <span className="lb-podium" aria-hidden="true">
                    {podium.map(({ entry: e, place }) => {
                      // Slot class follows the podium place (layout); the block shows the shared rank.
                      return (
                        <span key={place} className={`lb-podium__slot lb-podium__slot--${place}${e.is_me ? ' lb-podium__slot--me' : ''}`}>
                          {e.rank === 1 && <Crown size={22} className="lb-podium__crown" />}
                          <span className="lb-podium__avatar">
                            {e.photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element -- agent photo uploaded by the agent
                              <img src={e.photo_url} alt="" />
                            ) : (
                              <User size={22} aria-hidden="true" />
                            )}
                          </span>
                          <span className="lb-podium__name">{e.is_me ? 'Anda' : firstName(e.name)}</span>
                          <span className="lb-podium__score">{e.total_jamaah_closing} jamaah</span>
                          <span className="lb-podium__block">{e.rank}</span>
                        </span>
                      );
                    })}
                  </span>
                  <span className="lb-hero__me">
                    <span>
                      Peringkat Anda <strong>{myRankText(myEntry.rank)}</strong> dari {leaderboard.length} agen
                    </span>
                    <span>
                      <strong>{myEntry.total_jamaah_closing}</strong> jamaah
                    </span>
                  </span>
                </button>
            {/* Only needed when your row is not on the first page of the list. */}
                {myIndex >= PAGE_SIZE && (
                  <button type="button" className="lb-link" onClick={jumpToMe}>
                    Lihat posisi saya di daftar
                  </button>
                )}
              </>
            ) : (
              <p className="lb-muted">Jumlah jamaah closing {periodInfo.caption}</p>
            )}

            <ol className="lb-list">
              {displayed.map((item, index) => {
                // Ranks can repeat (ties) and the API sends no agent id: the list position is the stable key.
                const medal = medalTier(item.rank);
                return (
                <li
                  key={index}
                  id={item.is_me ? 'lb-row-me' : undefined}
                  className={`lb-row${item.is_me ? ' lb-row--me' : ''}${item.is_me && flashMe ? ' lb-row--flash' : ''}`}
                >
                  <span className={`lb-row__rank${medal ? ` lb-row__rank--${medal}` : ''}`}>
                    {medal ? (
                      <Medal size={20} aria-label={`Peringkat ${medal}`} />
                    ) : (
                      <span aria-label={hasRank(item.rank) ? `Peringkat ${item.rank}` : 'Belum closing'}>{rankCellText(item.rank)}</span>
                    )}
                  </span>
                  <span className="lb-row__name">
                    {item.name}
                    {!!item.habit_badge && <HabitBadge days={item.habit_badge} variant="icon" />}
                    {item.is_me && <span className="lb-row__you">Anda</span>}
                  </span>
                  <span className="lb-row__total">
                    <strong>{item.total_jamaah_closing}</strong> jamaah
                  </span>
                </li>
                );
              })}
            </ol>

            {hasMore && (
              <div ref={sentinelRef} className="lb-state lb-state--more">
                <Loader2 size={18} className="ag-shell-spin" aria-hidden="true" />
                <span className="lb-muted">
                  {displayed.length} dari {leaderboard.length} agen
                </span>
              </div>
            )}
          </>
        )}
      </AgentPage>

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
