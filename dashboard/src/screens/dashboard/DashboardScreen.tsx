// Dashboard (approved prototype: dashboard/design/prototype.html, screen "Dashboard").
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Banknote, CalendarDays, Clock, Flame, Handshake, Inbox, Percent, Rocket, UserPlus, Users, Wallet } from 'lucide-react';
import {
  fetchDashboardAgents,
  fetchDashboardOverview,
  fetchProspectPage,
  type ProspectItem,
  fetchPackages,
  fetchTenantContactLegal,
  fetchTenantProfile,
  type DashboardOverviewData,
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
  useIsMobile,
  fmtAgo,
  fmtNumber,
  fmtPercent,
  fmtRupiah,
  fmtRupiahShort,
  fmtDate,
  type Channel,
} from '../../ui';
import { useFrame } from '../../app/AppFrame';
import { subscriptionNotice } from '../../app/subscriptionNotice';
import { ChannelChart } from './ChannelChart';
import { AgentSummaryCard } from './AgentSummaryCard';
import { compare, delta, weekly } from './kpiMath';
import './dashboard.css';

/** The overview API sends "-" for an empty name. */
const present = (v?: string | null) => !!v && v.trim() !== '' && v.trim() !== '-';

const HIDE_SETUP_KEY = 'klikumroh_hide_setup';

interface Setup {
  profile: boolean;
  packages: boolean;
  agents: boolean;
}

