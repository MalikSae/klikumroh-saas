// Dashboard (approved prototype: dashboard/design/prototype.html, screen "Dashboard").
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, Handshake, Inbox, Percent, Rocket, UserPlus, Users, Wallet } from 'lucide-react';
import {
  fetchDashboardAgents,
  fetchDashboardOverview,
  fetchProspectPage,
  type ProspectItem,
  fetchPackages,
  fetchTenantContactLegal,
  fetchTenantProfile,
  type DashboardOverviewData,
  type KPIDay,
} from '../../services/api';
import {
  Banner,
  Button,
  Card,
  ChannelTag,
  CHANNEL_LABEL,
  DataTable,
  EmptyState,
  KpiCard,
  Notice,
  Select,
  StatusPill,
  Strip,
  channelOf,
  fmtAgo,
  fmtNumber,
  fmtPercent,
  fmtRupiah,
  type Channel,
} from '../../ui';
import { useFrame } from '../../app/AppFrame';
import { subscriptionNotice } from '../../app/subscriptionNotice';
import { ChannelChart } from './ChannelChart';
import './dashboard.css';

/** The overview API sends "-" for an empty name. */
const present = (v?: string | null) => !!v && v.trim() !== '' && v.trim() !== '-';

const HIDE_SETUP_KEY = 'klikumroh_hide_setup';

interface Setup {
  profile: boolean;
  packages: boolean;
  agents: boolean;
}

/** Current 30 days vs the 30 before, from the 60-day series. */
function compare(days: KPIDay[], pick: (d: KPIDay) => number) {
  const cur = days.slice(-30).reduce((a, d) => a + pick(d), 0);
  const prev = days.slice(-60, -30).reduce((a, d) => a + pick(d), 0);
  return { cur, prev };
}
function weekly(days: KPIDay[], pick: (d: KPIDay) => number) {
  const last = days.slice(-28);
  return [0, 1, 2, 3].map((w) => last.slice(w * 7, w * 7 + 7).reduce((a, d) => a + pick(d), 0));
}
function delta(cur: number, prev: number): { text: string; trend: 'up' | 'down' | 'flat' } {
  if (prev === 0) return cur > 0 ? { text: 'Baru', trend: 'up' } : { text: '0', trend: 'flat' };
  const pct = ((cur - prev) / prev) * 100;
  const trend = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  return { text: `${pct > 0 ? '+' : ''}${Math.round(pct)}%`, trend };
}

