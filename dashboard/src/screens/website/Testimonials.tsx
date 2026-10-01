// Testimoni: what past jamaah said, shown on the homepage.
import React, { useEffect, useState } from 'react';
import { createTestimonial, deleteTestimonial, fetchPackages, fetchTestimonials, updateTestimonial, type TestimonialItem } from '../../services/api';
import { Avatar, Banner, Button, Checkbox, Field, Modal, Select, errorText, type Column } from '../../ui';
import { ContentList, sortOrdered } from './ContentList';

const toPayload = (t: TestimonialItem): Partial<TestimonialItem> => ({ name: t.name, package_name: t.package_name, rating: t.rating, quote: t.quote, avatar_url: t.avatar_url ?? null, display_order: t.display_order, is_active: t.is_active });

const RATINGS = [5, 4, 3, 2, 1].map((r) => ({ value: String(r), label: `${r} dari 5` }));

const TestimonialModal: React.FC<{ item: TestimonialItem | null; nextOrder: number; packages: string[]; onClose: () => void; onSaved: () => void }> = ({ item, nextOrder, packages, onClose, onSaved }) => {
  const [name, setName] = useState(item?.name || '');
  const [pkg, setPkg] = useState(item?.package_name || '');
  const [rating, setRating] = useState(String(item?.rating ?? 5));
  const [quote, setQuote] = useState(item?.quote || '');
  const [active, setActive] = useState(item?.is_active ?? true);
  const [errors, setErrors] = useState<{ name?: string; quote?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Nama jamaah wajib diisi.';
    if (!quote.trim()) next.quote = 'Isi testimoni wajib diisi.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), package_name: pkg.trim(), rating: Number(rating), quote: quote.trim(), avatar_url: item?.avatar_url ?? null, is_active: active, display_order: item?.display_order ?? nextOrder };
      if (item) await updateTestimonial(item.id, body);
      else await createTestimonial(body);
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Gagal menyimpan testimoni'));
      setSaving(false);
    }
  };

  // Offer the travel's package names, keep a free-typed one that is not in the catalog.
  const pkgOptions = [{ value: '', label: 'Tidak disebutkan' }, ...Array.from(new Set([...(pkg ? [pkg] : []), ...packages])).map((p) => ({ value: p, label: p }))];

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Ubah testimoni' : 'Tambah testimoni'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button variant="primary" type="submit" form="ws-testi" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </>
      }
    >
      <form id="ws-testi" className="ag-form" onSubmit={submit} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label="Nama jamaah" error={errors.name} hint="Minta izin jamaah sebelum menampilkan namanya.">
          {(id) => <input id={id} className="ku-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} aria-invalid={Boolean(errors.name)} />}
        </Field>
        <div className="st-grid">
          <Field label="Paket yang diikuti" optional>{(id) => <Select id={id} label="Paket yang diikuti" value={pkg} onChange={setPkg} options={pkgOptions} />}</Field>
          <Field label="Rating">{(id) => <Select id={id} label="Rating" value={rating} onChange={setRating} options={RATINGS} />}</Field>
        </div>
        <Field label="Isi testimoni" error={errors.quote}>
          {(id) => <textarea id={id} className="ku-textarea" rows={4} value={quote} onChange={(e) => setQuote(e.target.value)} maxLength={600} aria-invalid={Boolean(errors.quote)} />}
        </Field>
        <Checkbox checked={active} onChange={setActive} label="Tampilkan di website" />
      </form>
    </Modal>
  );
};

export const Testimonials: React.FC = () => {
  const [items, setItems] = useState<TestimonialItem[]>([]);
  const [packages, setPackages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TestimonialItem | null | 'new'>(null);

  const reload = () =>
    fetchTestimonials()
      .then(setItems)
      .catch((e) => setError(errorText(e, 'Gagal memuat testimoni')))
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
    fetchPackages()
      .then((l) => setPackages(l.filter((p) => p.status !== 'archived').map((p) => p.name)))
      .catch(() => setPackages([]));
  }, []);

  const columns: Column<TestimonialItem>[] = [
    {
      key: 'who',
      header: 'Jamaah',
      cell: (t) => (
        <span className="ku-person">
          <Avatar name={t.name} />
          <span className="ag-name">
            {t.name}
            {t.package_name && <span className="ku-muted">{t.package_name}</span>}
          </span>
        </span>
      ),
    },
    { key: 'quote', header: 'Testimoni', cell: (t) => <span className="ws-quote">{t.quote}</span> },
    { key: 'rating', header: 'Rating', mobile: 'labeled', cell: (t) => `${t.rating}/5` },
  ];

  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      <ContentList
        items={items}
        loading={loading}
        columns={columns}
        noun="testimoni"
        addLabel="Tambah testimoni"
        intro="Cerita jamaah yang sudah berangkat, tampil di beranda sesuai urutan."
        empty="Tambahkan testimoni jamaah yang sudah berangkat bersama travel Anda."
        onAdd={() => setEditing('new')}
        onEdit={setEditing}
        save={(t) => updateTestimonial(t.id, toPayload(t))}
        remove={(t) => deleteTestimonial(t.id)}
        reload={reload}
      />
      {editing && (
        <TestimonialModal
          item={editing === 'new' ? null : editing}
          nextOrder={(sortOrdered(items).at(-1)?.display_order ?? 0) + 1}
          packages={packages}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
};