export const DashboardScreen: React.FC = () => {
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const frame = useFrame();
  const [data, setData] = useState<DashboardOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAgents, setPendingAgents] = useState(0);
  const [recent, setRecent] = useState<ProspectItem[] | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  // Same 30-day window as the KPIs by default.
  const [range, setRange] = useState('30');
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
    fetchProspectPage({}, 1, 5).then((p) => setRecent(p.items)).catch(() => setRecent([]));
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
    const v = compare(days, (d) => d.closing_value ?? 0);
    return {
      value: { value: v.cur, delta: delta(v.cur, v.prev), spark: weekly(days, (d) => d.closing_value ?? 0) },
      closings: cc.cur,
      prospectCount: p.cur,
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
  // Hot prospects: interested but not closed yet, the money closest to being collected.
  const hot = data?.pending_pipeline?.stages?.find((st) => st.status === 'tertarik');
  const lost = data?.pipeline_funnel;
  const lostTotal = lost?.tidak_lanjut ?? 0;
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
          {/* Which channel turns prospects into closings (30 days): where the next budget should go. */}
          {data && data.channel_attribution.some((a) => a.leads_count > 0) && (
            <ul className="db2-quality" aria-label="Closing per kanal, 30 hari terakhir">
              {(['web', 'ads', 'agen'] as Channel[]).map((c) => {
                const key = c === 'agen' ? 'agent' : c === 'ads' ? 'paid_ads' : 'organik';
                const a = data.channel_attribution.find((x) => x.channel === key);
                const leads = a?.leads_count ?? 0;
                const closing = a?.closing_count ?? 0;
                return (
                  <li key={c}>
                    <i className={`ku-dot ku-dot--${c}`} aria-hidden="true" />
                    <span className="db2-quality__name">{CHANNEL_LABEL[c]}</span>
                    <span className="db2-quality__nums">
                      {fmtNumber(leads)} prospek · {fmtNumber(closing)} closing
                    </span>
                    <b className="db2-quality__rate">{leads > 0 ? fmtPercent((closing / leads) * 100) : '—'}</b>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Phone: the three KPIs share one compact panel (dashboard.css); the comparison note shows once. */}
        <div className="ku-stack db2-kpis">
          <KpiCard label="Prospek" icon={<Users className="ku-icon" />} value={data ? fmtNumber(kpi.prospects.value) : '—'} delta={data ? { ...kpi.prospects.delta, suffix: 'vs 30 hari sebelumnya' } : undefined} spark={data ? kpi.prospects.spark : undefined} to="/prospects" />
          <KpiCard label="Jamaah closing" icon={<Handshake className="ku-icon" />} value={data ? fmtNumber(kpi.jamaah.value) : '—'} delta={data ? { ...kpi.jamaah.delta, suffix: 'vs 30 hari sebelumnya' } : undefined} spark={data ? kpi.jamaah.spark : undefined} to="/prospects?status=closing" />
          <KpiCard
            label="Konversi"
            icon={<Percent className="ku-icon" />}
            value={data ? fmtPercent(kpi.rate.value) : '—'}
            note={data ? `${fmtNumber(kpi.closings)} dari ${fmtNumber(kpi.prospectCount)} prospek closing` : undefined} delta={data ? { ...kpi.rate.delta, suffix: 'vs 30 hari sebelumnya' } : undefined} spark={data ? kpi.rate.spark : undefined} />
          <KpiCard label="Estimasi omzet" icon={<Banknote className="ku-icon" />} value={data ? fmtRupiahShort(kpi.value.value) : '—'} note="Harga paket x jamaah closing" delta={data ? { ...kpi.value.delta, suffix: 'vs 30 hari sebelumnya' } : undefined} spark={data ? kpi.value.spark : undefined} />
          <p className="db2-kpis__note">30 hari terakhir, dibanding 30 hari sebelumnya</p>
        </div>
      </div>

      <div className="ku-grid-main db2-row2">
        <Card title="Prospek terbaru" actions={<Button size="sm" to="/prospects">Lihat semua</Button>}>
          <div className="db2-gap" />
          <DataTable
            loading={!recent}
            rows={(recent ?? []).slice(0, mobile ? 4 : undefined)}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/prospects/${p.id}`)}
            empty={<EmptyState compact title="Belum ada prospek" description="Prospek dari website, iklan, dan agen tampil di sini." />}
            columns={[
              { key: 'name', header: 'Nama', cell: (p) => <span className="ku-strong">{p.name}</span> },
              { key: 'pkg', header: 'Paket', cell: (p) => (present(p.package_name) ? p.package_name : <span className="ku-muted">Belum pilih paket</span>) },
              {
                key: 'ch',
                header: 'Kanal',
                cell: (p) => <ChannelTag channel={channelOf(p.source_channel, p.agent_id)} detail={present(p.agent_name) ? p.agent_name : null} />,
                // Phone: channel and time share one line ("Agen · Joko · 16 jam lalu").
                mobileCell: (p) => (
                  <span>
                    <ChannelTag channel={channelOf(p.source_channel, p.agent_id)} detail={present(p.agent_name) ? p.agent_name : null} />
                    <span className="ku-muted">{fmtAgo(p.created_at)}</span>
                  </span>
                ),
              },
              { key: 'when', header: 'Masuk', mobile: 'hide', cell: (p) => <span className="ku-muted">{fmtAgo(p.created_at)}</span> },
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
              {hot && hot.prospect_count > 0 && (
                <Notice
                  icon={<Flame className="ku-icon" />}
                  title={`${fmtNumber(hot.prospect_count)} prospek Tertarik belum closing`}
                  meta={`Potensi ${fmtRupiahShort(hot.total_value)} · ${fmtNumber(hot.total_pax)} jamaah`}
                  to="/prospects?status=tertarik"
                />
              )}
              {pendingAgents > 0 && <Notice icon={<UserPlus className="ku-icon" />} title={`${fmtNumber(pendingAgents)} pendaftaran agen baru`} meta="Menunggu persetujuan Anda" to="/agents/pending" />}
              {alerts && alerts.pending_payouts_count > 0 && (
                <Notice icon={<Wallet className="ku-icon" />} title={`${fmtNumber(alerts.pending_payouts_count)} pengajuan pencairan`} meta={`Total ${fmtRupiah(alerts.pending_payouts_total)}`} to="/payouts" />
              )}
              {!(alerts && alerts.uncontacted_prospects_count > 0) && !(hot && hot.prospect_count > 0) && pendingAgents === 0 && !(alerts && alerts.pending_payouts_count > 0) && (
                <EmptyState compact icon={<Inbox className="ku-icon" />} title="Tidak ada yang menunggu" description="Prospek baru, pendaftaran agen, dan pencairan komisi muncul di sini." />
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="ku-grid-main db2-row3">
        <Card title="Keberangkatan terdekat" actions={<Button size="sm" to="/packages">Lihat paket</Button>}>
          {!data ? (
            <div className="db2-gap" />
          ) : data.upcoming_packages.length === 0 ? (
            <EmptyState compact icon={<CalendarDays className="ku-icon" />} title="Belum ada keberangkatan terjadwal" description="Paket terbit dengan tanggal berangkat muncul di sini beserta sisa kursinya." />
          ) : (
            <ul className="db2-seats">
              {data.upcoming_packages.map((pk) => {
                const pct = pk.quota > 0 ? Math.min(100, Math.round((pk.booked_seats / pk.quota) * 100)) : 0;
                return (
                  <li key={pk.id}>
                    <button type="button" className="db2-seats__row" onClick={() => navigate(`/packages/${pk.id}`)}>
                      <span className="db2-seats__main">
                        <span className="db2-seats__name">{pk.name}</span>
                        <span className="ku-muted">Berangkat {fmtDate(pk.departure_date)}</span>
                      </span>
                      <span className="db2-seats__fill">
                        {pk.quota > 0 ? (
                          <>
                            <span className={`db2-seats__left${pk.remaining_seats <= 0 ? ' db2-seats__left--full' : ''}`}>
                              {pk.remaining_seats > 0 ? `Sisa ${fmtNumber(pk.remaining_seats)} kursi` : 'Penuh'}
                            </span>
                            <span className="db2-seats__bar" aria-label={`${fmtNumber(pk.booked_seats)} dari ${fmtNumber(pk.quota)} kursi terisi`}>
                              <span style={{ width: `${pct}%` }} />
                            </span>
                          </>
                        ) : (
                          <span className="ku-muted">{fmtNumber(pk.booked_seats)} jamaah · kuota belum diisi</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Alasan tidak lanjut" description={lostTotal > 0 ? `Dari ${fmtNumber(lostTotal)} prospek tidak lanjut` : undefined}>
          {!data ? (
            <div className="db2-gap" />
          ) : !lost || lost.top_lost_reasons.length === 0 ? (
            <EmptyState compact icon={<Inbox className="ku-icon" />} title="Belum ada alasan tercatat" description="Isi alasan saat menandai prospek Tidak Lanjut, untuk masukan harga dan produk." />
          ) : (
            <ul className="db2-lost">
              {lost.top_lost_reasons.slice(0, 4).map((r) => (
                <li key={r.reason}>
                  <span className="db2-lost__reason">{r.reason}</span>
                  <b>{lostTotal > 0 ? fmtPercent((r.count / lostTotal) * 100) : fmtNumber(r.count)}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AgentSummaryCard />
    </div>
  );
};
