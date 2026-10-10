'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Copy,
  Check,
  MousePointerClick,
  Share2,
  Trophy,
  ChevronRight,
  AlertCircle,
  Eye,
  EyeOff,
  MessageSquareShare,
  Users,
  Quote,
  Gift,
  Megaphone,
  MessageCircle,
  ArrowDownToLine,
  History,
  Bell,
  Flame,
  User,
  UserPlus,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import type { PublicPackage } from '../../../components/publicPackage';
import { AgentTravelSuspendedNotice } from '../../../components/AgentTravelSuspendedNotice';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import { AgentCard } from '../../../components/agent/AgentCard';
import { AgentCardHead } from '../../../components/agent/AgentCardHead';
import { AgentSheet } from '../../../components/agent/AgentSheet';
import { AgentStateError, AgentStateLoading } from '../../../components/agent/AgentState';
import { initAudioUnlock, playNotificationSound } from '../../../lib/notificationSound';
import { HABITS, fetchHabitSummary, habitHeadline, logHabit, type HabitSummary } from '../../../lib/agentHabits';
import { JAKARTA_TZ, jakartaDayKey } from '../../../lib/jakartaTime';
import { homeRank } from '../../../lib/agentRank';
import { copyToClipboard } from '../../../lib/clipboard';
import { packageShareText } from '../../../lib/packageShare';
import { recruitInviteText, shareInvite } from '../../../lib/recruitInvite';
import { AgentButton } from '../../../components/agent/AgentButton';
import { rupiah } from '../../../lib/money';
import './AgenDashboard.css';

interface AgentFunnelSummary {
  baru: number;
  diproses: number;
  closing: number;
}

interface LeaderboardPreview {
  // 0 or null when the agent has no rank (no closing yet).
  rank_saya?: number | null;
  total_agen?: number;
}

export interface AgentTargetView {
  id: number;
  title?: string | null;
  metric_type: 'closing_pax' | 'mitra_baru_count';
  metric_label: string;
  metric_value: number;
  progress_value: number;
  achieved: boolean;
  reward_description?: string | null;
  period_start: string;
  period_end: string;
  period_label: string;
}

interface AgentDashboardSummary {
  name: string;
  saldo_siap_cair: number;
  saldo_tertunda: number;
  // Komisi dari jamaah yang sudah DP (closing) tapi belum lunas: belum bisa dicairkan.
  saldo_tertahan?: number;
  // Commission from paid-off jamaah, before withdrawals: always has a value once the agent earned anything.
  total_komisi?: number;
  jamaah_tertunda_count: number;
  targets: AgentTargetView[];
  minimum_payout_amount: number | null;
  referral_link: string;
  // Agent sign-up page of the travel with this agent's code in ?ref= (invite a friend to become an agent).
  recruit_link?: string;
  // Highest commission per jamaah among the packages on sale (null when none has one): the invite message.
  max_commission_per_jamaah?: number | null;
  // Komisi Pembinaan rate of the travel; null/absent when the travel has it off (the invite card is hidden).
  pembinaan_percentage?: number | null;
  funnel_ringkasan: AgentFunnelSummary;
  leaderboard_preview?: LeaderboardPreview | null;
  photo_url?: string | null;
  total_clicks?: number;
  // The travel's subscription is suspended: the portal is read-only.
  travel_suspended?: boolean;
}

// Today's date in Indonesian, with the Hijri date (Umm al-Qura, computed in the browser; may differ by a day
// from the official Kemenag date), both for today in WIB like the rest of the portal. Falls back to the Gregorian date alone if the calendar is not available.
function todayLabel(): string {
  const now = new Date();
  const masehi = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: JAKARTA_TZ }).format(now);
  try {
    const hijri = new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric', timeZone: JAKARTA_TZ }).format(now);
    return `${masehi} · ${hijri}`;
  } catch {
    return masehi;
  }
}

interface TravelBrand {
  name?: string;
}

