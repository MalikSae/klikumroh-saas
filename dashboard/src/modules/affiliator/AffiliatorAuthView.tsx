// Affiliator KlikUmroh: sign up (open to anyone, active at once) and log in.
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Banner, Button, Checkbox, Field, errorText } from '../../ui';
import { PasswordInput } from './PasswordInput';
import { loginAffiliator, registerAffiliator } from '../../services/affiliatorApi';
import brandIcon from '../../assets/icon-klikumroh.svg';
import '@fontsource/instrument-serif/400.css';
import './affiliator.css';

const MIN_PASSWORD = 8;

// Program rules and terms on the public site, read before signing up.
const programUrl = (): string => {
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return `${local ? 'http://localhost:3000' : 'https://klikumroh.id'}/affiliator`;
};

export const AffiliatorAuthView: React.FC<{ mode: 'login' | 'register' }> = ({ mode }) => {
  const navigate = useNavigate();
  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((isRegister && !name.trim()) || !email.trim() || !password) {
      setError(isRegister ? 'Nama, email, dan kata sandi wajib diisi.' : 'Email dan kata sandi wajib diisi.');
      return;
    }
    if (isRegister && password.length < MIN_PASSWORD) {
      setError(`Kata sandi minimal ${MIN_PASSWORD} karakter.`);
      return;
    }
    if (isRegister && !agreed) {
      setError('Setujui syarat dan ketentuan Affiliator KlikUmroh untuk melanjutkan.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isRegister) {
        await registerAffiliator({ name: name.trim(), email: email.trim(), password, whatsapp: whatsapp.trim() || undefined });
      } else {
        await loginAffiliator(email.trim(), password);
      }
      navigate('/affiliator', { replace: true });
    } catch (err) {
      setError(errorText(err, isRegister ? 'Pendaftaran gagal' : 'Gagal masuk'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ku af-auth">
      <div className="af-auth__wrap">
        <a className="af-auth__brand" href={programUrl()} aria-label="KlikUmroh.id, program affiliator">
          <img src={brandIcon} alt="" width={34} height={34} />
          <span className="af-auth__wordmark"><b>Klik</b>Umroh</span>
          <span className="af-auth__badge">.id</span>
        </a>
        <div className="af-auth__panel">
        <div className="af-auth__header">
          <h1 className="af-auth__title">{isRegister ? 'Daftar Affiliator KlikUmroh' : 'Masuk Affiliator'}</h1>
          <p className="af-auth__lead">
            {isRegister ? (
              <>Ajak travel umroh berlangganan KlikUmroh dan dapatkan komisi dari setiap pembayarannya. <a href={programUrl()}>Pelajari programnya</a>.</>
            ) : (
              'Pantau travel yang Anda bawa dan komisi Anda.'
            )}
          </p>
        </div>

        {error && <Banner tone="danger">{error}</Banner>}

        <form className="af-auth__form" onSubmit={submit} noValidate>
          {isRegister && (
            <Field label="Nama lengkap">{(id) => <input id={id} className="ku-input" autoComplete="name" placeholder="Nama lengkap Anda" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          )}
          <Field label="Email">{(id) => <input id={id} className="ku-input" type="email" autoComplete={isRegister ? 'email' : 'username'} spellCheck={false} placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          {isRegister && (
            <Field label="Nomor WhatsApp" optional>
              {(id) => <input id={id} className="ku-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="08xxxxxxxxxx" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />}
            </Field>
          )}
          <Field label="Kata sandi" hint={isRegister ? `Minimal ${MIN_PASSWORD} karakter.` : undefined}>
            {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder={isRegister ? 'Buat kata sandi' : 'Masukkan kata sandi akun'} />}
          </Field>
          {isRegister && (
            <Checkbox
              checked={agreed}
              onChange={setAgreed}
              label={
                <>
                  Saya sudah membaca dan menyetujui{' '}
                  <a href={`${programUrl()}#syarat`} target="_blank" rel="noopener noreferrer">aturan main dan syarat &amp; ketentuan</a>{' '}
                  Affiliator KlikUmroh.
                </>
              }
            />
          )}
          <Button type="submit" variant="primary" block disabled={busy}>
            {busy ? 'Memproses...' : isRegister ? 'Daftar' : 'Masuk'}
          </Button>
        </form>

        <div className="af-auth__footer">
          <p className="af-auth__switch">
            {isRegister ? (
              <>Sudah terdaftar? <Link to="/affiliator/login">Masuk</Link></>
            ) : (
              <>Belum jadi affiliator? <Link to="/affiliator/daftar">Daftar gratis</Link></>
            )}
          </p>
          <a className="af-auth__back" href={programUrl()}>
            <ArrowLeft size={14} aria-hidden="true" /> Kembali ke Program Affiliator
          </a>
        </div>
        </div>
      </div>
    </div>
  );
};
