// Dashboard home "Beranda" (redesign 6 Oct 2026). The page answers one question (design/VISION.md):
// what must I do now, and are results improving? Top to bottom: setup or subscription strip, the results
// of the last 30 days in one metric strip, what waits for action, then the channel chart next to the newest
// prospects, then departures, agents and lost reasons. Phone order is set in dashboard.css.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CircleCheck, Clock, ExternalLink, FileCheck, Flame, Inbox, ListChecks, UserPlus, Wallet } from 'lucide-react';
import {
  cohortRate,
  fetchDashboardAgents,
  fetchPendingPaymentRequests,
  type PaymentRequest,
  fetchOnboardingStatus,
  type OnboardingStatus,
  fetchDashboardOverview,
  fetchProspectPage,
  type ProspectItem,
  type DashboardOverviewData,
} from '../../services/api';
import {
  ActionItem,
  ActionList,
  Banner,
  ArrowLink,
  Button,
  Card,
  ChannelTag,
  CopyButton,
  CHANNEL_LABEL,
  EmptyState,
  Meter,
  Metric,
  MetricStrip,
  RowLink,
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
import { SetupChecklist, type SetupStage } from './SetupChecklist';
import { subscriptionNotice } from '../../app/subscriptionNotice';
import { ChannelChart } from './ChannelChart';
import { AgentSummaryCard } from './AgentSummaryCard';
import { compare, delta } from './kpiMath';
import './dashboard.css';

/** The overview API sends "-" for an empty name. */
const present = (v?: string | null) => !!v && v.trim() !== '' && v.trim() !== '-';

// Per travel (a shared browser, staff or the demo must not hide another travel's checklist).
const hideSetupKey = (tenantId: number) => `klikumroh_hide_setup_${tenantId}`;
const siteViewedKey = (tenantId: number) => `klikumroh_site_viewed_${tenantId}`;
const readValue = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeValue = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preference only */
  }
};
const CHANNELS: Channel[] = ['web', 'ads', 'agen'];
/** channel_attribution keys of the overview API per chart channel. */
const ATTRIBUTION_KEY: Record<Channel, string> = { web: 'organik', ads: 'paid_ads', agen: 'agent' };
const VS_PREVIOUS = 'dibanding 30 hari sebelumnya';

