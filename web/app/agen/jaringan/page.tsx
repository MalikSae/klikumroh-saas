'use client';

// "Agen binaan saya": the agents this agent recruited directly (one level, no tree). Answers what a coach
// asks: how much Komisi Pembinaan came in, how many agents are registered or still in process, who they are,
// when they joined, what they achieved, how to reach them. Search, status filter and server-side pagination
// (a coach can have hundreds). Opened from the recruit card on the home page and from the profile page.
// The upline is the signed-in agent: the API takes no agent id.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, User, UserPlus } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import { AgentPage } from '../../../components/agent/AgentPage';
import { AgentPageHeader } from '../../../components/agent/AgentPageHeader';
import { AgentList, AgentListRow } from '../../../components/agent/AgentList';
import { AgentSearch } from '../../../components/agent/AgentSearch';
import { AgentChips } from '../../../components/agent/AgentChips';
import { AgentPager } from '../../../components/agent/AgentPager';
import { AgentStateEmpty, AgentStateError, AgentStateLoading } from '../../../components/agent/AgentState';
import { StatusLabel, type StatusTone } from '../../../components/agent/StatusLabel';
import { readJsonSafe, apiErrorMessage } from '../../../lib/safeJson';
import { jakartaDateLabel } from '../../../lib/jakartaTime';
import { recruitInviteText, shareInvite } from '../../../lib/recruitInvite';
import { rupiah, rupiahJt } from '../../../lib/money';
import './Jaringan.css';

type MemberStatus = 'pending' | 'active' | 'inactive';
type Filter = 'all' | 'active' | 'inactive' | 'pending';

interface NetworkMember {
  id: number;
  name: string;
  photo_url: string | null;
  status: MemberStatus;
  joined_at: string;
  phone: string | null;
  domisili: string | null;
  prospect_count: number;
  closing_jamaah: number;
  override_released: number;
  override_held: number;
}

