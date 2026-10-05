// Banner: the homepage slider (image only on the website, 1600 x 700). Title names it here and is the
// image's alt text; an optional link makes the whole banner clickable. No subtitle (removed 1 Oct 2026).
import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { createBanner, deleteBanner, fetchBanners, getFullImageUrl, updateBanner, uploadBannerImage, type BannerItem } from '../../services/api';
import { Banner, Button, Checkbox, Field, Modal, errorText, type Column } from '../../ui';
import { ContentList, sortOrdered } from './ContentList';
import { MB, fitsUploadLimit } from '../../utils/uploadLimit';

const toPayload = (b: BannerItem): Partial<BannerItem> => ({ title: b.title, image_url: b.image_url, subtitle: b.subtitle ?? null, cta_url: b.cta_url ?? null, display_order: b.display_order, is_active: b.is_active });

const BannerModal: React.FC<{ banner: BannerItem | null; nextOrder: number; onClose: () => void; onSaved: () => void }> = ({ banner, nextOrder, onClose, onSaved }) => {
  const [title, setTitle] = useState(banner?.title || '');
  const [cta, setCta] = useState(banner?.cta_url || '');
  const [image, setImage] = useState(banner?.image_url || '');
  const [active, setActive] = useState(banner?.is_active ?? true);
  const [errors, setErrors] = useState<{ title?: string; image?: string; cta?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    if (!f.type.startsWith('image/')) return setErrors({ ...errors, image: 'Pilih file gambar.' });
    if (!fitsUploadLimit(f, 'image', 8 * MB)) return setErrors({ ...errors, image: 'Ukuran maksimal 8 MB.' });
    setUploading(true);
    setErrors({ ...errors, image: undefined });
    try {
      setImage((await uploadBannerImage(f)).image_url);
    } catch (e) {
      setErrors({ ...errors, image: errorText(e, 'Gagal mengunggah gambar') });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'Judul wajib diisi.';
    if (!image) next.image = 'Unggah gambar banner.';
    if (cta.trim() && !/^(https?:\/\/|\/)/.test(cta.trim())) next.cta = 'Awali dengan https:// atau / untuk halaman di website ini.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setError(null);
    try {
      // An older banner keeps the subtitle it already has (not shown anywhere any more).
      const body = { title: title.trim(), subtitle: banner?.subtitle ?? null, cta_url: cta.trim() || null, image_url: image, is_active: active, display_order: banner?.display_order ?? nextOrder };
      if (banner) await updateBanner(banner.id, body);
      else await createBanner(body);
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Gagal menyimpan banner'));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={banner ? 'Ubah banner' : 'Tambah banner'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button variant="primary" type="submit" form="ws-banner" disabled={saving || uploading}>
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </>
      }
    >
      <form id="ws-banner" className="ag-form" onSubmit={submit} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="ku-field">
          <span className="ku-field__label">Gambar</span>
          {image ? (
            <div className="ws-slot ws-slot--banner">
              <img src={getFullImageUrl(image)} alt="Pratinjau banner" />
              <div className="ws-slot__actions">
                <button type="button" aria-label="Ganti gambar banner" title="Ganti" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <RefreshCw className="ku-icon--sm" aria-hidden="true" />
                </button>
                <button type="button" aria-label="Hapus gambar banner" title="Hapus" onClick={() => setImage('')} disabled={uploading}>
                  <Trash2 className="ku-icon--sm" aria-hidden="true" />
                </button>
              </div>
              {uploading && <span className="ws-slot__busy">Mengunggah...</span>}
            </div>
          ) : (
            <button type="button" className={`ws-slot ws-slot--banner ws-slot--empty${errors.image ? ' ws-slot--invalid' : ''}`} onClick={() => fileRef.current?.click()} disabled={uploading}>
              <ImagePlus className="ku-icon" aria-hidden="true" />
              <span>{uploading ? 'Mengunggah...' : 'Unggah gambar banner'}</span>
            </button>
          )}
          <div className="ku-field__hint">Tampil di website dengan rasio 1600 x 700 px. Maks. 8 MB.</div>
          {errors.image && <div className="ku-field__error">{errors.image}</div>}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="st-hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        <Field label="Judul" error={errors.title} hint="Tidak tampil di website; untuk mengenali banner di daftar dan sebagai teks alternatif gambar.">
          {(id) => <input id={id} className="ku-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-invalid={Boolean(errors.title)} />}
        </Field>
        <Field label="Tautan saat banner diklik" optional error={errors.cta} hint="Contoh: /paket/12 untuk membuka satu paket.">
          {(id) => <input id={id} className="ku-input" value={cta} onChange={(e) => setCta(e.target.value)} aria-invalid={Boolean(errors.cta)} />}
        </Field>
        <Checkbox checked={active} onChange={setActive} label="Tampilkan di website" />
      </form>
    </Modal>
  );
};

export const Banners: React.FC = () => {
  const [items, setItems] = useState<BannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BannerItem | null | 'new'>(null);

  const reload = () =>
    fetchBanners()
      .then(setItems)
      .catch((e) => setError(errorText(e, 'Gagal memuat banner')))
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  const columns: Column<BannerItem>[] = [
    {
      key: 'banner',
      header: 'Banner',
      cell: (b) => (
        <span className="pk-cell">
          <img className="ws-thumb" src={getFullImageUrl(b.image_url)} alt="" loading="lazy" />
          <span className="ag-name">
            {b.title}
          </span>
        </span>
      ),
      // Phone card: the banner image across the whole card, title under it.
      mobileMedia: (b) => <img className="ws-mbanner__img" src={getFullImageUrl(b.image_url)} alt="" loading="lazy" />,
      mobileCell: (b) => (
        <span className="ag-name">
          {b.title}
        </span>
      ),
    },
    { key: 'link', header: 'Tautan', mobile: 'labeled', cell: (b) => b.cta_url || <span className="ku-muted">—</span> },
  ];

  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      <ContentList
        items={items}
        loading={loading}
        columns={columns}
        noun="banner"
        addLabel="Tambah banner"
        intro="Banner bergantian di bagian atas beranda, sesuai urutan di tabel."
        empty="Tambahkan banner promo atau foto jamaah untuk bagian atas beranda."
        onAdd={() => setEditing('new')}
        onEdit={setEditing}
        save={(b) => updateBanner(b.id, toPayload(b))}
        remove={(b) => deleteBanner(b.id)}
        reload={reload}
      />
      {editing && (
        <BannerModal
          banner={editing === 'new' ? null : editing}
          nextOrder={(sortOrdered(items).at(-1)?.display_order ?? 0) + 1}
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
