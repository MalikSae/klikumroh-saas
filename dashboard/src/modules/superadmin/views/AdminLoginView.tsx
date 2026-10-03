import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TerminalSquare } from 'lucide-react';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import { loginStaff } from '../../../services/staffApi';
import './AdminLoginView.css';

// Login typed like a terminal session: one prompt at a time, Enter to continue, no form boxes or buttons.
type Step = 'email' | 'password' | 'verifying';
type LogLine = { kind: 'echo' | 'error'; prompt?: string; text: string };

export const AdminLoginView: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Lines already "printed" above the active prompt.
  const [log, setLog] = useState<LogLine[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setLog((l) => [...l, { kind: 'error', text: 'email wajib diisi' }]);
      return;
    }
    setLog((l) => [...l, { kind: 'echo', prompt: 'login as:', text: value }]);
    setStep('password');
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setLog((l) => [...l, { kind: 'error', text: 'password wajib diisi' }]);
      return;
    }
    setLog((l) => [...l, { kind: 'echo', prompt: 'password:', text: '' }]);
    setStep('verifying');
    try {
      await loginStaff(email.trim(), password);
      navigate('/internal/dashboard', { replace: true });
    } catch (err: any) {
      // fetch() rejects with a TypeError when the server cannot be reached.
      const text =
        err instanceof TypeError
          ? 'server tidak dapat dihubungi, coba lagi'
          : err.message || 'Login gagal. Periksa kembali email dan password.';
      setLog((l) => [...l, { kind: 'error', text }]);
      setPassword('');
      setStep('password');
    }
  };

  // Back to the email prompt: the "ganti email" link (phones have no Esc key) or Esc on a keyboard.
  const backToEmail = () => {
    setPassword('');
    setLog((l) => [...l, { kind: 'echo', prompt: 'password:', text: '' }]);
    setStep('email');
  };

  const onPasswordKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') backToEmail();
  };

  return (
    <div className="term-login">
      <main className="term-window" aria-labelledby="term-title" onClick={() => inputRef.current?.focus()}>
        <div className="term-window__bar">
          <TerminalSquare size={16} aria-hidden="true" />
          <span>staff@klikumroh:~/auth</span>
        </div>

        <div className="term-window__body">
          <h1 id="term-title" className="term-title">
            KlikUmroh <span className="term-title__accent">Internal Console</span>
          </h1>

          <div className="term-log" aria-live="polite">
            {log.map((line, i) =>
              line.kind === 'error' ? (
                <p key={i} className="term-line term-line--error" role="alert">
                  [GAGAL] {line.text}
                </p>
              ) : (
                <p key={i} className="term-line">
                  <span className="term-prompt">{line.prompt}</span> {line.text}
                </p>
              ),
            )}
          </div>

          {step === 'email' && (
            <form onSubmit={submitEmail} className="term-line term-input-line">
              <label htmlFor="term-email" className="term-prompt">
                login as:
              </label>
              <input
                id="term-email"
                ref={inputRef}
                type="email"
                autoComplete="username"
                spellCheck={false}
                autoCapitalize="none"
                enterKeyHint="next"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="term-input"
              />
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={submitPassword} className="term-line term-input-line">
              <label htmlFor="term-password" className="term-prompt">
                password:
              </label>
              <input
                id="term-password"
                ref={inputRef}
                type="password"
                autoComplete="current-password"
                enterKeyHint="go"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onPasswordKey}
                className="term-input"
              />
            </form>
          )}

          {step === 'verifying' && (
            <p className="term-line term-line--muted">
              memverifikasi kredensial<span className="term-cursor" aria-hidden="true" />
            </p>
          )}

          {step !== 'verifying' && (
            <div className="term-hint">
              <span>Enter untuk lanjut</span>
              {step === 'password' && (
                <button type="button" className="term-link" onClick={backToEmail}>
                  ganti email
                </button>
              )}
            </div>
          )}

          <p className="term-foot">
            <span className="term-prompt" aria-hidden="true">#</span> KlikUmroh Multi-Tenant SaaS Platform &copy; 2026
          </p>
        </div>
      </main>
    </div>
  );
};