export default function AgenDashboardPage() {
  const router = useRouter();

  const [summary, setSummary] = useState<AgentDashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [recruitCopied, setRecruitCopied] = useState<boolean>(false);
  // Link the browser refused to copy (in-app browsers often block the clipboard): shown for a manual copy.
  const [copyFailedLink, setCopyFailedLink] = useState<string | null>(null);
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [travel, setTravel] = useState<TravelBrand | null>(null);
  const [packages, setPackages] = useState<PublicPackage[]>([]);
  // Package picked for "Syiarkan!" (bottom sheet with copy / WhatsApp).
  const [syiarPkg, setSyiarPkg] = useState<PublicPackage | null>(null);
  const [syiarCopied, setSyiarCopied] = useState(false);
  // Habit tracker card (today's 5 habits and the streak).
  const [habits, setHabits] = useState<HabitSummary | null>(null);

  useEffect(() => {
    fetchHabitSummary().then(setHabits);
  }, []);
  // Sharing from this page is a habit: log it, then refresh the card so the dot fills in.
  const logShare = () => {
    logHabit('share');
    setTimeout(() => fetchHabitSummary().then((h) => h && setHabits(h)), 800);
  };

  useEffect(() => {
    fetch('/api/public/packages')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const list: PublicPackage[] = Array.isArray(json) ? json : json?.packages || json?.items || [];
        setPackages(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/public/tenant-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json) setTravel({ name: json.name });
      })
      .catch(() => {});
  }, []);

  const initDashboard = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Check agent status via /api/agent/me
      const meRes = await fetch('/api/agent/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // 401: session expired. 404: the agent account no longer exists. Both need a fresh login.
      if (meRes.status === 401 || meRes.status === 404) {
        localStorage.removeItem('agent_token');
        router.push('/agen/login');
        return;
      }

      if (!meRes.ok) {
        throw new Error('Gagal memverifikasi status akun');
      }

      const meJson = await meRes.json();
      const agentData = meJson.agent || meJson.data?.agent || meJson;
      const status = agentData.status;

      // If status is not 'active', redirect to /agen/status
      if (status !== 'active') {
        router.push('/agen/status');
        return;
      }

      // Extract tenant info if present
      const tenantData = meJson.tenant || meJson.data?.tenant;
      const tName = meJson.tenant_name || agentData?.tenant_name || tenantData?.name;
      if (tName) {
        try {
          localStorage.setItem('klikumroh_agent_tenant_name', tName);
        } catch {}
      }
      if (agentData?.name) {
        try {
          localStorage.setItem('klikumroh_agent_name', agentData.name);
        } catch {}
      }

      // 2. Fetch dashboard summary
      const sumRes = await fetch('/api/agent/dashboard-summary', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (sumRes.status === 403) {
        // Not active
        router.push('/agen/status');
        return;
      }

      if (!sumRes.ok) {
        throw new Error('Gagal memuat ringkasan dasbor agen');
      }

      const sumJson = await sumRes.json();
      const summaryData = sumJson.data || sumJson;
      setSummary({
        ...summaryData,
        photo_url: summaryData.photo_url ?? agentData?.photo_url ?? null,
      });

      // 3. Fetch unread notifications count
      try {
        const notifRes = await fetch('/api/agent/notifications?limit=1', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (notifRes.ok) {
          const notifJson = await notifRes.json();
          setUnreadCount(notifJson.unread_count || 0);
        }
      } catch {
        // Silently continue
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat dasbor');
    } finally {
      setLoading(false);
    }
  };

  const pollAgentNotifications = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) return;

    try {
      const notifRes = await fetch('/api/agent/notifications?limit=5', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (notifRes.ok) {
        const notifJson = await notifRes.json();
        const unread = notifJson.unread_count || 0;
        const notifs = notifJson.notifications || [];
        const latestId = notifs.length > 0 ? notifs[0].id : null;

        setUnreadCount(unread);

        const savedIdStr = sessionStorage.getItem('klikumroh_agent_last_notif_id');
        const savedId = savedIdStr ? parseInt(savedIdStr, 10) : null;

        if (savedId !== null && latestId !== null && latestId > savedId) {
          sessionStorage.setItem('klikumroh_agent_last_notif_id', String(latestId));
          playNotificationSound();
        } else if (savedId === null && latestId !== null) {
          sessionStorage.setItem('klikumroh_agent_last_notif_id', String(latestId));
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set when the response lands
    initDashboard();
    const cleanupAudio = initAudioUnlock();

    // Polling setiap 30 detik untuk efisiensi server dan responsif saat tab aktif
    const timer = setInterval(pollAgentNotifications, 30000);

    const handleVis = () => {
      if (document.visibilityState === 'visible') {
        pollAgentNotifications();
      }
    };
    const handleFocus = () => {
      pollAgentNotifications();
    };

    document.addEventListener('visibilitychange', handleVis);
    window.addEventListener('focus', handleFocus);

    return () => {
      cleanupAudio();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVis);
      window.removeEventListener('focus', handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 'Tersalin' and the share habit only count once the link is really on the clipboard.
  const handleCopyLink = async () => {
    if (!summary?.referral_link) return;
    const link = summary.referral_link;
    if (!(await copyToClipboard(link))) {
      setCopyFailedLink(link);
      return;
    }
    setCopyFailedLink(null);
    logShare();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Invitation link for a friend or relative to register as an agent under this agent. Not logged as a share
  // habit: that habit counts sharing a package link with prospects.
  const handleInvite = async () => {
    if (!summary?.recruit_link) return;
    const link = summary.recruit_link;
    // The wording lives in lib/recruitInvite.ts (shared with the "Agen binaan saya" page).
    const result = await shareInvite(
      recruitInviteText({ travelName: travel?.name, maxCommission: summary.max_commission_per_jamaah, link })
    );
    if (result === 'failed') {
      setCopyFailedLink(link);
      return;
    }
    setCopyFailedLink(null);
    if (result === 'copied') {
      setRecruitCopied(true);
      setTimeout(() => setRecruitCopied(false), 2000);
    }
  };

  // The travel's Komisi Pembinaan rate as shown on the card ("10", "7,5").
  const pembinaanLabel = summary?.pembinaan_percentage
    ? summary.pembinaan_percentage.toLocaleString('id-ID', { maximumFractionDigits: 2 })
    : '';

  // Link to one package through the agent's referral route (counts the click, then opens the package).
  const packageLink = (pkg: PublicPackage): string =>
    summary?.referral_link ? `${summary.referral_link}?to=${encodeURIComponent(`/paket/${pkg.id}`)}` : '';

  const copyPackageLink = async (pkg: PublicPackage) => {
    const link = packageLink(pkg);
    if (!link) return;
    if (!(await copyToClipboard(link))) {
      setCopyFailedLink(link);
      return;
    }
    setCopyFailedLink(null);
    logShare();
    setSyiarCopied(true);
    setTimeout(() => {
      setSyiarCopied(false);
      setSyiarPkg(null);
    }, 1200);
  };

  const packageShareUrl = (pkg: PublicPackage): string => {
    const link = packageLink(pkg);
    if (!link) return '#';
    return `https://wa.me/?text=${encodeURIComponent(packageShareText({ ...pkg, travel_name: travel?.name }, link))}`;
  };

  const getWhatsAppShareUrl = (): string => {
    if (!summary?.referral_link) return '#';
    // Wording approved by the founder (10 Okt 2026, option D): neutral, the same family as the package caption
    // ("Saatnya wujudkan niat umroh bersama ..."). No greeting and no "resmi dan terpercaya" claim.
    const text = [
      `Saatnya wujudkan niat umroh bersama ${travel?.name || 'travel umroh'}. Lihat jadwal, fasilitas, dan cara daftarnya di sini:`,
      summary.referral_link,
    ].join('\n');
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };


  if (loading) {
    return (
      <MobileContainer>
        <AgentHeader travel={travel} />
        <AgentStateLoading text="Memuat beranda agen..." />
        <AgentBottomNavbar />
      </MobileContainer>
    );
  }

  if (error || !summary) {
    return (
      <MobileContainer>
        <AgentHeader travel={travel} />
        <AgentStateError title="Beranda belum bisa dimuat" text={error || 'Coba lagi sebentar.'} onRetry={() => initDashboard()} />
        <AgentBottomNavbar />
      </MobileContainer>
    );
  }

  const money = (v: number | null | undefined) => (showBalance ? rupiah(v) : 'Rp ••••••');

  // Only targets whose period is still running (an "active" target whose end date passed is history).
  // Today in WIB, like the period dates and departure dates it is compared with.
  const today = jakartaDayKey(new Date());
  const targets = (summary.targets || []).filter((t) => !t.period_end || t.period_end.slice(0, 10) >= today);

  const sharePackages = packages
    .filter((p) => !p.departure_date || p.departure_date.slice(0, 10) >= today)
    .sort((x, y) => (x.departure_date || '9999').localeCompare(y.departure_date || '9999'))
    .slice(0, 6);

  // No rank before the agent's first closing (the order would only follow account age).
  const rank = homeRank(summary.leaderboard_preview?.rank_saya, summary.funnel_ringkasan?.closing);

  const menu = [
    // Stays enabled while the travel is suspended: payout requests are still allowed then (see the notice above).
    { key: 'tarik', icon: <ArrowDownToLine size={22} aria-hidden="true" />, label: 'Tarik saldo', href: '/agen/tarik-saldo' },
    { key: 'riwayat', icon: <History size={22} aria-hidden="true" />, label: 'Riwayat', href: '/agen/riwayat-komisi' },
    { key: 'salin', icon: copied ? <Check size={22} aria-hidden="true" /> : <Copy size={22} aria-hidden="true" />, label: copied ? 'Tersalin' : 'Salin link', onClick: handleCopyLink },
    { key: 'wa', icon: <Share2 size={22} aria-hidden="true" />, label: 'Bagikan', external: getWhatsAppShareUrl() },
    { key: 'script', tone: 'green', icon: <MessageSquareShare size={22} aria-hidden="true" />, label: 'Script WA', href: '/agen/script-wa' },
    { key: 'sumber', tone: 'blue', icon: <Users size={22} aria-hidden="true" />, label: '99 sumber', href: '/agen/sumber-jamaah' },
    { key: 'caption', tone: 'indigo', icon: <Quote size={22} aria-hidden="true" />, label: 'Caption', href: '/agen/bank-caption' },
    // Labels stay on one line: the rank only fits up to #9 ("Peringkat #12" would overflow the tile).
    {
      key: 'peringkat',
      tone: 'amber',
      icon: <Trophy size={22} aria-hidden="true" />,
      label: rank !== null ? `Peringkat #${rank}` : 'Peringkat',
      href: '/agen/leaderboard',
    },
  ];

  return (
    <MobileContainer>
      <AgentHeader brand travel={travel} unreadCount={unreadCount} onBell={() => router.push('/agen/notifikasi')} />

      {summary.travel_suspended && <AgentTravelSuspendedNotice />}

      <div className="ag-home">
        {/* Colored band: greeting */}
        <div className="ag-band">
          <Link href="/agen/profil" className="ag-greet">
            <span className="ag-greet__photo" aria-hidden="true">
              {summary.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- agent photo uploaded by the agent
                <img src={summary.photo_url} alt="" />
              ) : (
                <User size={24} aria-hidden="true" />
              )}
            </span>
            <span className="ag-greet__text">
              <span className="ag-greet__hi">Assalamu&apos;alaikum,</span>
              <span className="ag-greet__name">{summary.name}</span>
              <span className="ag-greet__date">{todayLabel()}</span>
            </span>
            <ChevronRight size={20} className="ag-greet__chev" aria-hidden="true" />
          </Link>
        </div>

        {/* Balance card overlapping the band */}
        <AgentCard as="section" className="ag-balance" data-card-spacing="tight" aria-labelledby="ag-komisi">
          <div className="ag-balance__label">
            <h2 id="ag-komisi">Total komisi diraih</h2>
            <button
              type="button"
              className="ag-icon-btn"
              onClick={() => setShowBalance(!showBalance)}
              aria-label={showBalance ? 'Sembunyikan saldo' : 'Tampilkan saldo'}
            >
              {showBalance ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
          <p className="ag-balance__amount">{money(summary.total_komisi ?? 0)}</p>
          <div className="ag-balance__foot">
            <span>
              Potensi <b>{money(summary.saldo_tertunda)}</b> · {summary.jamaah_tertunda_count} jamaah
              {(summary.saldo_tertahan || 0) > 0 && <> · tertahan {money(summary.saldo_tertahan)}</>}
            </span>
          </div>
        </AgentCard>

        {/* Menu grid */}
        <AgentCard as="nav" className="ag-menu" aria-label="Menu agen">
          {menu.map((m) => {
            const inner = (
              <>
                <span className={`ag-menu__icon${m.tone ? ` ag-menu__icon--${m.tone}` : ''}`}>{m.icon}</span>
                <span className="ag-menu__label">{m.label}</span>
              </>
            );
            if (m.onClick) {
              return (
                <button key={m.key} type="button" className="ag-menu__item" onClick={m.onClick}>
                  {inner}
                </button>
              );
            }
            if (m.external) {
              return (
                // "Bagikan" opens wa.me: the click counts as a share (the page cannot see what happens in WhatsApp).
                // No link yet ('#') opens nothing, so it does not count.
                <a key={m.key} href={m.external} target="_blank" rel="noopener noreferrer" className="ag-menu__item" onClick={m.external !== '#' ? logShare : undefined}>
                  {inner}
                </a>
              );
            }
            if (!m.href) {
              return (
                <button key={m.key} type="button" className="ag-menu__item" disabled>
                  {inner}
                </button>
              );
            }
            return (
              <Link key={m.key} href={m.href} className="ag-menu__item">
                {inner}
              </Link>
            );
          })}
        </AgentCard>

        {/* Habit tracker: today's progress and streak; opens the full checklist. */}
        {habits && (
          <AgentCard href="/agen/kebiasaan" className="ag-habit" aria-label={`${habitHeadline(habits).title}. ${habits.done_today.length} dari ${habits.total} langkah, streak ${habits.streak} hari`}>
            {/* Text takes the full width (title stays on one line); the five dots sit under it. */}
            <span className="ag-habit__text">
              <span className="ag-habit__title">{habitHeadline(habits).title}</span>
              <span className="ag-muted">{habitHeadline(habits).sub}</span>
              <span className="ag-habit__dots" aria-hidden="true">
                {HABITS.map((h) => (
                  <span key={h.key} className={`ag-habit__dot${habits.done_today.includes(h.key) ? ' ag-habit__dot--on' : ''}`} />
                ))}
              </span>
            </span>
            <span className="ag-habit__streak">
              <Flame size={18} aria-hidden="true" />
              {habits.streak}
            </span>
          </AgentCard>
        )}

        {/* Referral link */}
        <AgentCard as="section" aria-labelledby="ag-link">
          <AgentCardHead
            id="ag-link"
            title="Link referral"
            aside={
              <>
                <MousePointerClick size={16} aria-hidden="true" />
                {summary.total_clicks ?? 0} klik
              </>
            }
          />
          <div className="ag-linkbox">
            <span className="ag-linkbox__url">{summary.referral_link}</span>
            <AgentButton
              variant="primary"
              className="ag-linkbox__copy"
              onClick={handleCopyLink}
              aria-label={copied ? 'Link tersalin' : 'Salin link referral'}
            >
              {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
              {copied ? 'Tersalin' : 'Salin'}
            </AgentButton>
          </div>
          {copyFailedLink === summary.referral_link && <CopyFailedNote link={copyFailedLink} />}
        </AgentCard>

        {/* Invite a friend or relative to become an agent */}
        {summary.recruit_link && !summary.travel_suspended && !!summary.pembinaan_percentage && (
          <AgentCard as="section" variant="tint" className="ag-recruit" aria-labelledby="ag-recruit">
            <AgentCardHead id="ag-recruit" icon={<UserPlus size={18} aria-hidden="true" />} title="Bina agen, tambah penghasilan" />
            <p className="ag-recruit__text">
              Dapat {pembinaanLabel}% Komisi Pembinaan dari setiap closing agen binaan Anda.
            </p>
            <div className="ag-recruit__actions">
              <AgentButton variant="primary" className="ag-recruit__action" onClick={handleInvite}>
                {recruitCopied ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}
                {recruitCopied ? 'Tersalin' : 'Ajak agen'}
              </AgentButton>
              <AgentButton href="/agen/jaringan" className="ag-recruit__action">
                Lihat agen binaan
              </AgentButton>
            </div>
            {copyFailedLink === summary.recruit_link && <CopyFailedNote link={copyFailedLink} />}
          </AgentCard>
        )}

        {/* Packages to share */}
        {sharePackages.length > 0 && (
          <AgentCard as="section" variant="scroll" className="ag-share" aria-labelledby="ag-share">
            {/* The full public catalog; sharing from a package page there uses the agent's referral link. */}
            <AgentCardHead id="ag-share" title="Paket untuk dibagikan" link={{ href: '/paket', label: 'Lihat semua' }} />
            <ul className="ag-share__list">
              {sharePackages.map((pkg) => {
                const photo = [...(pkg.photos || [])].sort((x, y) => x.sort_order - y.sort_order)[0];
                return (
                  <li key={pkg.id} className="ag-share__item">
                    {/* Photo, name and details open the package page (plain link, not the referral route:
                        the agent's own visit is not counted as a click). */}
                    <Link href={`/paket/${pkg.id}`} className="ag-share__link">
                      <span className="ag-share__media">
                        {photo && (
                          // eslint-disable-next-line @next/next/no-img-element -- package photo uploaded by the travel
                          <img src={photo.file_path} alt="" loading="lazy" />
                        )}
                      </span>
                      <span className="ag-share__text">
                        <span className="ag-share__name">{pkg.name}</span>
                      <span className="ag-muted">
                        {pkg.departure_date
                          ? new Date(pkg.departure_date.slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'Jadwal menyusul'}
                        {pkg.price ? ` · ${rupiah(pkg.price)}` : ''}
                      </span>
                      </span>
                    </Link>
                    <AgentButton block className="ag-share__btn" onClick={() => { setCopyFailedLink(null); setSyiarPkg(pkg); }}>
                      <Megaphone size={16} aria-hidden="true" />
                      Syiarkan!
                    </AgentButton>
                  </li>
                );
              })}
            </ul>
          </AgentCard>
        )}

        {/* Prospect pipeline */}
        <AgentCard as="section" aria-labelledby="ag-jamaah">
          <AgentCardHead id="ag-jamaah" title="Calon jamaah" link={{ href: '/agen/prospek', label: 'Lihat semua' }} />
          <dl className="ag-stats">
            <div className="ag-stat ag-stat--new">
              <dt>Baru</dt>
              <dd>{summary.funnel_ringkasan.baru}</dd>
            </div>
            <div className="ag-stat ag-stat--progress">
              <dt>Diproses</dt>
              <dd>{summary.funnel_ringkasan.diproses}</dd>
            </div>
            <div className="ag-stat ag-stat--closing">
              <dt>Closing</dt>
              <dd>{summary.funnel_ringkasan.closing}</dd>
            </div>
          </dl>
        </AgentCard>

        {/* Running targets */}
        {targets.length > 0 && (
          <AgentCard as="section" aria-labelledby="ag-target">
            <AgentCardHead id="ag-target" title="Target dan reward" />
            <ul className="ag-targets">
              {targets.map((t) => {
                const pct = t.metric_value > 0 ? Math.min(100, Math.max(0, Math.round((t.progress_value / t.metric_value) * 100))) : 0;
                const remaining = Math.max(0, t.metric_value - t.progress_value);
                const unit = t.metric_type === 'closing_pax' ? 'jamaah' : 'mitra';
                return (
                  <li key={t.id} className="ag-target">
                    <div className="ag-target__head">
                      <span className="ag-target__name">{t.title || t.metric_label}</span>
                      <span className="ag-target__count">
                        {t.progress_value}/{t.metric_value}
                      </span>
                    </div>
                    <div
                      className="ag-progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                      aria-label={`${t.title || t.metric_label}: ${pct}%`}
                    >
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <p className="ag-muted">
                      {t.period_label} · {t.achieved ? 'Target tercapai' : `${remaining} ${unit} lagi`}
                    </p>
                    {t.reward_description && (
                      <p className="ag-target__reward">
                        <Gift size={16} aria-hidden="true" />
                        {t.reward_description}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </AgentCard>
        )}

      </div>

      {syiarPkg && (
        <AgentSheet title="Syiarkan paket ini" onClose={() => setSyiarPkg(null)}>
            <p className="ag-muted">{syiarPkg.name}</p>
            <div className="ag-sheet__options">
              <button type="button" className="ag-sheet__option" onClick={() => copyPackageLink(syiarPkg)}>
                <span className="ag-sheet__icon">{syiarCopied ? <Check size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}</span>
                <span className="ag-sheet__text">
                  <span className="ag-sheet__label">{syiarCopied ? 'Link tersalin' : 'Salin link'}</span>
                  <span className="ag-muted">Tempel di grup, status, atau media sosial</span>
                </span>
              </button>
              <a
                href={packageShareUrl(syiarPkg)}
                target="_blank"
                rel="noopener noreferrer"
                className="ag-sheet__option"
                // A wa.me link click counts as a share: the page cannot see whether WhatsApp then sends the
                // message, and the link opens WhatsApp with the message ready (accepted trade-off).
                onClick={() => {
                  logShare();
                  setSyiarPkg(null);
                }}
              >
                <span className="ag-sheet__icon ag-sheet__icon--wa">
                  <MessageCircle size={20} aria-hidden="true" />
                </span>
                <span className="ag-sheet__text">
                  <span className="ag-sheet__label">Bagikan ke WhatsApp</span>
                  <span className="ag-muted">Pesan siap kirim berisi link Anda</span>
                </span>
              </a>
            </div>
            {copyFailedLink && copyFailedLink === packageLink(syiarPkg) && <CopyFailedNote link={copyFailedLink} />}
        </AgentSheet>
      )}

      <AgentBottomNavbar />
    </MobileContainer>
  );
}

// Shown when the browser refused to copy: the link in full, selectable, so the agent can copy it by hand.
const CopyFailedNote: React.FC<{ link: string }> = ({ link }) => (
  <p className="ag-copy-failed" role="alert">
    <AlertCircle size={16} aria-hidden="true" />
    <span>
      Browser ini menolak menyalin otomatis. Tekan lama link berikut untuk menyalin manual:
      <span className="ag-copy-failed__link">{link}</span>
    </span>
  </p>
);

// Portal header: 'Portal Agen' with the travel's name in small text below; notification bell on the right.
const AgentHeader: React.FC<{ brand?: boolean; travel?: TravelBrand | null; unreadCount?: number; onBell?: () => void }> = ({
  brand,
  travel,
  unreadCount = 0,
  onBell,
}) => (
  <header className={`ag-header${brand ? ' ag-header--brand' : ''}`}>
    <div className="ag-header__brand">
      <h1 className="ag-header__title">Portal Agen</h1>
      {travel?.name && <span className="ag-header__travel">{travel.name}</span>}
    </div>
    {onBell && (
      <button type="button" className="ag-icon-btn ag-header__bell" aria-label="Notifikasi" onClick={onBell}>
        <Bell size={20} />
        {unreadCount > 0 && <span className="ag-header__dot" aria-hidden="true" />}
      </button>
    )}
  </header>
);
