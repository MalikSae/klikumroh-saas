// Ordered homepage content (banners, testimonials, FAQ): the table order is the website order.
// Move up/down renumbers display_order 1..n; hidden items stay in the list but not on the website.
import React, { useState } from 'react';
import { ArrowDown, ArrowUp, MoreHorizontal, Plus } from 'lucide-react';
import { Banner, Button, DataTable, EmptyState, IconButton, Menu, Modal, Pill, Toolbar, errorText, type Column } from '../../ui';

export interface Ordered {
  id: number;
  display_order: number;
  is_active: boolean;
}

export const sortOrdered = <T extends Ordered>(list: T[]) => [...list].sort((a, b) => a.display_order - b.display_order || a.id - b.id);

export function ContentList<T extends Ordered>({
  items,
  loading,
  columns,
  addLabel,
  intro,
  empty,
  noun,
  onAdd,
  onEdit,
  save,
  remove,
  reload,
}: {
  items: T[];
  loading: boolean;
  columns: Column<T>[];
  addLabel: string;
  intro: React.ReactNode;
  empty: React.ReactNode;
  noun: string;
  onAdd: () => void;
  onEdit: (item: T) => void;
  /** Saves the full item (PUT); the list decides order and visibility. */
  save: (item: T) => Promise<unknown>;
  remove: (item: T) => Promise<unknown>;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<T | null>(null);
  const sorted = sortOrdered(items);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, 'Gagal menyimpan'));
    } finally {
      await reload();
      setBusy(false);
    }
  };

  const move = (item: T, dir: -1 | 1) =>
    run(async () => {
      const list = [...sorted];
      const i = list.findIndex((x) => x.id === item.id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      for (const [k, x] of list.entries()) {
        if (x.display_order !== k + 1) await save({ ...x, display_order: k + 1 });
      }
    });

  const all: Column<T>[] = [
    ...columns,
    { key: 'shown', header: 'Tampil', mobile: 'aside', cell: (x) => (x.is_active ? <Pill tone="green">Tampil</Pill> : <Pill>Disembunyikan</Pill>) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (x) => {
        const i = sorted.findIndex((s) => s.id === x.id);
        return (
          <span className="ag-row-actions" onClick={(e) => e.stopPropagation()}>
            <IconButton size="sm" label="Naikkan urutan" disabled={busy || i === 0} onClick={() => move(x, -1)}>
              <ArrowUp className="ku-icon--sm" />
            </IconButton>
            <IconButton size="sm" label="Turunkan urutan" disabled={busy || i === sorted.length - 1} onClick={() => move(x, 1)}>
              <ArrowDown className="ku-icon--sm" />
            </IconButton>
            <Menu
              label={`Aksi ${noun}`}
              trigger={<MoreHorizontal className="ku-icon--sm" />}
              items={[
                { label: 'Ubah', onClick: () => onEdit(x) },
                { label: x.is_active ? 'Sembunyikan dari website' : 'Tampilkan di website', onClick: () => run(() => save({ ...x, is_active: !x.is_active })) },
                { label: 'Hapus', danger: true, onClick: () => setConfirm(x) },
              ]}
            />
          </span>
        );
      },
    },
  ];

  return (
    <section className="ku-list">
      {error && <Banner tone="danger">{error}</Banner>}
      <Toolbar
        right={
          <Button variant="primary" icon={<Plus className="ku-icon--sm" />} onClick={onAdd}>
            {addLabel}
          </Button>
        }
      >
        <span className="ku-muted">{intro}</span>
      </Toolbar>
      <DataTable columns={all} rows={sorted} rowKey={(x) => x.id} loading={loading} onRowClick={onEdit} empty={<EmptyState compact title={`Belum ada ${noun}`} description={empty} />} />
      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={`Hapus ${noun}?`}
        description="Hilang dari website dan tidak bisa dikembalikan. Pilih Sembunyikan jika hanya ingin menyimpannya."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
              Batal
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                const x = confirm;
                setConfirm(null);
                if (x) run(() => remove(x));
              }}
            >
              Hapus
            </Button>
          </>
        }
      />
    </section>
  );
}
