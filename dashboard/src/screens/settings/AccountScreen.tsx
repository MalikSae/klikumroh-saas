// Akun saya: the signed-in admin's own name, email and password.
import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { fetchMyProfile, getStoredToken, getStoredUser, setAuthSession, updateMyPassword, updateMyProfile, type MyProfileItem } from '../../services/api';
import { Banner, Button, Field, errorText } from '../../ui';
import { SettingsSection } from './Section';
import './settings.css';
import { MIN_PASSWORD_LENGTH, passwordLongEnough } from '../../utils/password';

const MIN_PASSWORD = MIN_PASSWORD_LENGTH;

const Saved: React.FC<{ text: string }> = ({ text }) => (
  <span className="st-savebar__done" role="status">
    <Check className="ku-icon--sm" aria-hidden="true" /> {text}
  </span>
);

export const AccountScreen: React.FC = () => {
  const [me, setMe] = useState<MyProfileItem | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDone, setProfileDone] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwErrors, setPwErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyProfile()
      .then((p) => {
        setMe(p);
        setName(p.name);
        setEmail(p.email);
      })
      .catch((e) => setLoadError(errorText(e, 'Gagal memuat data')));
  }, []);

  const profileDirty = Boolean(me && (name.trim() !== me.name || email.trim() !== me.email));

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setProfileError('Nama dan email wajib diisi.');
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      const p = await updateMyProfile({ name: name.trim(), email: email.trim() });
      setMe(p);
      setName(p.name);
      setEmail(p.email);
      setProfileDone(true);
      // Keep the sidebar name in sync with the stored session.
      const token = getStoredToken();
      if (token) setAuthSession(token, { ...getStoredUser(), id: p.id, tenant_id: p.tenant_id, email: p.email, name: p.name, status: p.status });
    } catch (err) {
      setProfileError(errorText(err, 'Gagal menyimpan akun'));
    } finally {
      setProfileSaving(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof pwErrors = {};
    if (!current) errs.current = 'Masukkan password saat ini.';
    // Same rule as the backend: spaces at the start or end do not count, the password is sent as typed.
    if (!passwordLongEnough(next)) errs.next = `Password baru minimal ${MIN_PASSWORD} karakter, tanpa menghitung spasi di awal atau akhir.`;
    if (confirm !== next) errs.confirm = 'Konfirmasi tidak sama dengan password baru.';
    setPwErrors(errs);
    if (Object.keys(errs).length) return;
    setPwSaving(true);
    setPwError(null);
    try {
      await updateMyPassword({ current_password: current, new_password: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setPwDone(true);
    } catch (err) {
      setPwError(errorText(err, 'Gagal mengganti password'));
    } finally {
      setPwSaving(false);
    }
  };

  if (loadError) return <Banner tone="danger">{loadError}</Banner>;
  if (!me) return <div className="st-loading" aria-busy="true" />;

  return (
    <div className="st">
      <form className="st-form" onSubmit={saveProfile} noValidate>
        <SettingsSection title="Profil" description="Email ini dipakai untuk masuk ke dashboard.">
          {profileError && <Banner tone="danger">{profileError}</Banner>}
          <Field label="Nama">{(id) => <input id={id} className="ku-input" value={name} onChange={(e) => { setName(e.target.value); setProfileDone(false); }} />}</Field>
          <Field label="Email">{(id) => <input id={id} className="ku-input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setProfileDone(false); }} />}</Field>
          <div className="st-actions">
            {profileDone && !profileDirty && <Saved text="Profil tersimpan" />}
            <Button type="submit" variant="primary" disabled={!profileDirty || profileSaving}>
              {profileSaving ? 'Menyimpan...' : 'Simpan profil'}
            </Button>
          </div>
        </SettingsSection>
      </form>

      <form className="st-form" onSubmit={savePassword} noValidate>
        <SettingsSection title="Password" description={`Minimal ${MIN_PASSWORD} karakter.`}>
          {pwError && <Banner tone="danger">{pwError}</Banner>}
          <Field label="Password saat ini" error={pwErrors.current}>
            {(id) => <input id={id} className="ku-input" type="password" autoComplete="current-password" value={current} onChange={(e) => { setCurrent(e.target.value); setPwDone(false); }} aria-invalid={Boolean(pwErrors.current)} />}
          </Field>
          <Field label="Password baru" error={pwErrors.next}>
            {(id) => <input id={id} className="ku-input" type="password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setPwDone(false); }} aria-invalid={Boolean(pwErrors.next)} />}
          </Field>
          <Field label="Ulangi password baru" error={pwErrors.confirm}>
            {(id) => <input id={id} className="ku-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setPwDone(false); }} aria-invalid={Boolean(pwErrors.confirm)} />}
          </Field>
          <div className="st-actions">
            {pwDone && <Saved text="Password diganti" />}
            <Button type="submit" variant="secondary" disabled={pwSaving || !current || !next}>
              {pwSaving ? 'Menyimpan...' : 'Ganti password'}
            </Button>
          </div>
        </SettingsSection>
      </form>
    </div>
  );
};