export const DashboardScreen: React.FC = () => {
  const navigate = useNavigate();
  const frame = useFrame();
  const [data, setData] = useState<DashboardOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAgents, setPendingAgents] = useState(0);
  const [recent, setRecent] = useState<ProspectItem[] | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [range, setRange] = useState('14');
  const [visible, setVisible] = useState<Record<Channel, boolean>>({ web: true, ads: true, agen: true });
  const [hideSetup, setHideSetup] = useState(() => {
    try {
      return localStorage.getItem(HIDE_SETUP_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    fetchDashboardOverview().then(setData).catch((e) => setError(e.message || 'Data dashboard tidak dapat dimuat.'));
    fetchProspectPage({}, 1, 6).then((p) => setRecent(p.items)).catch(() => setRecent([]));
    Promise.all([
      fetchTenantProfile().catch(() => null),
      fetchTenantContactLegal().catch(() => null),
      fetchPackages('published').catch(() => []),
      fetchDashboardAgents().catch(() => []),
      fetchDashboardAgents('pending').catch(() => []),
    ]).then(([profile, contact, packages, agents, pending]) => {
      setPendingAgents(pending.length);
      setSetup({
        profile: !!profile?.brand_logo_url && !!contact?.whatsapp_number,
        packages: packages.length > 0,
        agents: agents.some((a) => a.status === 'active'),
      });
    });
  }, []);

  const days = data?.kpi_daily ?? [];
  const kpi = useMemo(() => {
    const p = compare(days, (d) => d.prospects);
    const c = compare(days, (d) => d.closing_jamaah);
    const cc = compare(days, (d) => d.closings);
    const rate = p.cur ? (cc.cur / p.cur) * 100 : 0;
    const prevRate = p.prev ? (cc.prev / p.prev) * 100 : 0;
    const rateDiff = rate - prevRate;
    return {
      prospects: { value: p.cur, delta: delta(p.cur, p.prev), spark: weekly(days, (d) => d.prospects) },
      jamaah: { value: c.cur, delta: delta(c.cur, c.prev), spark: weekly(days, (d) => d.closing_jamaah) },
      rate: {
        value: rate,
        delta: {
          text: `${rateDiff > 0 ? '+' : ''}${rateDiff.toLocaleString('id-ID', { maximumFractionDigits: 1 })} poin`,
          trend: (rateDiff > 0.05 ? 'up' : rateDiff < -0.05 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
        },
        spark: [0, 1, 2, 3].map((w) => {
          const wk = days.slice(-28).slice(w * 7, w * 7 + 7);
          const pr = wk.reduce((a, d) => a + d.prospects, 0);
          return pr ? (wk.reduce((a, d) => a + d.closings, 0) / pr) * 100 : 0;
        }),
      },
    };
  }, [days]);

  const notice = subscriptionNotice(frame?.subscription ?? null);
  const totalProspects = data?.kpis.total_prospects ?? 0;
  const setupSteps = setup
    ? [
        { done: setup.profile, next: 'lengkapi logo dan nomor WhatsApp', to: '/settings' },
        { done: setup.packages, next: 'tayangkan paket pertama', to: '/packages' },
        { done: setup.agents, next: 'aktifkan agen pertama', to: '/agents' },
        { done: totalProspects > 0, next: 'bagikan link website untuk prospek pertama', to: '/website' },
      ]
    : [];
  const setupDone = setupSteps.filter((s) => s.done).length;
  const nextStep = setupSteps.find((s) => !s.done);

  const dismissSetup = () => {
    setHideSetup(true);
    try {
      localStorage.setItem(HIDE_SETUP_KEY, 'true');
    } catch {
      /* preference only */
    }
  };

  const alerts = data?.urgent_alerts;
  const trend = (data?.prospect_trends ?? []).slice(-Number(range));

  if (error) {
    return (
      <Banner tone="danger" icon={<AlertTriangle className="ku-icon--sm" />} action={<Button size="sm" onClick={() => window.location.reload()}>Muat ulang</Button>}>
        {error}
      </Banner>
    );
  }

  return (
    <div className="ku-stack db2-home">
      {notice ? (
        <Strip
          tone={notice.tone}
          icon={<AlertTriangle className="ku-icon" />}
          title={notice.title}
          description={notice.text}
          action={<Button variant="light" to={notice.to}>{notice.action}</Button>}
        />
      ) : (
        !hideSetup &&
        nextStep && (
          <Strip
            icon={<Rocket className="ku-icon" />}
            title="Lengkapi website travel Anda"
            description={`${setupDone} dari ${setupSteps.length} langkah selesai. Berikutnya: ${nextStep.next}.`}
            progress={{ done: setupDone, total: setupSteps.length }}
            action={<Button variant="light" to={nextStep.to}>Lanjutkan setup</Button>}
            onClose={dismissSetup}
          />
        )
      )}

      <div className="ku-grid-main db2-row1">
        <Card
          title="Prospek per kanal"
          actions={
            <>
              <Select
                label="Rentang waktu"
                value={range}
                onChange={setRange}
                options={[
                  { value: '7', label: '7 hari' },
                  { value: '14', label: '14 hari' },
                  { value: '30', label: '30 hari' },
                ]}
              />
            </>
          }
        >
          {/* Legend and series switch in one: tap a channel to hide or show it. */}
          <div className="db2-legend" role="group" aria-label="Tampilkan kanal">
            {(['web', 'ads', 'agen'] as Channel[]).map((c) => (
              <button
                key={c}
                type="button"
                className={`db2-toggle${visible[c] ? '' : ' db2-toggle--off'}`}
                aria-pressed={visible[c]}
                onClick={() => setVisible((s) => ({ ...s, [c]: !s[c] }))}
              >
                <i className={`ku-dot ku-dot--${c}`} aria-hidden="true" />
                {CHANNEL_LABEL[c]}
              </button>
            ))}
          </div>
          {!data ? (
            <div className="db2-chart-skeleton" />
          ) : trend.some((d) => d.total > 0) ? (
            <ChannelChart data={trend} visible={visible} />
          ) : (
            <EmptyState icon={<Inbox className="ku-icon" />} title="Belum ada prospek pada rentang ini" description="Grafik terisi saat calon jamaah mengisi minat di website, dari iklan, atau lewat link agen." />
          )}
        </Card>

        <div className="ku-stack">
          <KpiCard label="Prospek baru" icon={<Users className="ku-icon" />} value={data ? fmtNumber(kpi.prospects.value) : '—'} delta={data ? { ...kpi.prospects.delta, suffix: 'vs 30 hari sebelumnya' } : undefined} spark={data ? kpi.prospects.spark : undefined} to="/prospects" />
          <KpiCard label="Jamaah closing" icon={<Handshake className="ku-icon" />} value={data ? fmtNumber(kpi.jamaah.value) : '—'} delta={data ? { ...kpi.jamaah.delta, suffix: 'vs 30 hari sebelumnya' } : undefined} spark={data ? kpi.jamaah.spark : undefined} to="/prospects?status=closing" />
          <KpiCard label="Konversi" icon={<Percent className="ku-icon" />} value={data ? fmtPercent(kpi.rate.value) : '—'} delta={data ? { ...kpi.rate.delta, suffix: 'vs 30 hari sebelumnya' } : undefined} spark={data ? kpi.rate.spark : undefined} />
        </div>
      </div>

      <div className="ku-grid-main db2-row2">
        <Card title="Prospek terbaru" actions={<Button size="sm" to="/prospects">Lihat semua</Button>}>
          <div className="db2-gap" />
          <DataTable
            loading={!recent}
            rows={recent ?? []}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/prospects/${p.id}`)}
            empty={<EmptyState compact title="Belum ada prospek" description="Prospek dari website, iklan, dan agen tampil di sini." />}
            columns={[
              { key: 'name', header: 'Nama', cell: (p) => <span className="ku-strong">{p.name}</span> },
              { key: 'pkg', header: 'Paket', cell: (p) => (present(p.package_name) ? p.package_name : <span className="ku-muted">Belum pilih paket</span>) },
              { key: 'ch', header: 'Kanal', cell: (p) => <ChannelTag channel={channelOf(p.source_channel, p.agent_id)} detail={present(p.agent_name) ? p.agent_name : null} /> },
              { key: 'when', header: 'Masuk', cell: (p) => <span className="ku-muted">{fmtAgo(p.created_at)}</span> },
              { key: 'status', header: 'Status', cell: (p) => <StatusPill status={p.status} /> },
            ]}
          />
        </Card>

        <Card title="Perlu tindakan">
          {!data ? (
            <div className="db2-gap" />
          ) : (
            <div className="ku-notices">
              {alerts && alerts.uncontacted_prospects_count > 0 && (
                <Notice hot icon={<Clock className="ku-icon" />} title={`${fmtNumber(alerts.uncontacted_prospects_count)} prospek belum dihubungi`} meta="Status masih Baru" to="/prospects?status=baru" />
              )}
              {pendingAgents > 0 && <Notice icon={<UserPlus className="ku-icon" />} title={`${fmtNumber(pendingAgents)} pendaftaran agen baru`} meta="Menunggu persetujuan Anda" to="/agents/pending" />}
              {alerts && alerts.pending_payouts_count > 0 && (
                <Notice icon={<Wallet className="ku-icon" />} title={`${fmtNumber(alerts.pending_payouts_count)} pengajuan pencairan`} meta={`Total ${fmtRupiah(alerts.pending_payouts_total)}`} to="/payouts" />
              )}
              {!(alerts && alerts.uncontacted_prospects_count > 0) && pendingAgents === 0 && !(alerts && alerts.pending_payouts_count > 0) && (
                <EmptyState compact icon={<Inbox className="ku-icon" />} title="Tidak ada yang menunggu" description="Prospek baru, pendaftaran agen, dan pencairan komisi muncul di sini." />
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
