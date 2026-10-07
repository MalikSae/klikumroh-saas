// Agen tab: every approved agent with referral performance and daily syiar (habit tracker); row opens the
// agent page.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award } from 'lucide-react';
import { fetchAgentHabitOverview, getFullImageUrl, fetchAgentPerformance, fetchDashboardAgents, type AgentHabitOverview, type AgentItem, type AgentPerformance } from '../../services/api';
import {
  Avatar,
  Banner,
  DataTable,
  EmptyState,
  Field,
  FilterMenu,
  Pagination,
  Pill,
  SearchField,
  Select,
  Toolbar,
  errorText,
  fmtAgo,
  fmtNumber,
  fmtPercent,
  fmtRupiah,
  type Column,
} from '../../ui';
import { AGENT_STATUS, AgentSignupLinkButton } from './shared';

type Recruits = { active: number; pending: number };
type Row = AgentItem & { perf: AgentPerformance | null; habit: AgentHabitOverview | null; prospects: number; conversion: number | null; recruits: Recruits };
type Sort = 'closing' | 'prospects' | 'clicks' | 'commission' | 'syiar' | 'newest';

const badgeTier = (days: number) => (days >= 100 ? 'gold' : days >= 30 ? 'silver' : 'bronze');

const PAGE_SIZE = 25;

