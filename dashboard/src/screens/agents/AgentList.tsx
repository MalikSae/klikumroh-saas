// Agen tab: every approved agent with referral performance; row opens the agent drawer.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchAgentPerformance, fetchDashboardAgents, type AgentItem, type AgentPerformance } from '../../services/api';
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
import { AGENT_STATUS } from './shared';
import { AgentDrawer } from './AgentDrawer';

type Row = AgentItem & { perf: AgentPerformance | null; prospects: number; conversion: number | null };
type Sort = 'closing' | 'prospects' | 'clicks' | 'commission' | 'newest';

const PAGE_SIZE = 25;

export const AgentList: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [perf, setPerf] = useState<Map<number, AgentPerformance>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [sort, setSort] = useState<Sort>('closing');
  const [page, setPage] = useState(1);

  const load = () =>
    Promise.all([fetchDashboardAgents(), fetchAgentPerformance().catch(() => [] as AgentPerformance[])])
      .then(([a, p]) => {
        setAgents(a.filter((x) => x.status === 'active' || x.status === 'inactive'));
        setPerf(new Map(p.map((x) => [x.agent_id, x])));
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
        const prospects = p ? p.baru + p.dihubungi + p.tertarik + p.closing + p.tidak_lanjut : 0;
        return { ...a, perf: p, prospects, conversion: prospects > 0 && p ? (p.closing / prospects) * 100 : null };
      });
    const key: Record<Sort, (r: Row) => number> = {
      closing: (r) => r.perf?.closing_jamaah ?? 0,
      prospects: (r) => r.prospects,
      clicks: (r) => r.perf?.clicks_30d ?? 0,
      commission: (r) => r.perf?.commission_earned ?? 0,
      newest: (r) => new Date(r.created_at).getTime(),
    };
    return list.sort((a, b) => key[sort](b) - key[sort](a) || a.name.localeCompare(b.name));
  }, [agents, perf, search, status, sort]);

  useEffect(() => setPage(1), [search, status, sort]);

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Agen',
      cell: (r) => (
        <span className="ku-person">
          <Avatar name={r.name} />
          <span className="ag-name">
            {r.name}
            <span className="ku-muted">{r.referral_code}</span>
          </span>
        </span>
      ),
    },
    { key: 'clicks', header: 'Klik 30 hari', align: 'right', cell: (r) => fmtNumber(r.perf?.clicks_30d ?? 0) },
    { key: 'prospects', header: 'Prospek', align: 'right', cell: (r) => fmtNumber(r.prospects) },
    { key: 'closing', header: 'Jamaah closing', align: 'right', cell: (r) => fmtNumber(r.perf?.closing_jamaah ?? 0) },
    { key: 'conv', header: 'Konversi', align: 'right', cell: (r) => (r.conversion === null ? '—' : fmtPercent(r.conversion)) },
    { key: 'commission', header: 'Komisi', align: 'right', cell: (r) => fmtRupiah(r.perf?.commission_earned ?? 0) },
    { key: 'last', header: 'Prospek terakhir', cell: (r) => (r.perf?.last_prospect_at ? fmtAgo(r.perf.last_prospect_at) : <span className="ku-muted">Belum ada</span>) },
    { key: 'status', header: 'Status', cell: (r) => <Pill tone={AGENT_STATUS[r.status]?.tone}>{AGENT_STATUS[r.status]?.label ?? r.status}</Pill> },
  ];

  const filters = (status !== 'all' ? 1 : 0) + (sort !== 'closing' ? 1 : 0);
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="ku-list">
      {error && <Banner tone="danger">{error}</Banner>}
      <Toolbar>
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
            <EmptyState compact title="Belum ada agen aktif" description="Agen yang Anda setujui di tab Pendaftaran muncul di sini beserta performanya." />
          ) : (
            <EmptyState compact title="Tidak ada agen yang cocok" description="Ubah pencarian atau filter." />
          )
        }
      />
      {rows.length > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />}

      {id && (
        <AgentDrawer
          agentId={Number(id)}
          perf={perf.get(Number(id)) || null}
          onClose={() => navigate('/agents')}
          onChanged={() => {
            load();
            onChanged();
          }}
        />
      )}
    </section>
  );
};
