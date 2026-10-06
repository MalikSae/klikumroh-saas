// Performa kanal: prospects per channel in the period vs the one before, daily trend, ad campaigns.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Inbox } from 'lucide-react';
import { fetchChannelReport, type ChannelReport, type ChannelStat, type DailyTrendItem } from '../../services/api';
import { Banner, Button, Card, ChannelTag, Checkbox, DataTable, EmptyState, Select, Toolbar, errorText, fmtNumber, fmtPercent, type Channel, type Column } from '../../ui';
import { ChannelChart } from '../dashboard/ChannelChart';
import { Tooltip } from '../../modules/superadmin/shared/Tooltip';
import { sourceLabel } from '../../utils/sourceLabel';

// Iklan = prospects whose landing link carried Meta's ad id (ad_id, from {{ad.id}}); decided by the backend.
const ADS_TIP = 'Dihitung dari parameter ad_id di link iklan Meta. Angka iklan resmi ada di Meta Ads Manager.';

const PERIODS = [
  { value: '7', label: '7 hari terakhir' },
  { value: '30', label: '30 hari terakhir' },
  { value: '90', label: '90 hari terakhir' },
  { value: '365', label: '12 bulan terakhir' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const dayLabel = (iso: string) => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** 7 and 30 days per day; 90 days per week; a year per month, so bars stay readable. */
function toTrend(r: ChannelReport): DailyTrendItem[] {
  const item = (date: string, label: string): DailyTrendItem => ({ date, label, organik: 0, meta_ads: 0, agent: 0, total: 0 });
  const add = (t: DailyTrendItem, d: ChannelReport['daily'][number]) => {
    t.organik += d.web;
    t.meta_ads += d.ads;
    t.agent += d.agen;
    t.total += d.web + d.ads + d.agen;
  };
  if (r.days <= 30) {
    return r.daily.map((d) => {
      const t = item(d.date, dayLabel(d.date));
      add(t, d);
      return t;
    });
  }
  const out: DailyTrendItem[] = [];
  const byKey = new Map<string, DailyTrendItem>();
  r.daily.forEach((d, i) => {
    const key = r.days > 90 ? d.date.slice(0, 7) : String(Math.floor(i / 7));
    let t = byKey.get(key);
    if (!t) {
      t = item(key, r.days > 90 ? `${MONTHS[Number(d.date.slice(5, 7)) - 1]} ${d.date.slice(2, 4)}` : dayLabel(d.date));
      byKey.set(key, t);
      out.push(t);
    }
    add(t, d);
  });
  return out;
}

const Delta: React.FC<{ now: number; before: number }> = ({ now, before }) => {
  if (before === 0) return now === 0 ? <span className="ku-muted">—</span> : <span className="ch-delta ch-delta--up">Baru</span>;
  const pct = ((now - before) / before) * 100;
  if (Math.abs(pct) < 0.5) return <span className="ku-muted">0%</span>;
  const up = pct > 0;
  return (
    <span className={`ch-delta ${up ? 'ch-delta--up' : 'ch-delta--down'}`}>
      {up ? <ArrowUpRight className="ku-icon--sm" aria-hidden="true" /> : <ArrowDownRight className="ku-icon--sm" aria-hidden="true" />}
      {fmtPercent(Math.abs(pct))}
    </span>
  );
};

type Row = ChannelStat & { before: number; total?: boolean };

export const ChannelPerformance: React.FC = () => {
  const [days, setDays] = useState('30');
  const [report, setReport] = useState<ChannelReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<Channel, boolean>>({ web: true, ads: true, agen: true });

  useEffect(() => {
    // A slow report for the previous period must not land under the newly picked period's label.
    let alive = true;
    setLoading(true);
    setError(null);
    fetchChannelReport(Number(days))
      .then((r) => { if (alive) setReport(r); })
      .catch((e) => { if (alive) setError(errorText(e, 'Gagal memuat laporan kanal')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [days]);

  const rows: Row[] = useMemo(() => {
    if (!report) return [];
    const list = report.channels.map((c, i) => ({ ...c, before: report.previous[i]?.prospects ?? 0 }));
    const sum = (k: keyof ChannelStat) => list.reduce((a, c) => a + (c[k] as number), 0);
    return [
      ...list,
      { channel: 'web', prospects: sum('prospects'), processed: sum('processed'), closing: sum('closing'), closing_jamaah: sum('closing_jamaah'), lost: sum('lost'), before: list.reduce((a, c) => a + c.before, 0), total: true },
    ];
  }, [report]);

  const trend = useMemo(() => (report ? toTrend(report) : []), [report]);
  const period = PERIODS.find((p) => p.value === days)?.label.toLowerCase() ?? '';

  const columns: Column<Row>[] = [
    {
      key: 'ch',
      header: 'Kanal',
      cell: (r) =>
        r.total ? (
          <b>Semua kanal</b>
        ) : r.channel === 'ads' ? (
          <span className="ch-kanal">
            <ChannelTag channel={r.channel} />
            <Tooltip content={ADS_TIP} align="right" />
          </span>
        ) : (
          <ChannelTag channel={r.channel} />
        ),
    },
    { key: 'prospects', header: 'Prospek', align: 'right', cell: (r) => <b className="ku-num">{fmtNumber(r.prospects)}</b> },
    { key: 'delta', header: 'vs periode sebelumnya', align: 'right', cell: (r) => <Delta now={r.prospects} before={r.before} /> },
    { key: 'processed', header: 'Sudah diproses', align: 'right', cell: (r) => (r.prospects ? fmtPercent((r.processed / r.prospects) * 100) : '—') },
    { key: 'closing', header: 'Closing', align: 'right', cell: (r) => fmtNumber(r.closing) },
    { key: 'pax', header: 'Jamaah', align: 'right', cell: (r) => fmtNumber(r.closing_jamaah) },
    { key: 'conv', header: 'Konversi', align: 'right', cell: (r) => (r.prospects ? fmtPercent((r.closing / r.prospects) * 100) : '—') },
    { key: 'lost', header: 'Tidak lanjut', align: 'right', cell: (r) => fmtNumber(r.lost) },
  ];

  const campaignColumns: Column<ChannelReport['campaigns'][number]>[] = [
    { key: 'src', header: 'Sumber', cell: (c) => sourceLabel(c.source) || <span className="ku-muted">Tanpa sumber</span> },
    { key: 'cmp', header: 'Kampanye', cell: (c) => c.campaign || <span className="ku-muted">Tanpa nama kampanye</span> },
    { key: 'p', header: 'Prospek', align: 'right', cell: (c) => fmtNumber(c.prospects) },
    { key: 'c', header: 'Closing', align: 'right', cell: (c) => fmtNumber(c.closing) },
    { key: 'j', header: 'Jamaah', align: 'right', cell: (c) => fmtNumber(c.closing_jamaah) },
    { key: 'r', header: 'Konversi', align: 'right', cell: (c) => (c.prospects ? fmtPercent((c.closing / c.prospects) * 100) : '—') },
  ];

  return (
    <div className="ch">
      {error && <Banner tone="danger">{error}</Banner>}
      <Toolbar>
        <Select label="Periode" value={days} onChange={setDays} options={PERIODS} />
        <span className="ku-muted">Prospek dihitung dari tanggal masuk; status dilihat hari ini.</span>
      </Toolbar>

      <Card
        title="Prospek masuk"
        actions={
          <>
            <Checkbox checked={visible.web} onChange={(v) => setVisible((s) => ({ ...s, web: v }))} label="Website" />
            <Checkbox checked={visible.ads} onChange={(v) => setVisible((s) => ({ ...s, ads: v }))} label="Iklan" />
            <Checkbox checked={visible.agen} onChange={(v) => setVisible((s) => ({ ...s, agen: v }))} label="Agen" />
          </>
        }
      >
        <div className="db2-legend">
          {(['web', 'ads', 'agen'] as Channel[]).filter((c) => visible[c]).map((c) => (
            <ChannelTag key={c} channel={c} />
          ))}
        </div>
        {loading || !report ? (
          <div className="db2-chart-skeleton" />
        ) : trend.some((d) => d.total > 0) ? (
          <ChannelChart data={trend} visible={visible} />
        ) : (
          <EmptyState icon={<Inbox className="ku-icon" />} title={`Belum ada prospek dalam ${period}`} description="Grafik terisi saat calon jamaah mengisi minat di website, dari iklan, atau lewat link agen." />
        )}
      </Card>

      <section className="ch-block">
        <h2 className="st-section__title">Perbandingan kanal</h2>
        <DataTable columns={columns} rows={rows} rowKey={(r) => (r.total ? 'total' : r.channel)} loading={loading} />
      </section>

      <section className="ch-block">
        <div className="ch-block__head">
          <h2 className="st-section__title">Kampanye iklan</h2>
          <Button size="sm" variant="ghost" to="/tracking">
            Buat link iklan
          </Button>
        </div>
        <DataTable
          columns={campaignColumns}
          rows={report?.campaigns ?? []}
          rowKey={(c) => `${c.source}|${c.campaign}`}
          loading={loading}
          empty={<EmptyState compact title="Belum ada prospek dari iklan" description="Prospek dihitung sebagai Iklan bila iklan Meta memakai Parameter URL iklan Meta dari halaman Iklan & pelacakan." />}
        />
      </section>
    </div>
  );
};