export const AgentList: React.FC = () => {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [perf, setPerf] = useState<Map<number, AgentPerformance>>(new Map());
  const [habits, setHabits] = useState<Map<number, AgentHabitOverview>>(new Map());
  // Registrations per agent code (parent_agent_id): approved (active) and waiting for approval.
  const [recruits, setRecruits] = useState<Map<number, Recruits>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [sort, setSort] = useState<Sort>('closing');
  const [page, setPage] = useState(1);

  const load = () =>
    Promise.all([
      fetchDashboardAgents(),
      fetchAgentPerformance().catch(() => [] as AgentPerformance[]),
      fetchAgentHabitOverview().catch(() => [] as AgentHabitOverview[]),
    ])
      .then(([a, p, h]) => {
        setAgents(a.filter((x) => x.status === 'active' || x.status === 'inactive'));
        const rc = new Map<number, Recruits>();
        for (const x of a) {
          if (!x.parent_agent_id || (x.status !== 'active' && x.status !== 'pending')) continue;
          const cur = rc.get(x.parent_agent_id) ?? { active: 0, pending: 0 };
          if (x.status === 'active') cur.active += 1;
          else cur.pending += 1;
          rc.set(x.parent_agent_id, cur);
        }
        setRecruits(rc);
        setPerf(new Map(p.map((x) => [x.agent_id, x])));
        setHabits(new Map(h.map((x) => [x.agent_id, x])));
      })
      .catch((e) => setError(errorText(e, 'Gagal memuat agen')))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const rows: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = agents
      .filter((a) => status === 'all' || a.status === status)
      .filter((a) => !q || [a.name, a.phone, a.referral_code, a.domisili].some((v) => v?.toLowerCase().includes(q)))
      .map((a) => {
        const p = perf.get(a.id) || null;
        const h = habits.get(a.id) || null;
        const prospects = p ? p.baru + p.dihubungi + p.tertarik + p.closing + p.tidak_lanjut : 0;
        return { ...a, perf: p, habit: h, prospects, conversion: prospects > 0 && p ? (p.closing / prospects) * 100 : null, recruits: recruits.get(a.id) ?? { active: 0, pending: 0 } };
      });
    const key: Record<Sort, (r: Row) => number> = {
      closing: (r) => r.perf?.closing_jamaah ?? 0,
      prospects: (r) => r.prospects,
      clicks: (r) => r.perf?.clicks_30d ?? 0,
      commission: (r) => r.perf?.commission_earned ?? 0,
      // Most consistent first: active days this week, then the highest streak badge.
      syiar: (r) => (r.habit?.active_days_7 ?? 0) * 1000 + (r.habit?.top_badge ?? 0),
      newest: (r) => new Date(r.created_at).getTime(),
    };
    return list.sort((a, b) => key[sort](b) - key[sort](a) || a.name.localeCompare(b.name));
  }, [agents, perf, habits, recruits, search, status, sort]);

  useEffect(() => setPage(1), [search, status, sort]);

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Agen',
      cell: (r) => (
        <span className="ku-person">
          <Avatar name={r.name} src={r.photo_url ? getFullImageUrl(r.photo_url) : null} />
          <span className="ag-name">
            {r.name}
            <span className="ku-muted">{r.referral_code}</span>
          </span>
        </span>
      ),
    },
    { key: 'clicks', header: 'Klik 30 hari', align: 'right', mobile: 'hide', wideOnly: true, cell: (r) => fmtNumber(r.perf?.clicks_30d ?? 0) },
    { key: 'prospects', header: 'Prospek', align: 'right', cell: (r) => fmtNumber(r.prospects) },
    { key: 'closing', header: 'Jamaah closing', align: 'right', cell: (r) => fmtNumber(r.perf?.closing_jamaah ?? 0) },
    { key: 'conv', header: 'Konversi', align: 'right', mobile: 'hide', cell: (r) => (r.conversion === null ? '—' : fmtPercent(r.conversion)) },
    {
      key: 'recruits',
      header: 'Rekrutan',
      align: 'right',
      mobile: 'hide',
      cell: (r) => (
        <span title="Agen yang mendaftar dengan kode referral agen ini dan sudah disetujui">
          {fmtNumber(r.recruits.active)}
          {r.recruits.pending > 0 && <span className="ku-muted"> +{r.recruits.pending} menunggu</span>}
        </span>
      ),
    },
    { key: 'commission', header: 'Komisi', align: 'right', cell: (r) => fmtRupiah(r.perf?.commission_earned ?? 0) },
    {
      key: 'syiar',
      header: 'Syiar 7 hari',
      align: 'right',
      mobile: 'stat',
      cell: (r) => (
        <span className="ag-syiar" title="Hari aktif syiar harian dalam 7 hari terakhir">
          {r.habit?.active_days_7 ?? 0}/7
        </span>
      ),
    },
    {
      // Highest streak badge ever earned (7 / 30 / 100 active days in a row), kept for good.
      key: 'badge',
      header: 'Lencana',
      mobile: 'stat',
      cell: (r) =>
        r.habit?.top_badge ? (
          <span className="ag-syiar" title={`Pernah aktif syiar ${r.habit.top_badge} hari berturut-turut`}>
            <Award className={`ku-icon--sm ag-habit__medal ag-habit__medal--${badgeTier(r.habit.top_badge)}`} aria-hidden="true" />
            {r.habit.top_badge} hari
          </span>
        ) : (
          <span className="ku-muted">—</span>
        ),
    },
    { key: 'last', header: 'Prospek terakhir', mobile: 'stat', cell: (r) => (r.perf?.last_prospect_at ? fmtAgo(r.perf.last_prospect_at) : <span className="ku-muted">Belum ada</span>) },
    { key: 'status', header: 'Status', cell: (r) => <Pill tone={AGENT_STATUS[r.status]?.tone}>{AGENT_STATUS[r.status]?.label ?? r.status}</Pill> },
  ];

  const filters = (status !== 'all' ? 1 : 0) + (sort !== 'closing' ? 1 : 0);
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="ku-list">
      {error && <Banner tone="danger">{error}</Banner>}
      <Toolbar right={agents.length > 0 && <AgentSignupLinkButton />}>
        <SearchField value={search} onChange={setSearch} placeholder="Cari nama, nomor WhatsApp, kode referral" />
        <FilterMenu
          active={filters}
          onReset={() => {
            setStatus('all');
            setSort('closing');
          }}
        >
          <Field label="Status">
            {(id) => (
              <Select
                id={id}
                label="Status"
                value={status}
                onChange={(v) => setStatus(v as typeof status)}
                options={[
                  { value: 'all', label: 'Semua agen' },
                  { value: 'active', label: 'Aktif' },
                  { value: 'inactive', label: 'Nonaktif' },
                ]}
              />
            )}
          </Field>
          <Field label="Urutkan">
            {(id) => (
              <Select
                id={id}
                label="Urutkan"
                value={sort}
                onChange={(v) => setSort(v as Sort)}
                options={[
                  { value: 'closing', label: 'Jamaah closing terbanyak' },
                  { value: 'prospects', label: 'Prospek terbanyak' },
                  { value: 'clicks', label: 'Klik 30 hari terbanyak' },
                  { value: 'commission', label: 'Komisi terbesar' },
                  { value: 'syiar', label: 'Paling istiqamah syiar' },
                  { value: 'newest', label: 'Baru bergabung' },
                ]}
              />
            )}
          </Field>
        </FilterMenu>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        loading={loading}
        onRowClick={(r) => navigate(`/agents/${r.id}`)}
        empty={
          agents.length === 0 ? (
            <EmptyState compact title="Belum ada agen aktif" description="Bagikan link pendaftaran ke calon agen. Agen yang Anda setujui di tab Pendaftaran muncul di sini." action={<AgentSignupLinkButton variant="primary" />} />
          ) : (
            <EmptyState compact title="Tidak ada agen yang cocok" description="Ubah pencarian atau filter." />
          )
        }
      />
      {rows.length > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />}

    </section>
  );
};
