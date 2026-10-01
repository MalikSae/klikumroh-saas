// One image slot (logo, icon, share image), same pattern as package photos: an empty dashed tile to click,
// or the image with small replace/remove buttons in the corner. Saves immediately.
import React, { useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { getFullImageUrl } from '../../services/api';
import { errorText } from '../../ui';

export const ImageField: React.FC<{
  label: string;
  hint: string;
  url?: string | null;
  shape?: 'square' | 'wide' | 'poster';
  maxMB: number;
  onUpload: (file: File) => Promise<string>;
  onRemove: () => Promise<void>;
  onChange: (url: string | null) => void;
}> = ({ label, hint, url, shape = 'square', maxMB, onUpload, onRemove, onChange }) => {
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setError(null);
    if (!f.type.startsWith('image/')) return setError('Pilih file gambar.');
    if (f.size > maxMB * 1024 * 1024) return setError(`Ukuran maksimal ${maxMB} MB.`);
    setBusy('upload');
    try {
      onChange(await onUpload(f));
    } catch (e) {
      setError(errorText(e, 'Gagal mengunggah gambar'));
    } finally {
      setBusy(null);
      if (ref.current) ref.current.value = '';
    }
  };

  const remove = async () => {
    setBusy('remove');
    setError(null);
    try {
      await onRemove();
      onChange(null);
    } catch (e) {
      setError(errorText(e, 'Gagal menghapus gambar'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ku-field">
      <span className="ku-field__label">{label}</span>
      {url ? (
        <div className={`ws-slot ws-slot--${shape}`}>
          <img src={getFullImageUrl(url)} alt={label} />
          <div className="ws-slot__actions">
            <button type="button" aria-label={`Ganti ${label.toLowerCase()}`} title="Ganti" onClick={() => ref.current?.click()} disabled={Boolean(busy)}>
              <RefreshCw className="ku-icon--sm" aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Hapus ${label.toLowerCase()}`} title="Hapus" onClick={remove} disabled={Boolean(busy)}>
              <Trash2 className="ku-icon--sm" aria-hidden="true" />
            </button>
          </div>
          {busy && <span className="ws-slot__busy">{busy === 'upload' ? 'Mengunggah...' : 'Menghapus...'}</span>}
        </div>
      ) : (
        <button type="button" className={`ws-slot ws-slot--${shape} ws-slot--empty`} onClick={() => ref.current?.click()} disabled={Boolean(busy)}>
          <ImagePlus className="ku-icon" aria-hidden="true" />
          <span>{busy ? 'Mengunggah...' : `Unggah ${label.toLowerCase()}`}</span>
        </button>
      )}
      <div className="ku-field__hint">{hint}</div>
      {error && <div className="ku-field__error" role="alert">{error}</div>}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="st-hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </div>
  );
};
