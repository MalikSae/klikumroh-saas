// Paket list: search, status filter, seats taken; row opens the editor.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImageOff, Plus } from 'lucide-react';
import { fetchPackages, getFullImageUrl, type PackageItem } from '../../services/api';
import { Banner, Button, DataTable, EmptyState, Field, FilterMenu, Metric, MetricStrip, Pill, SearchField, Select, Toolbar, errorText, fmtDate, fmtNumber, fmtPercent, fmtRupiah, fmtRupiahShort, type Column } from '../../ui';
import { isDeparted, packageStatusLabel } from './packageUtil';
import { todayWIB } from '../../utils/datetime';

/** "29 Nov": day and month only, for the one-line note under Sisa kursi (full date in its tooltip). */
const fmtDayMonth = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }) : '—';

type View = 'current' | 'published' | 'departed' | 'draft' | 'archived' | 'all';

const thumb = (p: PackageItem) => {
  const photo = p.photos?.[0];
  return photo ? (
    <img className="pk-thumb" src={getFullImageUrl(photo.file_path)} alt="" loading="lazy" />
  ) : (
    <span className="pk-thumb pk-thumb--empty" aria-hidden="true">
      <ImageOff className="ku-icon--sm" />
    </span>
  );
};

const Seats: React.FC<{ p: PackageItem }> = ({ p }) => {
  const taken = p.seats_taken ?? 0;
  if (!p.quota) return <span className="ku-muted">{taken} terisi</span>;
  const pct = Math.min(100, Math.round((taken / p.quota) * 100));
  const full = taken >= p.quota;
  return (
    <span className="pk-seats">
      <span className={full ? 'pk-seats__full' : undefined}>
        {taken} / {p.quota}
      </span>
      <span className="pk-seats__bar" aria-hidden="true">
        <span className={full ? 'pk-seats__fill pk-seats__fill--full' : 'pk-seats__fill'} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
};

export const PackageList: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('current');

  useEffect(() => {
    fetchPackages()
      .then(setItems)
      .catch((e) => setError(errorText(e, 'Gagal memuat paket')))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      // Departed packages have their own view: they are off the website, so not 'Tayang' any more.
      .filter((p) => {
        if (view === 'all') return true;
        if (view === 'departed') return isDeparted(p);
        if (isDeparted(p)) return false;
        return view === 'current' ? p.status !== 'archived' : p.status === view;
      })
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        // Upcoming departures first, packages without a date last.
        const da = a.departure_date ? new Date(a.departure_date).getTime() : Infinity;
        const db = b.departure_date ? new Date(b.departure_date).getTime() : Infinity;
        return da - db || a.name.localeCompare(b.name);
      });
  }, [items, view, search]);

  // KPIs over the packages on sale: published and not departed yet (seats only where a quota is set).
  const kpi = useMemo(() => {
    const today = todayWIB();
    const live = items.filter((p) => p.status === 'published' && (!p.departure_date || p.departure_date.slice(0, 10) >= today));
    let quota = 0;
    let taken = 0;
    let potential = 0;
    for (const p of live) {
      if (!p.quota) continue;
      const t = Math.min(p.seats_taken ?? 0, p.quota);
      quota += p.quota;
      taken += t;
      potential += (p.quota - t) * (p.price ?? 0);
    }
    const next = live.filter((p) => p.departure_date).sort((a, b) => (a.departure_date ?? '').localeCompare(b.departure_date ?? ''))[0];
    return { live: live.length, drafts: items.filter((p) => p.status === 'draft').length, quota, taken, left: quota - taken, potential, next };
  }, [items]);

  const columns: Column<PackageItem>[] = [
    {
      key: 'name',
      header: 'Paket',
      // Phone: departure date then status under the name, so the name keeps the card width.
      mobileCell: (p) => (
        <span className="pk-cell">
          {thumb(p)}
          <span className="ag-name">
            {p.name}
            <span className="pk-meta">
              <span className="ku-muted">{p.departure_date ? fmtDate(p.departure_date) : 'Tanggal belum diisi'}</span>
              <Pill tone={packageStatusLabel(p).tone}>{packageStatusLabel(p).label}</Pill>
            </span>
          </span>
        </span>
      ),
      cell: (p) => {
        return (
          <span className="pk-cell">
            {thumb(p)}
            <span className="ag-name">
              {p.name}
              <span className="ku-muted">{p.departure_date ? `Berangkat ${fmtDate(p.departure_date)}` : 'Tanggal berangkat belum diisi'}</span>
            </span>
          </span>
        );
      },
    },
    { key: 'price', header: 'Harga mulai', align: 'right', cell: (p) => (p.price ? fmtRupiah(p.price) : <span className="ku-muted">Belum diisi</span>) },
    { key: 'commission', header: 'Komisi agen', align: 'right', cell: (p) => (p.commission_amount ? fmtRupiah(p.commission_amount) : <span className="ku-muted">—</span>) },
    { key: 'seats', header: 'Kursi terisi', mobile: 'labeled', cell: (p) => <Seats p={p} /> },
    { key: 'status', header: 'Status', mobile: 'hide', cell: (p) => <Pill tone={packageStatusLabel(p).tone}>{packageStatusLabel(p).label}</Pill> },
  ];

  return (
    <section className="ku-list pk-list">
      {/* Sales picture of the packages on sale: how full they are and what is still left to sell. */}
      <MetricStrip label="Penjualan paket">
        <Metric label="Paket tayang" value={loading ? '—' : fmtNumber(kpi.live)} note={loading ? undefined : `${fmtNumber(kpi.drafts)} draf`} hint="Paket tayang yang belum berangkat; draf belum tampil di website" />
        <Metric
          label="Kursi terisi"
          value={loading ? '—' : kpi.quota > 0 ? fmtPercent((kpi.taken / kpi.quota) * 100) : '—'}
          note={loading ? undefined : kpi.quota > 0 ? `${fmtNumber(kpi.taken)}/${fmtNumber(kpi.quota)}` : 'Kuota kosong'}
          hint={kpi.quota > 0 ? `${fmtNumber(kpi.taken)} dari ${fmtNumber(kpi.quota)} kursi paket tayang sudah terisi` : 'Kuota kursi paket belum diisi'}
        />
        <Metric
          label="Sisa kursi"
          value={loading ? '—' : fmtNumber(kpi.left)}
          note={loading ? undefined : kpi.next ? `terdekat ${fmtDayMonth(kpi.next.departure_date)}` : 'Belum ada jadwal'}
          hint={kpi.next ? `Keberangkatan terdekat: ${kpi.next.name}, ${fmtDate(kpi.next.departure_date)}` : 'Belum ada keberangkatan terjadwal'}
        />
        <Metric label="Potensi omzet" value={loading ? '—' : fmtRupiahShort(kpi.potential)} note={loading ? undefined : 'sisa kursi'} hint="Jika semua sisa kursi terjual (harga paket x sisa kursi)" />
      </MetricStrip>
      {error && <Banner tone="danger">{error}</Banner>}
      <Toolbar
        right={
          <Button variant="primary" icon={<Plus className="ku-icon--sm" />} to="/packages/new">
            Tambah paket
          </Button>
        }
      >
        <SearchField value={search} onChange={setSearch} placeholder="Cari nama paket" />
        <FilterMenu active={view !== 'current' ? 1 : 0} onReset={() => setView('current')}>
          <Field label="Status">
            {(id) => (
              <Select
                id={id}
                label="Status"
                value={view}
                onChange={(v) => setView(v as View)}
                options={[
                  { value: 'current', label: 'Tayang dan draf' },
                  { value: 'published', label: 'Tayang' },
                  { value: 'departed', label: 'Sudah berangkat' },
                  { value: 'draft', label: 'Draf' },
                  { value: 'archived', label: 'Diarsipkan' },
                  { value: 'all', label: 'Semua' },
                ]}
              />
            )}
          </Field>
        </FilterMenu>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        onRowClick={(p) => navigate(`/packages/${p.id}`)}
        empty={
          items.length === 0 ? (
            <EmptyState compact title="Belum ada paket" description="Tambahkan paket umroh pertama agar calon jamaah bisa memilihnya di website." />
          ) : (
            <EmptyState compact title="Tidak ada paket yang cocok" description="Ubah pencarian atau filter." />
          )
        }
      />
    </section>
  );
};
