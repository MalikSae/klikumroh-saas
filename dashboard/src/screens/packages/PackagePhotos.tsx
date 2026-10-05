// Package gallery: upload (max 10, 8 MB each), reorder, delete. The first photo is the cover on the website.
import React, { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import { deletePackagePhoto, getFullImageUrl, movePackagePhoto, uploadPackagePhoto, type PackagePhoto } from '../../services/api';
import { errorText } from '../../ui';
import { MB, fitsUploadLimit } from '../../utils/uploadLimit';

const MAX_PHOTOS = 10;
// Same 8 MB cap as the server, counted on the whole multipart body (see utils/uploadLimit).
const MAX_BYTES = 8 * MB;

export const PackagePhotos: React.FC<{ packageId: number; photos: PackagePhoto[]; onChange: (p: PackagePhoto[]) => void }> = ({ packageId, photos, onChange }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sorted = [...photos].sort((a, b) => a.sort_order - b.sort_order);

  const upload = async (files: FileList) => {
    setError(null);
    const room = MAX_PHOTOS - sorted.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) setError(`Maksimal ${MAX_PHOTOS} foto per paket. ${files.length - room} foto tidak diunggah.`);
    let next = [...sorted];
    for (const [i, f] of list.entries()) {
      if (!f.type.startsWith('image/')) {
        setError(`${f.name} bukan gambar.`);
        continue;
      }
      if (!fitsUploadLimit(f, 'photo', MAX_BYTES)) {
        setError(`${f.name} lebih dari 8 MB.`);
        continue;
      }
      setBusy(`Mengunggah ${i + 1} dari ${list.length}...`);
      try {
        next = [...next, await uploadPackagePhoto(packageId, f)];
        onChange(next);
      } catch (e) {
        setError(errorText(e, 'Gagal mengunggah foto'));
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const move = async (p: PackagePhoto, dir: 'up' | 'down') => {
    const idx = sorted.findIndex((x) => x.id === p.id);
    const other = sorted[dir === 'up' ? idx - 1 : idx + 1];
    if (!other) return;
    setBusy('Menyimpan urutan...');
    setError(null);
    try {
      await movePackagePhoto(packageId, p.id, dir);
      onChange(sorted.map((x) => (x.id === p.id ? { ...x, sort_order: other.sort_order } : x.id === other.id ? { ...x, sort_order: p.sort_order } : x)));
    } catch (e) {
      setError(errorText(e, 'Gagal memindahkan foto'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: PackagePhoto) => {
    setBusy('Menghapus foto...');
    setError(null);
    try {
      await deletePackagePhoto(packageId, p.id);
      onChange(sorted.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(errorText(e, 'Gagal menghapus foto'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pk-photos">
      <ul className="pk-photos__grid">
        {sorted.map((p, i) => (
          <li key={p.id} className="pk-photo">
            <img src={getFullImageUrl(p.file_path)} alt={`Foto paket ${i + 1}`} loading="lazy" />
            {i === 0 && <span className="pk-photo__cover">Sampul</span>}
            <div className="pk-photo__actions">
              <button type="button" aria-label="Geser ke kiri" disabled={i === 0 || Boolean(busy)} onClick={() => move(p, 'up')}>
                <ArrowLeft className="ku-icon--sm" aria-hidden="true" />
              </button>
              <button type="button" aria-label="Geser ke kanan" disabled={i === sorted.length - 1 || Boolean(busy)} onClick={() => move(p, 'down')}>
                <ArrowRight className="ku-icon--sm" aria-hidden="true" />
              </button>
              <button type="button" aria-label="Hapus foto" disabled={Boolean(busy)} onClick={() => remove(p)}>
                <Trash2 className="ku-icon--sm" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
        {sorted.length < MAX_PHOTOS && (
          <li>
            <button type="button" className="pk-photo-add" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
              <ImagePlus className="ku-icon" aria-hidden="true" />
              <span>{busy && busy.startsWith('Mengunggah') ? busy : 'Tambah foto'}</span>
            </button>
          </li>
        )}
      </ul>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="st-hidden" onChange={(e) => e.target.files && e.target.files.length > 0 && upload(e.target.files)} />
      <div className="ku-field__hint">
        {sorted.length} dari {MAX_PHOTOS} foto. JPG, PNG, atau WebP, maksimal 8 MB. Foto pertama jadi sampul di website.
        {busy && !busy.startsWith('Mengunggah') ? ` ${busy}` : ''}
      </div>
      {error && <div className="ku-field__error" role="alert">{error}</div>}
    </div>
  );
};

/** Photos picked before the package exists: kept in the browser and uploaded, in this order, on save. */
export const PendingPhotos: React.FC<{ files: File[]; onChange: (f: File[]) => void; disabled?: boolean }> = ({ files, onChange, disabled }) => {
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const urls = React.useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  React.useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const add = (list: FileList) => {
    setError(null);
    const room = MAX_PHOTOS - files.length;
    const picked: File[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith('image/')) setError(`${f.name} bukan gambar.`);
      else if (!fitsUploadLimit(f, 'photo', MAX_BYTES)) setError(`${f.name} lebih dari 8 MB.`);
      else if (picked.length < room) picked.push(f);
      else setError(`Maksimal ${MAX_PHOTOS} foto per paket.`);
    }
    onChange([...files, ...picked]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const move = (i: number, dir: -1 | 1) => {
    const next = [...files];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };

  return (
    <div className="pk-photos">
      <ul className="pk-photos__grid">
        {files.map((_, i) => (
          <li key={urls[i]} className="pk-photo">
            <img src={urls[i]} alt={`Foto paket ${i + 1}`} />
            {i === 0 && <span className="pk-photo__cover">Sampul</span>}
            <div className="pk-photo__actions">
              <button type="button" aria-label="Geser ke kiri" disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                <ArrowLeft className="ku-icon--sm" aria-hidden="true" />
              </button>
              <button type="button" aria-label="Geser ke kanan" disabled={disabled || i === files.length - 1} onClick={() => move(i, 1)}>
                <ArrowRight className="ku-icon--sm" aria-hidden="true" />
              </button>
              <button type="button" aria-label="Hapus foto" disabled={disabled} onClick={() => onChange(files.filter((_, k) => k !== i))}>
                <Trash2 className="ku-icon--sm" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
        {files.length < MAX_PHOTOS && (
          <li>
            <button type="button" className="pk-photo-add" onClick={() => fileRef.current?.click()} disabled={disabled}>
              <ImagePlus className="ku-icon" aria-hidden="true" />
              <span>Tambah foto</span>
            </button>
          </li>
        )}
      </ul>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="st-hidden" onChange={(e) => e.target.files && e.target.files.length > 0 && add(e.target.files)} />
      <div className="ku-field__hint">
        {files.length} dari {MAX_PHOTOS} foto. JPG, PNG, atau WebP, maksimal 8 MB. Diunggah saat paket disimpan; foto pertama jadi sampul.
      </div>
      {error && <div className="ku-field__error" role="alert">{error}</div>}
    </div>
  );
};
