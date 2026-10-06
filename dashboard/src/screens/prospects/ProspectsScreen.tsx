// Prospek: tabbed list + detail drawer (approved prototype: dashboard/design/prototype.html, screen "Prospek").
// /prospects/:id opens the same list with the drawer on that prospect.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Banknote, Clock, Download, Handshake, Inbox, Percent, RotateCcw, SearchX, Users, Wallet } from 'lucide-react';
import {
  downloadProspectsCSV,
  fetchCommissionReleasePolicy,
  fetchDashboardAgents,
  cohortRate,
  fetchDashboardOverview,
  type DashboardOverviewData,
  fetchPackages,
  fetchProspectPage,
  fetchProspectSummary,
  departurePlanOptions,
  formatDeparturePlan,
  lostReasonCategoryLabel,
  type AgentItem,
  type FetchProspectsParams,
  type PackageItem,
  type ProspectItem,
  type ProspectStatusSummary,
} from '../../services/api';
import { formatDateWIB, formatTimeWIB } from '../../utils/datetime';
import { rememberProspectListQuery } from '../../utils/prospectListQuery';
import { clampedPage } from '../../utils/pagination';
import { awaitingPayoffAgentNote, lostReasonNote, type ReleasePolicy } from '../../utils/prospectTexts';
import {
  Banner,
  Button,
  CardTabs,
  Field,
  FilterMenu,
  ChannelTag,
  DataTable,
  EmptyState,
  KpiCard,
  Pagination,
  SearchField,
  Select,
  StatusPill,
  Tabs,
  Toolbar,
  channelOf,
  fmtNumber,
  fmtPercent,
  fmtRupiahShort,
} from '../../ui';
import { useFrame } from '../../app/AppFrame';
import { ProspectDrawer } from './ProspectDrawer';
import { compare, delta } from '../dashboard/kpiMath';
import './prospects.css';

const PAGE_SIZES = [25, 50, 100];
const DEBOUNCE_MS = 350;
type StatusTab = 'all' | 'baru' | 'dihubungi' | 'tertarik' | 'closing' | 'tidak_lanjut';

const agentLabel = (p: ProspectItem) => (p.agent_name && p.agent_name.trim() && p.agent_name !== '-' ? p.agent_name : null);

// Lost reason in the list: the category, plus the typed note when there is one (one line, full text on hover).
const LostReasonCell: React.FC<{ category?: string | null; reason?: string | null }> = ({ category, reason }) => {
  const label = lostReasonCategoryLabel(category);
  const note = label ? lostReasonNote(category, label, reason) : '';
  return (
    <>
      <span className="ku-muted ku-small">{label || reason}</span>
      {note && <span className="ku-muted ku-small pr-cell__note" title={note}>{note}</span>}
    </>
  );
};

