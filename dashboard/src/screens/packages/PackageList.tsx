// Paket list: search, status filter, seats taken; row opens the editor.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImageOff, Plus } from 'lucide-react';
import { fetchPackages, getFullImageUrl, type PackageItem } from '../../services/api';
import { Banner, Button, DataTable, EmptyState, Field, FilterMenu, Pill, SearchField, Select, Toolbar, errorText, fmtDate, fmtRupiah, type Column } from '../../ui';
import { PACKAGE_STATUS } from './packageUtil';

type View = 'current' | 'published' | 'draft' | 'archived' | 'all';

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
      .filter((p) => (view === 'all' ? true : view === 'current' ? p.status !== 'archived' : p.status === view))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        // Upcoming departures first, packages without a date last.
        const da = a.departure_date ? new Date(a.departure_date).getTime() : Infinity;
        const db = b.departure_date ? new Date(b.departure_date).getTime() : Infinity;
        return da - db || a.name.localeCompare(b.name);
      });
  }, [items, view, search]);

  const columns: Column<PackageItem>[] = [
    {
      key: 'name',
      header: 'Paket',
      cell: (p) => {
        const photo = p.photos?.[0];
        return (
          <span className="pk-cell">
            {photo ? (
              <img className="pk-thumb" src={getFullImageUrl(photo.file_path)} alt="" loading="lazy" />
            ) : (
              <span className="pk-thumb pk-thumb--empty" aria-hidden="true">
                <ImageOff className="ku-icon--sm" />
              </span>
            )}
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
    { key: 'seats', header: 'Kursi terisi', mobile: 'stat', cell: (p) => <Seats p={p} /> },
    { key: 'status', header: 'Status', cell: (p) => <Pill tone={PACKAGE_STATUS[p.status].tone}>{PACKAGE_STATUS[p.status].label}</Pill> },
  ];

  return (
    <section className="ku-list pk-list">
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
