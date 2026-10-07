// SEO: how the site appears in Google and when a link is shared, plus the city for local search.
import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { deleteTenantOGImage, fetchTenantSEOGeo, updateTenantSEOGeo, uploadTenantOGImage, type TenantSEOGeo } from '../../services/api';
import { Banner, Button, Field, errorText } from '../../ui';
import { useFrame } from '../../app/AppFrame';
import { SettingsSection } from '../settings/Section';
import { ImageField } from './ImageField';

type Form = { title: string; description: string; keywords: string; city: string; province: string };

const Counter: React.FC<{ n: number; max: number }> = ({ n, max }) => <span className={n > max ? 'ws-count ws-count--over' : 'ws-count'}>{n}/{max} karakter</span>;

export const Seo: React.FC = () => {
  const frame = useFrame();
  const [seo, setSeo] = useState<TenantSEOGeo | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchTenantSEOGeo()
      .then((s) => {
        setSeo(s);
        const f = { title: s.meta_title || '', description: s.meta_description || '', keywords: s.meta_keywords || '', city: s.city || '', province: s.province || '' };
        setSaved(f);
        setForm(f);
      })
      .catch((e) => setError(errorText(e, 'Gagal memuat pengaturan SEO')));
  }, []);

  const dirty = useMemo(() => Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved)), [form, saved]);
  if (!form || !saved || !seo) return error ? <Banner tone="danger">{error}</Banner> : <div className="st-loading" aria-busy="true" />;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setDone(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const n = (v: string) => v.trim() || null;
      setSeo(await updateTenantSEOGeo({ meta_title: n(form.title), meta_description: n(form.description), meta_keywords: n(form.keywords), city: n(form.city), province: n(form.province) }));
      setSaved(form);
      setDone(true);
    } catch (err) {
      setError(errorText(err, 'Gagal menyimpan pengaturan SEO'));
    } finally {
      setSaving(false);
    }
  };

  const site = frame?.siteUrl || '';
  const travel = frame?.subscription?.tenant_name || '';

  return (
    <form className="st-form" onSubmit={save} noValidate>
      {error && <Banner tone="danger">{error}</Banner>}

      <SettingsSection title="Hasil pencarian Google" description="Judul dan deskripsi yang tampil di Google.">
        <div className="ws-serp" aria-label="Pratinjau hasil pencarian">
          <span className="ws-serp__url">{site.replace(/^https?:\/\//, '')}</span>
          <span className="ws-serp__title">{form.title || travel || 'Nama travel'}</span>
          <span className="ws-serp__desc">{form.description || 'Deskripsi website travel Anda tampil di sini.'}</span>
        </div>
        <Field label="Judul halaman" optional hint={<Counter n={form.title.length} max={60} />}>
          {(id) => <input id={id} className="ku-input" value={form.title} onChange={set('title')} maxLength={255} placeholder={travel ? `${travel} - Paket Umroh Resmi` : ''} />}
        </Field>
        <Field label="Deskripsi" optional hint={<Counter n={form.description.length} max={160} />}>
          {(id) => <textarea id={id} className="ku-textarea" rows={3} value={form.description} onChange={set('description')} maxLength={500} />}
        </Field>
        <Field label="Kata kunci" optional hint="Pisahkan dengan koma. Contoh: umroh bandung, umroh murah.">
          {(id) => <input id={id} className="ku-input" value={form.keywords} onChange={set('keywords')} maxLength={255} />}
        </Field>
      </SettingsSection>

      <SettingsSection title="Lokasi" description="Membantu travel muncul di pencarian umroh di kota Anda.">
        <div className="st-grid">
          <Field label="Kota" optional>{(id) => <input id={id} className="ku-input" value={form.city} onChange={set('city')} placeholder="Bandung" />}</Field>
          <Field label="Provinsi" optional>{(id) => <input id={id} className="ku-input" value={form.province} onChange={set('province')} placeholder="Jawa Barat" />}</Field>
        </div>
      </SettingsSection>

      <SettingsSection title="Gambar saat dibagikan" description="Tampil saat link website dikirim di WhatsApp atau media sosial.">
        <ImageField
          label="Gambar share"
          hint="1200 x 630 px disarankan, maks. 5 MB."
          url={seo.og_image_url}
          shape="wide"
          maxMB={5}
          onUpload={async (f) => (await uploadTenantOGImage(f)).og_image_url}
          onRemove={async () => void (await deleteTenantOGImage())}
          onChange={(u) => setSeo({ ...seo, og_image_url: u })}
        />
      </SettingsSection>

      <div className="st-savebar">
        {done && !dirty && (
          <span className="st-savebar__done" role="status">
            <Check className="ku-icon--sm" aria-hidden="true" /> Perubahan tersimpan
          </span>
        )}
        <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => setForm(saved)}>
          Batalkan
        </Button>
        <Button type="submit" variant="primary" disabled={!dirty || saving}>
          {saving ? 'Menyimpan...' : 'Simpan perubahan'}
        </Button>
      </div>
    </form>
  );
};