export const ProspectsScreen: React.FC = () => {
  const navigate = useNavigate();
  const frame = useFrame();
  const { id } = useParams<{ id?: string }>();
  const openId = id ? Number(id) : null;
  const startEditing = window.location.pathname.endsWith('/edit');
  const [params, setParams] = useSearchParams();
  const get = (k: string, d: string) => params.get(k) || d;

  const [status, setStatus] = useState<StatusTab>(() => get('status', 'all') as StatusTab);
  const [source, setSource] = useState(() => get('source', 'all'));
  const [pkg, setPkg] = useState(() => get('package', 'all'));
  const [agent, setAgent] = useState(() => get('agent', 'all'));
  const [payoff, setPayoff] = useState(() => get('payoff', 'all'));
  const [departure, setDeparture] = useState(() => get('departure', 'all'));
  const [searchInput, setSearchInput] = useState(() => get('q', ''));
  const [search, setSearch] = useState(() => get('q', ''));
  const [page, setPage] = useState(() => Math.max(1, Number(get('page', '1')) || 1));
  const [pageSize, setPageSize] = useState(() => (PAGE_SIZES.includes(Number(get('size', '25'))) ? Number(get('size', '25')) : 25));

  const [rows, setRows] = useState<ProspectItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ProspectStatusSummary | null>(null);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const seq = useRef(0);
  // Commission release rule, so the DP banner does not call commissions "held" when they are paid at DP.
  const [releasePolicy, setReleasePolicy] = useState<ReleasePolicy | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCommissionReleasePolicy()
      .then((v) => { if (alive) setReleasePolicy(v); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // A search from the header (?q=) while this screen is open.
  useEffect(() => {
    const q = params.get('q') || '';
    // The URL keeps the trimmed text: compare trimmed, or a pause after "siti " would reset the box to
    // "siti" and the next word would be glued on ("sitiaminah").
    if (q !== search.trim()) {
      setSearchInput(q);
      setSearch(q);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('q')]);

  useEffect(() => {
    if (searchInput === search) return;
    const t = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const filters: FetchProspectsParams = { status, source, package_id: pkg, agent_id: agent, payoff, departure_plan: departure, search };

  // Filters, search and page live in the URL (refresh and "back" keep them).
  useEffect(() => {
    const next = new URLSearchParams();
    const put = (k: string, v: string, d: string) => v && v !== d && next.set(k, v);
    put('status', status, 'all');
    put('source', source, 'all');
    put('package', pkg, 'all');
    put('agent', agent, 'all');
    put('payoff', payoff, 'all');
    put('departure', departure, 'all');
    put('q', search.trim(), '');
    put('page', String(page), '1');
    put('size', String(pageSize), '25');
    setParams(next, { replace: true });
    rememberProspectListQuery(next.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, source, pkg, agent, payoff, departure, search, page, pageSize]);

  const loadList = useCallback(async () => {
    const mine = ++seq.current;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProspectPage(filters, page, pageSize);
      if (mine !== seq.current) return;
      // Page past the end (rows left this filter, or a stale ?page= link): go to the last page with rows.
      const fixed = clampedPage(page, data.total, pageSize);
      if (fixed !== null && fixed !== page) {
        setPage(fixed);
        return;
      }
      setRows(data.items);
      setTotal(data.total);
    } catch (e: any) {
      if (mine !== seq.current) return;
      // Never leave the previous filter's rows under the new tab.
      setRows([]);
      setTotal(0);
      setError(e.message || 'Daftar prospek tidak dapat dimuat.');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, source, pkg, agent, payoff, departure, search, page, pageSize]);

  const loadSummary = useCallback(() => {
    fetchProspectSummary().then(setSummary).catch(() => {});
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);
  useEffect(() => {
    loadSummary();
    fetchPackages().then(setPackages).catch(() => {});
    fetchDashboardAgents().then(setAgents).catch(() => {});
  }, [loadSummary]);

  const refreshAll = () => {
    loadList();
    loadSummary();
    frame?.refreshBadges();
  };

  const change = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  const hasFilter = source !== 'all' || pkg !== 'all' || agent !== 'all' || payoff !== 'all' || departure !== 'all' || search.trim() !== '';
  const resetFilters = () => {
    setSource('all');
    setPkg('all');
    setAgent('all');
    setPayoff('all');
    setDeparture('all');
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const openProspect = (p: ProspectItem) => navigate(`/prospects/${p.id}${window.location.search}`);
  const closeDrawer = () => navigate(`/prospects${window.location.search}`);

  // KPIs from the overview API: 30 days vs the 30 before, and the value of prospects still in progress.
  const [overview, setOverview] = useState<DashboardOverviewData | null>(null);
  useEffect(() => {
    fetchDashboardOverview().then(setOverview).catch(() => setOverview(null));
  }, []);
  const kpi = useMemo(() => {
    if (!overview) return null;
    const days = overview.kpi_daily ?? [];
    const prospects = compare(days, (d) => d.prospects);
    // Cohort conversion: prospects created in the window and how many of them are Closing now.
    // Missing on an older server: the value is hidden rather than mixing two groups (could exceed 100%).
    const cohort = overview.conversion_cohort ?? null;
    return {
      prospects,
      jamaah: compare(days, (d) => d.closing_jamaah),
      cohort,
      rate: cohortRate(cohort),
      pipeline: overview.pending_pipeline,
    };
  }, [overview]);

  const lostReasons = Object.entries(summary?.lost_reasons ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="ku-stack">
      {/* Sales KPIs of the last 30 days (status counts are already on the tabs below). */}
      <div className="ku-kpi-row">
        <KpiCard label="Prospek masuk" icon={<Users className="ku-icon" />} value={kpi ? fmtNumber(kpi.prospects.cur) : '—'} delta={kpi ? { ...delta(kpi.prospects.cur, kpi.prospects.prev), suffix: 'vs 30 hari sebelumnya' } : undefined} note="30 hari terakhir" />
        <KpiCard label="Jamaah closing" icon={<Handshake className="ku-icon" />} value={kpi ? fmtNumber(kpi.jamaah.cur) : '—'} delta={kpi ? { ...delta(kpi.jamaah.cur, kpi.jamaah.prev), suffix: 'vs 30 hari sebelumnya' } : undefined} note="30 hari terakhir" />
        <KpiCard label="Konversi" icon={<Percent className="ku-icon" />} value={kpi && kpi.rate !== null ? fmtPercent(kpi.rate) : '—'} note={kpi?.cohort ? `${fmtNumber(kpi.cohort.closings)} dari ${fmtNumber(kpi.cohort.prospects)} prospek baru sudah closing` : undefined} />
        <KpiCard label="Potensi pipeline" icon={<Banknote className="ku-icon" />} value={kpi ? fmtRupiahShort(kpi.pipeline.total_value) : '—'} note={kpi ? `${fmtNumber(kpi.pipeline.total_prospects)} prospek berjalan · ${fmtNumber(kpi.pipeline.total_pax)} jamaah` : undefined} />
      </div>
      {summary && summary.stale_baru > 0 && status !== 'baru' && (
        <Banner tone="warning" icon={<Clock className="ku-icon--sm" />} action={<Button size="sm" onClick={() => change(setStatus)('baru')}>Lihat prospek</Button>}>
          <b>{fmtNumber(summary.stale_baru)} prospek baru</b> belum dihubungi lebih dari 24 jam.
        </Banner>
      )}
      {summary && summary.awaiting_payoff > 0 && status === 'closing' && payoff !== 'pending' && (
        <Banner tone="info" icon={<Wallet className="ku-icon--sm" />} action={<Button size="sm" onClick={() => change(setPayoff)('pending')}>Tampilkan</Button>}>
          <b>{fmtNumber(summary.awaiting_payoff)} prospek</b> sudah DP dan menunggu ditandai lunas
          {awaitingPayoffAgentNote(summary.awaiting_payoff_with_agent, releasePolicy, fmtNumber)}
        </Banner>
      )}
      {status === 'tidak_lanjut' && lostReasons.length > 0 && (
        <div className="pr-reasons" aria-label="Alasan tidak lanjut">
          <span className="ku-muted">Alasan:</span>
          {lostReasons.map(([k, n]) => (
            <span key={k} className="pr-reasons__item">
              {lostReasonCategoryLabel(k)} <b>{fmtNumber(n)}</b>
            </span>
          ))}
        </div>
      )}
      {error && <Banner tone="danger">{error}</Banner>}

      <section className="ku-list" aria-label="Daftar prospek">
        <CardTabs>
          <Tabs<StatusTab>
            label="Status prospek"
            value={status}
            onChange={change(setStatus)}
            items={[
              { id: 'all', label: 'Semua', count: summary?.total },
              { id: 'baru', label: 'Baru', count: summary?.baru, alert: true },
              { id: 'dihubungi', label: 'Dihubungi', count: summary?.dihubungi },
              { id: 'tertarik', label: 'Tertarik', count: summary?.tertarik },
              { id: 'closing', label: 'Closing', count: summary?.closing },
              { id: 'tidak_lanjut', label: 'Tidak lanjut', count: summary?.tidak_lanjut },
            ]}
          />
        </CardTabs>
        <Toolbar
          right={
            <Button size="sm" icon={<Download className="ku-icon--sm" />} onClick={() => downloadProspectsCSV(filters).catch((e) => setError(e.message))}>
              Unduh CSV
            </Button>
          }
        >
          <SearchField value={searchInput} onChange={setSearchInput} placeholder="Cari nama, nomor WhatsApp, domisili" />
          <FilterMenu active={[source, agent, pkg, departure, payoff].filter((v) => v !== 'all').length} onReset={resetFilters}>
            <Field label="Kanal">
              {(id) => (
                <Select
                  id={id}
                  label="Kanal"
                  value={source}
                  onChange={change(setSource)}
                  options={[
                    { value: 'all', label: 'Semua kanal' },
                    { value: 'organik', label: 'Website' },
                    { value: 'paid', label: 'Iklan' },
                    { value: 'agen', label: 'Agen' },
                  ]}
                />
              )}
            </Field>
            <Field label="Agen">{(id) => <Select id={id} label="Agen" value={agent} onChange={change(setAgent)} options={[{ value: 'all', label: 'Semua agen' }, ...agents.map((a) => ({ value: String(a.id), label: a.name }))]} />}</Field>
            <Field label="Paket">{(id) => <Select id={id} label="Paket" value={pkg} onChange={change(setPkg)} options={[{ value: 'all', label: 'Semua paket' }, ...packages.map((p) => ({ value: String(p.id), label: p.name }))]} />}</Field>
            <Field label="Rencana berangkat">
              {(id) => (
                <Select
                  id={id}
                  label="Rencana berangkat"
                  value={departure}
                  onChange={change(setDeparture)}
                  options={[{ value: 'all', label: 'Semua bulan' }, { value: 'none', label: 'Belum diisi' }, ...departurePlanOptions().filter((o) => o.value !== '')]}
                />
              )}
            </Field>
            <Field label="Pelunasan" hint="Berlaku untuk prospek Closing.">
              {(id) => (
                <Select
                  id={id}
                  label="Pelunasan"
                  value={payoff}
                  onChange={change(setPayoff)}
                  options={[
                    { value: 'all', label: 'Semua' },
                    { value: 'pending', label: 'DP, menunggu lunas' },
                    { value: 'done', label: 'Lunas' },
                  ]}
                />
              )}
            </Field>
          </FilterMenu>
          {search.trim() !== '' || [source, agent, pkg, departure, payoff].filter((v) => v !== 'all').length > 0 ? (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="ku-icon--sm" />} onClick={resetFilters}>
              Reset
            </Button>
          ) : null}
        </Toolbar>

        <DataTable
          loading={loading}
          rows={rows}
          rowKey={(p) => p.id}
          onRowClick={openProspect}
          empty={
            hasFilter ? (
              <EmptyState icon={<SearchX className="ku-icon" />} title="Tidak ada prospek yang cocok" description="Ubah kata kunci atau filter." action={<Button size="sm" onClick={resetFilters}>Reset filter</Button>} />
            ) : (
              <EmptyState icon={<Inbox className="ku-icon" />} title="Belum ada prospek di sini" description="Prospek dari website, iklan, dan link agen masuk otomatis ke daftar ini." />
            )
          }
          columns={[
            {
              key: 'name',
              header: 'Nama',
              cell: (p) => (
                <div className="pr-cell">
                  <span className="ku-strong">{p.anonymized_at ? 'Data pribadi dihapus' : p.name}</span>
                  <span className="ku-muted ku-small">{p.anonymized_at ? '—' : p.phone}</span>
                </div>
              ),
            },
            {
              key: 'pkg',
              header: 'Paket',
              cell: (p) => (
                <div className="pr-cell">
                  <span>{p.package_name && p.package_name !== '-' ? p.package_name : <span className="ku-muted">Belum pilih paket</span>}</span>
                  <span className="ku-muted ku-small">
                    {[`${p.jumlah_jamaah && p.jumlah_jamaah > 0 ? p.jumlah_jamaah : 1} jamaah`, !p.package_id && p.departure_plan ? formatDeparturePlan(p.departure_plan) : null].filter(Boolean).join(' · ')}
                  </span>
                </div>
              ),
            },
            { key: 'ch', header: 'Kanal', cell: (p) => <ChannelTag channel={channelOf(p.source_channel, p.agent_id)} detail={agentLabel(p) ?? (p.utm_campaign || null)} /> },
            {
              key: 'when',
              header: 'Masuk',
              cell: (p) => (
                <div className="pr-cell">
                  <span>{formatDateWIB(p.created_at)}</span>
                  <span className="ku-muted ku-small">{formatTimeWIB(p.created_at)}</span>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (p) => (
                <div className="pr-cell">
                  <StatusPill status={p.status} />
                  {p.status === 'closing' && <span className={`ku-small ${p.paid_off_at ? 'ku-up' : 'ku-muted'}`}>{p.paid_off_at ? 'Lunas' : 'DP, menunggu lunas'}</span>}
                  {p.status === 'tidak_lanjut' && (p.lost_reason_category || p.lost_reason) && (
                    <LostReasonCell category={p.lost_reason_category} reason={p.lost_reason} />
                  )}
                </div>
              ),
            },
          ]}
        />
        {total > 0 && <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} pageSizes={PAGE_SIZES} onPageSize={change(setPageSize)} />}
      </section>

      {openId !== null && <ProspectDrawer key={openId} startEditing={startEditing} id={openId} packages={packages} onClose={closeDrawer} onChanged={refreshAll} onDeleted={() => { closeDrawer(); refreshAll(); }} />}
    </div>
  );
};
