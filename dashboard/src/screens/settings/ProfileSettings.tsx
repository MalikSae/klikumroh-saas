// Profil travel: business identity and contact details shown on the travel website.
import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import {
  fetchTenantContactLegal,
  fetchTenantProfile,
  setStoredTravelName,
  updateTenantContactLegal,
  updateTenantProfile,
  type TenantContactLegal,
  type TenantProfile,
} from '../../services/api';
import { Banner, Button, Field, errorText } from '../../ui';
import { SettingsSection } from './Section';
import { useFrame } from '../../app/AppFrame';

type Form = {
  name: string;
  ppiu_number: string;
  whatsapp_number: string;
  phone: string;
  email: string;
  address: string;
  social_instagram: string;
  social_facebook: string;
  social_youtube: string;
};

const EMPTY: Form = { name: '', ppiu_number: '', whatsapp_number: '', phone: '', email: '', address: '', social_instagram: '', social_facebook: '', social_youtube: '' };

const toForm = (p: TenantProfile, c: TenantContactLegal): Form => ({
  name: p.name || '',
  ppiu_number: c.ppiu_number || '',
  whatsapp_number: c.whatsapp_number || '',
  phone: c.phone || '',
  email: c.email || '',
  address: c.address || '',
  social_instagram: c.social_instagram || '',
  social_facebook: c.social_facebook || '',
  social_youtube: c.social_youtube || '',
});

const orNull = (v: string) => (v.trim() ? v.trim() : null);

export const ProfileSettings: React.FC = () => {
  const frame = useFrame();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [saved, setSaved] = useState<Form>(EMPTY);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // The contact endpoint is a full PUT: never show the form with empty values when the load failed,
  // or saving would wipe PPIU, address and the rest.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    Promise.all([fetchTenantProfile(), fetchTenantContactLegal()])
      .then(([p, c]) => {
        setProfile(p);
        const f = toForm(p, c);
        setSaved(f);
        setForm(f);
      })
      .catch((e) => setLoadError(errorText(e, 'Gagal memuat data')))
      .finally(() => setLoading(false));
  }, [attempt]);

  const retryLoad = () => {
    setLoading(true);
    setLoadError(null);
    setAttempt((n) => n + 1);
  };

  const dirty = useMemo(() => (Object.keys(form) as Array<keyof Form>).some((k) => form[k] !== saved[k]), [form, saved]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setDone(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setNameError('Nama travel wajib diisi.');
      return;
    }
    setNameError(null);
    setSaving(true);
    setError(null);
    try {
      let nextProfile = profile;
      if (profile && form.name.trim() !== saved.name) {
        // The profile PUT replaces the tagline and about text too (owned by Website > Identitas, maybe changed
        // in another tab since this page loaded): take them fresh from the server and change only the name.
        const latest = await fetchTenantProfile();
        nextProfile = await updateTenantProfile({ ...latest, name: form.name.trim() });
        setProfile(nextProfile);
        setStoredTravelName(nextProfile.name);
        frame?.refreshTravel();
      }
      const contact = await updateTenantContactLegal({
        ppiu_number: orNull(form.ppiu_number),
        whatsapp_number: orNull(form.whatsapp_number),
        phone: orNull(form.phone),
        email: orNull(form.email),
        address: orNull(form.address),
        social_instagram: orNull(form.social_instagram),
        social_facebook: orNull(form.social_facebook),
        social_youtube: orNull(form.social_youtube),
      });
      const f = toForm(nextProfile ?? { name: form.name }, contact);
      setSaved(f);
      setForm(f);
      setDone(true);
    } catch (err) {
      setError(errorText(err, 'Gagal menyimpan profil travel'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="st-loading" aria-busy="true" />;
  if (loadError || !profile)
    return (
      <Banner tone="danger" action={<Button size="sm" onClick={retryLoad}>Coba lagi</Button>}>
        {loadError || 'Gagal memuat data'}
      </Banner>
    );

  return (
    <form className="st-form" onSubmit={save} noValidate>
      {error && <Banner tone="danger">{error}</Banner>}

      <SettingsSection title="Identitas travel" description="Tampil di website, dashboard agen, dan tagihan.">
        <Field label="Nama travel" error={nameError}>
          {(id) => <input id={id} className="ku-input" value={form.name} onChange={set('name')} aria-invalid={Boolean(nameError)} maxLength={120} />}
        </Field>
        <Field label="Nomor izin PPIU" optional hint="Ditampilkan di website agar calon jamaah yakin travel Anda berizin.">
          {(id) => <input id={id} className="ku-input" value={form.ppiu_number} onChange={set('ppiu_number')} placeholder="Contoh: 91202xxxxxxx" />}
        </Field>
      </SettingsSection>

      <SettingsSection title="Kontak" description="Cara calon jamaah menghubungi travel Anda.">
        <Field label="Nomor WhatsApp" optional hint="Dipakai di portal agen agar agen bisa menghubungi travel, dan tampil di footer website bila telepon kantor kosong. Format 08xx atau 62xx.">
          {(id) => <input id={id} className="ku-input" inputMode="tel" value={form.whatsapp_number} onChange={set('whatsapp_number')} placeholder="0812xxxxxxxx" />}
        </Field>
        <div className="st-grid">
          <Field label="Telepon kantor" optional>
            {(id) => <input id={id} className="ku-input" inputMode="tel" value={form.phone} onChange={set('phone')} />}
          </Field>
          <Field label="Email" optional>
            {(id) => <input id={id} className="ku-input" type="email" value={form.email} onChange={set('email')} />}
          </Field>
        </div>
        <Field label="Alamat kantor" optional>
          {(id) => <textarea id={id} className="ku-textarea" rows={3} value={form.address} onChange={set('address')} />}
        </Field>
      </SettingsSection>

      <SettingsSection title="Media sosial" description="Tautan akun resmi travel, tampil di bagian bawah website.">
        <Field label="Instagram" optional>
          {(id) => <input id={id} className="ku-input" value={form.social_instagram} onChange={set('social_instagram')} placeholder="https://instagram.com/namatravel" />}
        </Field>
        <Field label="Facebook" optional>
          {(id) => <input id={id} className="ku-input" value={form.social_facebook} onChange={set('social_facebook')} placeholder="https://facebook.com/namatravel" />}
        </Field>
        <Field label="YouTube" optional>
          {(id) => <input id={id} className="ku-input" value={form.social_youtube} onChange={set('social_youtube')} placeholder="https://youtube.com/@namatravel" />}
        </Field>
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