interface Network {
  override_enabled: boolean;
  summary: {
    registered: number;
    active: number;
    inactive: number;
    pending: number;
    override_released: number;
    override_held: number;
  };
  members: NetworkMember[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

interface HomeSummary {
  recruit_link?: string;
  tenant_name?: string;
  max_commission_per_jamaah?: number | null;
}

const STATUS_LABEL: Record<MemberStatus, string> = {
  active: 'Aktif',
  inactive: 'Nonaktif',
  pending: 'Diproses',
};

const MEMBER_TONE: Record<MemberStatus, StatusTone> = {
  active: 'success',
  pending: 'wait',
  inactive: 'muted',
};

const PER_PAGE = 10;

// 62812... is stored; people read 0812-3456-7890.
const formatPhone = (phone: string): string => {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('62')) d = '0' + d.slice(2);
  return d.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
};

// wa.me needs the international form without "+": 0812... -> 62812...
const waLink = (phone: string): string => {
  const d = phone.replace(/\D/g, '');
  return `https://wa.me/${d.startsWith('0') ? '62' + d.slice(1) : d}`;
};

export default function AgenJaringanPage() {
  const router = useRouter();
  const [network, setNetwork] = useState<Network | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  const [home, setHome] = useState<HomeSummary | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Only the latest request may fill the list (typing or switching the filter quickly).
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }
    const mine = ++seq.current;
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
      if (filter !== 'all') qs.set('status', filter);
      if (debounced) qs.set('q', debounced);
      const res = await fetch(`/api/agent/network?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (mine !== seq.current) return;
      if (res.status === 401) {
        localStorage.removeItem('agent_token');
        router.push('/agen/login');
        return;
      }
      // Only active partners see their agents; a pending/inactive agent sees the account status instead.
      if (res.status === 403) {
        router.push('/agen/status');
        return;
      }
      const json = await readJsonSafe<Network>(res);
      if (!res.ok || !json) throw new Error(apiErrorMessage(res.status, json, 'Agen binaan belum bisa dimuat'));
      if (mine !== seq.current) return;
      setNetwork({ ...json, members: Array.isArray(json.members) ? json.members : [] });
    } catch (err: unknown) {
      if (mine !== seq.current) return;
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [router, page, filter, debounced]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set when the response lands
    load();
  }, [load]);

  // The invite text needs the recruit link, the travel name and the highest commission: the home summary.
  useEffect(() => {
    const token = localStorage.getItem('agent_token');
    if (!token) return;
    let alive = true;
    fetch('/api/agent/dashboard-summary', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setHome(d as HomeSummary);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push('/agen/dashboard');
  };

  // One button: the phone's share sheet (WhatsApp, copy, ...) when there is one, otherwise copy the message.
  const invite = async () => {
    if (!home?.recruit_link) return;
    const result = await shareInvite(
      recruitInviteText({
        travelName: home.tenant_name,
        maxCommission: home.max_commission_per_jamaah,
        link: home.recruit_link,
      })
    );
    if (result === 'copied') {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }
  };

  const changeFilter = (f: Filter) => {
    setFilter(f);
    setPage(1);
  };
  const changeSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  const s = network?.summary;
  const everRecruited = !!s && s.registered + s.pending > 0;
  const chips: { key: Filter; label: string; count: number }[] = s
    ? [
        { key: 'all', label: 'Semua', count: s.registered + s.pending },
        { key: 'active', label: 'Aktif', count: s.active },
        { key: 'inactive', label: 'Nonaktif', count: s.inactive },
        { key: 'pending', label: 'Diproses', count: s.pending },
      ]
    : [];

  return (
    <MobileContainer>
      <AgentPageHeader title="Agen binaan saya" onBack={goBack} />

      <AgentPage withTabBar>
        {!network && loading ? (
          <AgentStateLoading text="Memuat agen binaan..." />
        ) : error && !network ? (
          <AgentStateError text={error} onRetry={() => load()} />
        ) : network && s && !everRecruited ? (
          <AgentStateEmpty
            icon={<UserPlus size={28} aria-hidden="true" />}
            title="Belum ada agen binaan"
            text="Agen yang mendaftar lewat ajakan Anda muncul di sini."
            action={{ label: inviteCopied ? 'Tersalin' : 'Ajak agen', onClick: invite, disabled: !home?.recruit_link }}
          />
        ) : network && s ? (
          <>
            {network.override_enabled && (
              <section className="jr-hero" aria-label="Komisi Pembinaan">
                <p className="jr-hero__label">Komisi Pembinaan</p>
                <p className="jr-hero__amount">{rupiah(s.override_released + s.override_held)}</p>
                <p className="jr-hero__split">
                  Masuk saldo {rupiahJt(s.override_released)} · Tertahan {rupiahJt(s.override_held)}
                </p>
              </section>
            )}

            <p className="jr-counts">
              <span>
                Terdaftar <strong>{s.registered}</strong>
                <span className="jr-muted-inline">
                  {' '}
                  ({s.active} aktif · {s.inactive} nonaktif)
                </span>
              </span>
              <span>
                Diproses <strong>{s.pending}</strong>
              </span>
            </p>

            <AgentSearch value={search} onChange={changeSearch} placeholder="Cari nama, nomor, atau kota" label="Cari agen binaan" maxLength={100} />

            <AgentChips label="Filter status" value={filter} items={chips} onChange={changeFilter} />

            {error && (
              <p className="jr-error" role="alert">
                {error}
              </p>
            )}

            {network.members.length === 0 ? (
              <AgentStateEmpty
                compact
                text="Tidak ada agen yang cocok."
                action={
                  filter !== 'all' || search
                    ? {
                        label: 'Tampilkan semua',
                        onClick: () => {
                          setSearch('');
                          changeFilter('all');
                        },
                      }
                    : undefined
                }
              />
            ) : (
              <AgentList busy={loading}>
                {network.members.map((m) => (
                  <AgentListRow
                    key={m.id}
                    lead={
                      <span className="jr-row__avatar" aria-hidden="true">
                        {m.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- agent photo uploaded by the agent
                          <img src={m.photo_url} alt="" />
                        ) : (
                          <User size={20} />
                        )}
                      </span>
                    }
                    title={m.name}
                  >
                      <span className="jr-row__line">
                        <StatusLabel tone={MEMBER_TONE[m.status]}>{STATUS_LABEL[m.status]}</StatusLabel>
                        {' · '}bergabung {jakartaDateLabel(m.joined_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span className="jr-row__line">
                        {m.domisili ? `${m.domisili} · ` : ''}
                        {m.phone ? (
                          <a className="jr-row__phone" href={waLink(m.phone)} target="_blank" rel="noopener noreferrer">
                            <MessageCircle size={14} aria-hidden="true" />
                            {formatPhone(m.phone)}
                          </a>
                        ) : (
                          'Nomor belum ada'
                        )}
                      </span>
                      {m.status !== 'pending' && (
                        <span className="jr-row__line jr-row__figures">
                          {m.closing_jamaah} pax closing · {m.prospect_count} prospek
                          {network.override_enabled && (
                            <>
                              {' · '}komisi Anda <strong>{rupiahJt(m.override_released + m.override_held)}</strong>
                            </>
                          )}
                        </span>
                      )}
                  </AgentListRow>
                ))}
              </AgentList>
            )}

            <AgentPager page={network.page} totalPages={network.total_pages} onChange={setPage} disabled={loading} />
          </>
        ) : null}
      </AgentPage>

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
