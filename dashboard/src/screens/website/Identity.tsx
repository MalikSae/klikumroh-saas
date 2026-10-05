// Identitas: logo, icon, brand color, tagline, about text, and the trust strip under the homepage hero.
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import {
  deleteTenantIcon,
  deleteTenantLogo,
  fetchTenantBranding,
  fetchTenantProfile,
  fetchTenantTrustMetrics,
  updateTenantBranding,
  updateTenantProfile,
  updateTenantTrustMetrics,
  uploadTenantIcon,
  uploadTenantLogo,
  type TenantProfile,
} from '../../services/api';
import { Banner, Button, Field, errorText } from '../../ui';
import { SettingsSection } from '../settings/Section';
import { useFrame } from '../../app/AppFrame';
import { ImageField } from './ImageField';

type Form = { tagline: string; about: string; color: string; rating: string; alumni: string; guarantee: string };
const HEX = /^#[0-9a-fA-F]{6}$/;
// The color input needs some value when the field is empty: start from the dashboard ink token.
const fallbackColor = () => getComputedStyle(document.documentElement).getPropertyValue('--ku-ink').trim() || '';

export const Identity: React.FC = () => {
  const frame = useFrame();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    Promise.all([fetchTenantProfile(), fetchTenantBranding(), fetchTenantTrustMetrics()])
      .then(([p, b, t]) => {
        setProfile(p);
        const f: Form = {
          tagline: p.tagline || '',
          about: p.about_summary || '',
          color: b.brand_primary_color || '',
          rating: t.trust_rating || '',
          alumni: t.trust_alumni_count || '',
          guarantee: t.trust_guarantee || '',
        };
        setSaved(f);
        setForm(f);
      })
      .catch((e) => setError(errorText(e, 'Gagal memuat identitas website')));
  }, []);

  const dirty = useMemo(() => Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved)), [form, saved]);

  if (!form || !saved || !profile) return error ? <Banner tone="danger">{error}</Banner> : <div className="st-loading" aria-busy="true" />;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setDone(false);
    if (k === 'color') setColorError(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // A brand color, once set, cannot be emptied (clearing it used to report success while nothing was
    // saved). A travel that never set one (new travels have none) can still save the other fields.
    if (!form.color.trim() && saved.color) {
      setColorError('Warna brand wajib diisi, format #RRGGBB.');
      return;
    }
    if (form.color.trim() && !HEX.test(form.color)) {
      setColorError('Tulis kode warna 6 digit diawali tanda pagar, format #RRGGBB.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (form.tagline !== saved.tagline || form.about !== saved.about) {
        // The profile PUT replaces the name too (owned by Pengaturan > Profil, maybe changed in another tab
        // since this page loaded): take the current values from the server and change only this page's fields.
        const latest = await fetchTenantProfile();
        setProfile(await updateTenantProfile({ ...latest, tagline: form.tagline.trim() || null, about_summary: form.about.trim() || null }));
      }
      if (form.color !== saved.color && form.color.trim()) await updateTenantBranding(form.color.toUpperCase());
      if (form.rating !== saved.rating || form.alumni !== saved.alumni || form.guarantee !== saved.guarantee) {
        await updateTenantTrustMetrics({ trust_rating: form.rating.trim() || null, trust_alumni_count: form.alumni.trim() || null, trust_guarantee: form.guarantee.trim() || null });
      }
      const next = { ...form, color: form.color.toUpperCase() };
      setSaved(next);
      setForm(next);
      setDone(true);
    } catch (err) {
      setError(errorText(err, 'Gagal menyimpan identitas website'));
    } finally {
      setSaving(false);
    }
  };

  const validColor = HEX.test(form.color) ? form.color : null;

  return (
    <form className="st-form" onSubmit={save} noValidate>
      {error && <Banner tone="danger">{error}</Banner>}

      <SettingsSection title="Logo & ikon" description="Tersimpan langsung saat diunggah.">
        <div className="st-grid">
          <ImageField
            label="Logo"
            hint="Di bagian atas website. PNG transparan, maks. 5 MB."
            url={profile.brand_logo_url}
            shape="wide"
            maxMB={5}
            onUpload={async (f) => (await uploadTenantLogo(f)).brand_logo_url}
            onRemove={async () => void (await deleteTenantLogo())}
            onChange={(u) => setProfile({ ...profile, brand_logo_url: u })}
          />
          <ImageField
            label="Ikon"
            hint="Ikon tab browser. Persegi, min. 256 px."
            url={profile.brand_icon_url}
            maxMB={5}
            onUpload={async (f) => (await uploadTenantIcon(f)).brand_icon_url}
            onRemove={async () => void (await deleteTenantIcon())}
            onChange={(u) => {
              setProfile({ ...profile, brand_icon_url: u });
              frame?.refreshTravel();
            }}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Warna utama" description="Dipakai untuk tombol dan aksen di website.">
        <Field label="Kode warna" error={colorError} hint="Format heksadesimal 6 digit, diawali tanda pagar.">
          {(id) => (
            <div className="ws-color">
              <input type="color" className="ws-color__pick" aria-label="Pilih warna" value={validColor || fallbackColor()} onChange={set('color')} />
              <input id={id} className="ku-input ws-color__hex" value={form.color} onChange={set('color')} placeholder="#RRGGBB" maxLength={7} aria-invalid={Boolean(colorError)} />
            </div>
          )}
        </Field>
      </SettingsSection>

      <SettingsSection title="Tentang travel" description="Tampil di bagian Tentang Kami di beranda.">
        <Field label="Tagline" optional hint="Satu kalimat singkat.">
          {(id) => <input id={id} className="ku-input" value={form.tagline} onChange={set('tagline')} maxLength={160} placeholder="Contoh: Umroh nyaman, dibimbing sampai pulang" />}
        </Field>
        <Field label="Ringkasan" optional>
          {(id) => <textarea id={id} className="ku-textarea" rows={5} value={form.about} onChange={set('about')} />}
        </Field>
        <p className="ku-muted">
          Nama travel, nomor izin PPIU, dan kontak diatur di <Link to="/settings">Pengaturan</Link>.
        </p>
      </SettingsSection>

      <SettingsSection title="Lencana kepercayaan" description="Deretan angka di bawah banner beranda.">
        <div className="st-grid">
          <Field label="Rating" optional hint="Contoh: 4.8">
            {(id) => <input id={id} className="ku-input" inputMode="decimal" value={form.rating} onChange={set('rating')} maxLength={10} />}
          </Field>
          <Field label="Jumlah alumni jamaah" optional hint="Contoh: 12.000+">
            {(id) => <input id={id} className="ku-input" value={form.alumni} onChange={set('alumni')} maxLength={40} />}
          </Field>
        </div>
        <Field label="Jaminan" optional hint="Contoh: Pasti berangkat">
          {(id) => <input id={id} className="ku-input" value={form.guarantee} onChange={set('guarantee')} maxLength={80} />}
        </Field>
        <p className="ku-muted">Isi hanya dengan angka yang benar dan bisa dibuktikan.</p>
      </SettingsSection>

      <div className="st-savebar">
        {done && !dirty && (
          <span className="st-savebar__done" role="status">
            <Check className="ku-icon--sm" aria-hidden="true" /> Perubahan tersimpan
          </span>
        )}
        <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setForm(saved); setColorError(null); }}>
          Batalkan
        </Button>
        <Button type="submit" variant="primary" disabled={!dirty || saving}>
          {saving ? 'Menyimpan...' : 'Simpan perubahan'}
        </Button>
      </div>
    </form>
  );
};
