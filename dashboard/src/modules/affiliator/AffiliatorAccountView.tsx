// Affiliator account: who I am, the bank account commissions are transferred to, and the password.
import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Banner, Button, Card, CardBody, Field, errorText } from '../../ui';
import { changeAffiliatorPassword, fetchAffiliatorOverview, logoutAffiliator, updateAffiliatorBank, type Affiliator } from '../../services/affiliatorApi';
import { PasswordInput } from './PasswordInput';
import { MIN_PASSWORD_LENGTH as MIN_PASSWORD, passwordLongEnough } from '../../utils/password';
import './affiliator.css';

export const AffiliatorAccountView: React.FC = () => {
  const [me, setMe] = useState<Affiliator | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [holder, setHolder] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwErrors, setPwErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwDone, setPwDone] = useState(false);

  useEffect(() => {
    fetchAffiliatorOverview()
      .then((o) => {
        setMe(o.affiliator);
        setBankName(o.affiliator.bank_name ?? '');
        setAccountNumber(o.affiliator.bank_account_number ?? '');
        setHolder(o.affiliator.bank_account_holder ?? '');
      })
      .catch((e) => setLoadError(errorText(e, 'Gagal memuat akun')));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim() || !accountNumber.trim() || !holder.trim()) {
      setError('Nama bank, nomor rekening, dan nama pemilik wajib diisi.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateAffiliatorBank({ bank_name: bankName.trim(), bank_account_number: accountNumber.trim(), bank_account_holder: holder.trim() });
      setSaved(true);
    } catch (err) {
      setError(errorText(err, 'Gagal menyimpan rekening'));
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof pwErrors = {};
    if (!current) errs.current = 'Masukkan kata sandi saat ini.';
    // Same count as the server (passwordLongEnough): leading/trailing spaces do not count.
    if (!passwordLongEnough(next)) errs.next = `Kata sandi baru minimal ${MIN_PASSWORD} karakter (spasi di awal/akhir tidak dihitung).`;
    if (confirm !== next) errs.confirm = 'Konfirmasi tidak sama dengan kata sandi baru.';
    setPwErrors(errs);
    if (Object.keys(errs).length) return;
    setPwSaving(true);
    setPwError(null);
    try {
      await changeAffiliatorPassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setPwDone(true);
    } catch (err) {
      setPwError(errorText(err, 'Gagal mengganti kata sandi'));
    } finally {
      setPwSaving(false);
    }
  };
  const pwEdit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPwDone(false);
  };

  if (loadError) return <Banner tone="danger">{loadError}</Banner>;
  if (!me) return <p className="af-muted">Memuat...</p>;

  const edit = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setSaved(false);
  };

  return (
    <div className="af-stack">
      <Card title="Profil">
        <CardBody>
          <dl className="af-profile">
            <div><dt>Nama</dt><dd>{me.name}</dd></div>
            <div><dt>Email</dt><dd>{me.email}</dd></div>
            {me.whatsapp && <div><dt>WhatsApp</dt><dd>{me.whatsapp}</dd></div>}
            <div><dt>Kode link</dt><dd>{me.link_code}</dd></div>
          </dl>
        </CardBody>
      </Card>

      <Card title="Rekening pencairan" description="Komisi ditransfer ke rekening ini. Nama pemilik harus sesuai buku tabungan.">
        <CardBody>
          <form className="af-form" onSubmit={save} noValidate>
            {error && <Banner tone="danger">{error}</Banner>}
            <Field label="Nama bank">{(id) => <input id={id} className="ku-input" placeholder="Contoh: BSI" value={bankName} onChange={edit(setBankName)} />}</Field>
            <Field label="Nomor rekening">{(id) => <input id={id} className="ku-input" inputMode="numeric" value={accountNumber} onChange={edit(setAccountNumber)} />}</Field>
            <Field label="Nama pemilik rekening">{(id) => <input id={id} className="ku-input" value={holder} onChange={edit(setHolder)} />}</Field>
            <div className="af-form__actions">
              {saved && (
                <span className="af-saved" role="status">
                  <Check className="ku-icon--sm" aria-hidden="true" /> Rekening disimpan
                </span>
              )}
              <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan rekening'}</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card title="Ganti kata sandi" description="Perangkat lain yang masih masuk akan otomatis keluar.">
        <CardBody>
          <form className="af-form" onSubmit={savePassword} noValidate>
            {pwError && <Banner tone="danger">{pwError}</Banner>}
            <Field label="Kata sandi saat ini" error={pwErrors.current}>
              {(id) => <PasswordInput id={id} autoComplete="current-password" value={current} onChange={pwEdit(setCurrent)} invalid={Boolean(pwErrors.current)} />}
            </Field>
            <Field label="Kata sandi baru" hint={`Minimal ${MIN_PASSWORD} karakter.`} error={pwErrors.next}>
              {(id) => <PasswordInput id={id} autoComplete="new-password" value={next} onChange={pwEdit(setNext)} invalid={Boolean(pwErrors.next)} />}
            </Field>
            <Field label="Ulangi kata sandi baru" error={pwErrors.confirm}>
              {(id) => <PasswordInput id={id} autoComplete="new-password" value={confirm} onChange={pwEdit(setConfirm)} invalid={Boolean(pwErrors.confirm)} />}
            </Field>
            <div className="af-form__actions">
              {pwDone && (
                <span className="af-saved" role="status">
                  <Check className="ku-icon--sm" aria-hidden="true" /> Kata sandi diganti
                </span>
              )}
              <Button type="submit" disabled={pwSaving}>{pwSaving ? 'Menyimpan...' : 'Ganti kata sandi'}</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <div className="af-signout">
        <Button variant="ghost" onClick={() => { void logoutAffiliator().then(() => { window.location.href = '/affiliator/login'; }); }}>
          Keluar
        </Button>
      </div>
    </div>
  );
};