export const DashboardScreen: React.FC = () => {
  const mobile = useIsMobile();
  const frame = useFrame();
  const [data, setData] = useState<DashboardOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAgents, setPendingAgents] = useState(0);
  const [recent, setRecent] = useState<ProspectItem[] | null>(null);
  const [setup, setSetup] = useState<OnboardingStatus | null>(null);
  // Payment proofs from agents waiting for the admin (oldest first), 7 Oct 2026.
  const [proofs, setProofs] = useState<PaymentRequest[]>([]);
  // The chart's own window. The metric strip stays on 30 days: the cohort conversion and the channel
  // closing rates come from the API for a fixed 30-day window.
  const [range, setRange] = useState('30');
  const [visible, setVisible] = useState<Record<Channel, boolean>>({ web: true, ads: true, agen: true });
  const tenantId = frame?.subscription?.tenant_id ?? 0;
  const siteUrl = frame?.siteUrl ?? null;
  // Read from storage on each render (cheap); a change bumps flagTick to render again.
  const [, setFlagTick] = useState(0);
  const setupChoice = tenantId ? readValue(hideSetupKey(tenantId)) : null;
  const siteViewed = tenantId ? readValue(siteViewedKey(tenantId)) === 'true' : false;

  useEffect(() => {
    fetchDashboardOverview().then(setData).catch((e) => setError(e.message || 'Data dashboard tidak dapat dimuat.'));
    fetchProspectPage({}, 1, 6).then((p) => setRecent(p.items)).catch(() => setRecent([]));
    fetchDashboardAgents('pending').then((pending) => setPendingAgents(pending.length)).catch(() => setPendingAgents(0));
    fetchOnboardingStatus().then(setSetup).catch(() => setSetup(null));
    fetchPendingPaymentRequests().then(setProofs).catch(() => setProofs([]));
  }, []);

  const days = data?.kpi_daily ?? [];
  const kpi = useMemo(() => {
    const p = compare(days, (d) => d.prospects);
    const c = compare(days, (d) => d.closing_jamaah);
    const v = compare(days, (d) => d.closing_value ?? 0);
    return {
      value: { value: v.cur, delta: delta(v.cur, v.prev) },
      prospects: { value: p.cur, delta: delta(p.cur, p.prev) },
      jamaah: { value: c.cur, delta: delta(c.cur, c.prev) },
    };
  }, [days]);
  // Conversion is a cohort figure: prospects created in the window and how many of them are Closing now.
  // Dividing closings-by-date by new prospects mixed two groups and could exceed 100%, so there is no
  // previous-period delta for it. An older server without the cohort hides the value.
  const cohort = data?.conversion_cohort ?? null;
  const conversionRate = cohortRate(cohort);

  const notice = subscriptionNotice(frame?.subscription ?? null);
  const totalProspects = data?.kpis.total_prospects ?? 0;
  // Onboarding in three stages (founder decision 7 Oct 2026). Optional by decision: WhatsApp, the PPIU
  // number, package photos and the agent registration fee. Wait for the overview too, so the prospect
  // steps are judged on real data (judging them early flashed the checklist on every visit).
  const markSiteViewed = () => {
    if (tenantId) writeValue(siteViewedKey(tenantId), 'true');
    setFlagTick((t) => t + 1);
  };
  const stages: SetupStage[] = setup && data
    ? [
        {
          key: 'website',
          title: 'Website siap dilihat jamaah',
          steps: [
            { key: 'profile', title: 'Lengkapi profil travel', hint: 'Nama travel dan alamat atau kota kantor.', done: setup.profile, action: <Button size="sm" to="/settings">Lengkapi profil</Button> },
            { key: 'logo', title: 'Pasang logo travel', hint: 'Tampil di bagian atas website dan portal agen.', done: setup.logo, action: <Button size="sm" to="/website">Unggah logo</Button> },
            {
              key: 'package',
              title: 'Tayangkan paket pertama',
              hint: setup.draft_package_id ? 'Paket contoh sudah dibuat. Sesuaikan harga dan tanggal berangkat, lalu tayangkan.' : 'Dengan harga dan tanggal berangkat.',
              done: setup.package_ready,
              action: setup.draft_package_id ? <Button size="sm" to={`/packages/${setup.draft_package_id}`}>Edit paket contoh</Button> : <Button size="sm" to="/packages/new">Tambah paket</Button>,
            },
            { key: 'trust', title: 'Bangun kepercayaan', hint: 'Tambahkan testimoni jamaah atau banner promo.', done: setup.trust, action: <Button size="sm" to="/website/testimonials">Tambah testimoni</Button> },
            {
              key: 'site',
              title: 'Lihat website Anda',
              hint: 'Cek tampilan website seperti yang dilihat calon jamaah.',
              // A travel that already gets prospects clearly has its website running.
              done: siteViewed || setup.prospect,
              action: siteUrl ? <Button size="sm" to={siteUrl} external onClick={markSiteViewed} icon={<ExternalLink className="ku-icon--sm" />}>Buka website</Button> : null,
            },
          ],
        },
        {
          key: 'agents',
          title: 'Siap rekrut agen',
          steps: [
            { key: 'program', title: 'Atur program agen', hint: 'Keuntungan menjadi agen, syarat & ketentuan, dan aturan pencairan.', done: setup.agent_program, action: <Button size="sm" to="/settings/agent-rules">Atur program</Button> },
            {
              key: 'commission',
              title: 'Atur komisi agen',
              hint: 'Isi komisi di setiap paket yang tayang, agar agen tahu yang mereka dapat.',
              done: setup.commission,
              action: <Button size="sm" to={setup.missing_commission_package_id ? `/packages/${setup.missing_commission_package_id}` : '/packages'}>Atur komisi</Button>,
            },
            { key: 'target', title: 'Buat target & reward', hint: 'Dorong agen aktif sejak bulan pertama.', done: setup.target, action: <Button size="sm" to="/programs">Buat target</Button> },
            { key: 'recruit', title: 'Bagikan link pendaftaran agen', hint: 'Kirim ke calon agen: alumni jamaah, ustadz, atau komunitas.', done: setup.agent_registered, action: siteUrl ? <CopyButton value={`${siteUrl}/agen/daftar`}>Salin link pendaftaran</CopyButton> : null },
            { key: 'approve', title: 'Setujui agen pertama', hint: 'Agen yang mendaftar menunggu persetujuan Anda.', done: setup.agent_active, action: <Button size="sm" to="/agents/pending">Lihat pendaftaran</Button> },
          ],
        },
        {
          key: 'jamaah',
          title: 'Tambah jamaah',
          steps: [
            { key: 'prospect', title: 'Dapatkan prospek pertama', hint: 'Bagikan link website ke calon jamaah, grup WhatsApp, atau media sosial.', done: setup.prospect, action: siteUrl ? <CopyButton value={siteUrl}>Salin link website</CopyButton> : null },
            { key: 'followup', title: 'Tindak lanjuti prospek', hint: 'Hubungi prospek baru lalu ubah statusnya ke Dihubungi.', done: setup.followed_up, action: <Button size="sm" to="/prospects?status=baru">Buka prospek</Button> },
            { key: 'pixel', title: 'Pasang pelacakan iklan', hint: 'Meta Pixel dan Conversions API untuk mengukur iklan.', done: setup.pixel, action: <Button size="sm" to="/tracking">Pasang Pixel</Button> },
            { key: 'domain', title: 'Pakai domain sendiri', hint: 'Misalnya www.namatravel.com.', done: setup.custom_domain, action: <Button size="sm" to="/website/domain">Atur domain</Button> },
            { key: 'team', title: 'Undang tim', hint: 'Tambahkan admin lain untuk mengelola prospek.', done: setup.team, action: <Button size="sm" to="/settings/team">Undang tim</Button> },
          ],
        },
      ]
    : [];
  const allSteps = stages.flatMap((st) => st.steps);
  const setupDone = allSteps.filter((st) => st.done).length;
  const setupOpen = allSteps.length > 0 && setupDone < allSteps.length;
  // Once stage 1 and 2 are done, the guide folds away by default (the rest is optional growth work).
  const coreDone = stages.length > 0 && stages.slice(0, 2).every((st) => st.steps.every((x) => x.done));
  const hideSetup = setupChoice === 'hide' || (setupChoice !== 'show' && coreDone);
  const showSetup = setupOpen && !hideSetup;
  // A travel without any prospect yet sees the checklist instead of a page of zeros.
  const fresh = !!data && totalProspects === 0 && showSetup;

  const toggleSetup = (hide: boolean) => {
    if (tenantId) writeValue(hideSetupKey(tenantId), hide ? 'hide' : 'show');
    setFlagTick((t) => t + 1);
  };

  const alerts = data?.urgent_alerts;
  // Hot prospects: interested but not closed yet, the money closest to being collected.
  const hot = data?.pending_pipeline?.stages?.find((st) => st.status === 'tertarik');
  const lost = data?.pipeline_funnel;
  const lostTotal = lost?.tidak_lanjut ?? 0;
  const trend = (data?.prospect_trends ?? []).slice(-Number(range));
  const uncontacted = alerts?.uncontacted_prospects_count ?? 0;
  const hotCount = hot?.prospect_count ?? 0;
  const payouts = alerts?.pending_payouts_count ?? 0;
  const nothingPending = uncontacted === 0 && hotCount === 0 && pendingAgents === 0 && payouts === 0 && proofs.length === 0;

  if (error) {
    return (
      <Banner tone="danger" icon={<AlertTriangle className="ku-icon--sm" />} action={<Button size="sm" onClick={() => window.location.reload()}>Muat ulang</Button>}>
        {error}
      </Banner>
    );
  }

  return (
    // A new travel without prospects: only the checklist (and real to-dos), not a page of zeros.
    <div className={`db2-home${fresh ? ' db2-home--fresh' : ''}${fresh && nothingPending ? ' db2-home--fresh-idle' : ''}`}>
      {notice ? (
        <Strip
          tone={notice.tone}
          icon={<AlertTriangle className="ku-icon" />}
          title={notice.title}
          description={notice.text}
          action={<Button variant="light" to={notice.to}>{notice.action}</Button>}
        />
      ) : showSetup ? (
        <SetupChecklist stages={stages} onHide={() => toggleSetup(true)} />
      ) : (
        setupOpen && (
          <div className="db2-setup-reopen">
            <Button size="sm" variant="ghost" icon={<ListChecks className="ku-icon--sm" />} onClick={() => toggleSetup(false)}>
              Panduan memulai ({setupDone}/{allSteps.length})
            </Button>
          </div>
        )
      )}

      <section className="db2-block db2-block--kpis" aria-labelledby="db2-kpis-title">
        <div className="db2-head">
          <h2 className="db2-head__title" id="db2-kpis-title">Hasil 30 hari terakhir</h2>
          <span className="db2-head__meta">{VS_PREVIOUS}</span>
        </div>
        <MetricStrip label="Hasil 30 hari terakhir">
          <Metric label="Prospek" value={data ? fmtNumber(kpi.prospects.value) : '—'} delta={data ? kpi.prospects.delta : undefined} deltaLabel={VS_PREVIOUS} to="/prospects" toLabel="Buka semua prospek (sepanjang waktu, bukan 30 hari)" />
          <Metric label="Jamaah closing" value={data ? fmtNumber(kpi.jamaah.value) : '—'} delta={data ? kpi.jamaah.delta : undefined} deltaLabel={VS_PREVIOUS} to="/prospects?status=closing" toLabel="Buka semua prospek closing (sepanjang waktu, bukan 30 hari)" />
          <Metric label="Konversi" value={conversionRate !== null ? fmtPercent(conversionRate) : '—'} note={cohort ? `${fmtNumber(cohort.closings)} dari ${fmtNumber(cohort.prospects)}` : undefined} hint={cohort ? `${fmtNumber(cohort.closings)} dari ${fmtNumber(cohort.prospects)} prospek baru dalam 30 hari terakhir sudah closing` : undefined} />
          <Metric label="Estimasi omzet" value={data ? fmtRupiahShort(kpi.value.value) : '—'} delta={data ? kpi.value.delta : undefined} deltaLabel={VS_PREVIOUS} hint="Harga paket x jamaah closing" />
        </MetricStrip>
      </section>

      <section className="db2-block db2-block--todo" aria-labelledby="db2-todo-title">
        <div className="db2-head">
          <h2 className="db2-head__title" id="db2-todo-title">Perlu tindakan</h2>
        </div>
        {!data ? (
          <div className="ku-actions db2-todo-skeleton" aria-hidden="true" />
        ) : nothingPending ? (
          <div className="ku-actions">
            <p className="ku-actions__none">
              <CircleCheck className="ku-icon" aria-hidden="true" />
              Tidak ada yang menunggu tindakan
            </p>
          </div>
        ) : (
          <ActionList label="Perlu tindakan">
            {uncontacted > 0 && <ActionItem urgent icon={<Clock className="ku-icon" />} count={fmtNumber(uncontacted)} text="belum dihubungi" meta="Status Baru" hint="Prospek berstatus Baru yang belum dihubungi" to="/prospects?status=baru" />}
            {hot && hotCount > 0 && (
              <ActionItem
                icon={<Flame className="ku-icon" />}
                count={fmtNumber(hotCount)}
                text="prospek tertarik"
                meta={`${fmtNumber(hot.total_pax)} jamaah · ${fmtRupiahShort(hot.total_value)}`}
                hint={`Prospek tertarik yang belum closing: ${fmtNumber(hot.total_pax)} jamaah, potensi ${fmtRupiahShort(hot.total_value)}`}
                to="/prospects?status=tertarik"
              />
            )}
            {proofs.length > 0 && (
              <ActionItem
                urgent
                icon={<FileCheck className="ku-icon" />}
                count={fmtNumber(proofs.length)}
                text="bukti pembayaran"
                meta="Dari agen, perlu dicek"
                hint="Bukti DP atau pelunasan yang dikirim agen menunggu Anda setujui atau tolak"
                to={`/prospects/${proofs[0].prospect_id}`}
              />
            )}
            {pendingAgents > 0 && <ActionItem icon={<UserPlus className="ku-icon" />} count={fmtNumber(pendingAgents)} text="agen mendaftar" meta="Perlu disetujui" hint="Pendaftaran agen baru menunggu persetujuan Anda" to="/agents/pending" />}
            {alerts && payouts > 0 && (
              <ActionItem icon={<Wallet className="ku-icon" />} count={fmtNumber(payouts)} text="pencairan komisi" meta={fmtRupiah(alerts.pending_payouts_total)} hint={`Pengajuan pencairan komisi menunggu persetujuan, total ${fmtRupiah(alerts.pending_payouts_total)}`} to="/payouts" />
            )}
          </ActionList>
        )}
      </section>

      <div className="db2-row db2-row--main">
        <Card
          title="Prospek per kanal"
          className="db2-chart-card"
          actions={
            <Select
              label="Rentang waktu grafik"
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '7 hari' },
                { value: '14', label: '14 hari' },
                { value: '30', label: '30 hari' },
              ]}
            />
          }
        >
          {/* Legend and series switch in one: tap a channel to hide or show it. */}
          <div className="db2-legend" role="group" aria-label="Tampilkan kanal">
            {CHANNELS.map((c) => (
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
            <div className="db2-rates">
              <h3 className="db2-rates__title">Closing per kanal, 30 hari</h3>
              <ul className="db2-rates__list">
                {CHANNELS.map((c) => {
                  const a = data.channel_attribution.find((x) => x.channel === ATTRIBUTION_KEY[c]);
                  const leads = a?.leads_count ?? 0;
                  const closing = a?.closing_count ?? 0;
                  return (
                    <li key={c}>
                      <span className="db2-rates__name">
                        <i className={`ku-dot ku-dot--${c}`} aria-hidden="true" />
                        {CHANNEL_LABEL[c]}
                      </span>
                      <b className="db2-rates__rate">{leads > 0 ? fmtPercent((closing / leads) * 100) : '—'}</b>
                      <span className="db2-rates__nums">
                        {fmtNumber(closing)} dari {fmtNumber(leads)} prospek
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Prospek terbaru" className="db2-recent" actions={<ArrowLink to="/prospects" label="Lihat semua prospek" />}>
          {!recent ? (
            <div className="db2-list-skeleton" />
          ) : recent.length === 0 ? (
            <EmptyState compact icon={<Inbox className="ku-icon" />} title="Belum ada prospek" description="Prospek dari website, iklan, dan agen tampil di sini." />
          ) : (
            <ul className="ku-rowlist">
              {recent.slice(0, mobile ? 4 : 6).map((p) => (
                <RowLink
                  key={p.id}
                  to={`/prospects/${p.id}`}
                  title={p.name}
                  meta={
                    <>
                      <ChannelTag channel={channelOf(p.source_channel, p.agent_id)} detail={present(p.agent_name) ? p.agent_name : null} />
                      <span>{fmtAgo(p.created_at)}</span>
                    </>
                  }
                  aside={<StatusPill status={p.status} />}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="db2-row db2-row--three">
        <Card title="Keberangkatan terdekat" className="db2-seats" actions={<ArrowLink to="/packages" label="Lihat semua paket" />}>
          {!data ? (
            <div className="db2-list-skeleton" />
          ) : data.upcoming_packages.length === 0 ? (
            <EmptyState compact icon={<CalendarDays className="ku-icon" />} title="Belum ada keberangkatan terjadwal" description="Paket terbit dengan tanggal berangkat muncul di sini beserta sisa kursinya." />
          ) : (
            <ul className="ku-rowlist">
              {data.upcoming_packages.slice(0, 4).map((pk) => (
                <RowLink
                  key={pk.id}
                  to={`/packages/${pk.id}`}
                  title={pk.name}
                  meta={
                    <span>
                      Berangkat {fmtDate(pk.departure_date)}
                      {pk.quota > 0 ? '' : `, ${fmtNumber(pk.booked_seats)} jamaah, kuota belum diisi`}
                    </span>
                  }
                  aside={
                    pk.quota > 0 ? (
                      <span className="db2-seats__fill">
                        <span className={pk.remaining_seats <= 0 ? 'db2-seats__full' : 'db2-seats__left'}>
                          {pk.remaining_seats > 0 ? `Sisa ${fmtNumber(pk.remaining_seats)} kursi` : 'Penuh'}
                        </span>
                        <Meter value={(pk.booked_seats / pk.quota) * 100} label={`${fmtNumber(pk.booked_seats)} dari ${fmtNumber(pk.quota)} kursi terisi`} />
                      </span>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          )}
        </Card>

        <AgentSummaryCard />

        <Card title="Alasan tidak lanjut" className="db2-lost" description={lostTotal > 0 ? `Dari ${fmtNumber(lostTotal)} prospek tidak lanjut` : undefined}>
          {!data ? (
            <div className="db2-list-skeleton" />
          ) : !lost || lost.top_lost_reasons.length === 0 ? (
            <EmptyState compact icon={<Inbox className="ku-icon" />} title="Belum ada alasan tercatat" description="Isi alasan saat menandai prospek Tidak Lanjut, untuk masukan harga dan produk." />
          ) : (
            <ul className="ku-rowlist">
              {lost.top_lost_reasons.slice(0, 5).map((r) => {
                const pct = lostTotal > 0 ? (r.count / lostTotal) * 100 : 0;
                return (
                  <li key={r.reason} className="db2-lost__row">
                    <span className="db2-lost__reason">{r.reason}</span>
                    <b className="db2-lost__pct">{lostTotal > 0 ? fmtPercent(pct) : fmtNumber(r.count)}</b>
                    <Meter value={pct} label={`${fmtNumber(r.count)} dari ${fmtNumber(lostTotal)} prospek`} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};
