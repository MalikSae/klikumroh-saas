'use client';

// /demo: short form, then one-click sign-in to the dashboard of the demo travel (demo.klikumroh.id), linked
// from "Coba demo" on the landing page. The form (name, WhatsApp, travel name, city, consent) tells KlikUmroh
// who tried the demo; the API refuses the sign-in without it. No password is shared: POST
// /api/auth/demo-login only works for the travel marked is_demo, and what it may change is limited on the
// server (middleware.DemoGuard).
import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { dashboardUrl, openDashboard, storeDashboardSession } from '@/lib/dashboardSession';
import { AuthCard, AuthPage, PrimaryButton, TextField } from '@/components/marketing/ui';
import regencies from '../../data/indonesia-regencies.json';
import styles from './demo.module.css';

// Domisili is one of Indonesia's kota/kabupaten (the same list the agent portal and the dashboard use).
const REGENCIES = (regencies as Array<{ code: string; name: string }>).map((r) => ({
  name: r.name,
  key: r.name.toLowerCase().replace(/^(kota|kabupaten)\s+/, ''),
}));
const MAX_SUGGESTIONS = 6;
const MAX_PHONE_DIGITS = 15;

/** Where the visitor came from, for the lead list: utm_* of the link, or the referring site. */
function visitSource(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const parts: string[] = [];
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'ref']) {
      const value = params.get(key);
      if (value) parts.push(`${key}=${value}`);
    }
    if (parts.length === 0 && document.referrer) parts.push(`referrer=${new URL(document.referrer).hostname}`);
    return parts.join('&').slice(0, 160);
  } catch {
    return '';
  }
}

export default function DemoLoginPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [travelName, setTravelName] = useState('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityActive, setCityActive] = useState(0);
  const [cityError, setCityError] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const q = city.trim().toLowerCase().replace(/^(kota|kabupaten|kab\.?)\s+/, '');
    if (q.length < 2) return [];
    const starts = REGENCIES.filter((r) => r.key.startsWith(q));
    const contains = REGENCIES.filter((r) => !r.key.startsWith(q) && r.key.includes(q));
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS).map((r) => r.name);
  }, [city]);
  const showSuggestions = cityOpen && suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0] === city);

  const pickCity = (name: string) => {
    setCity(name);
    setCityError(null);
    setCityOpen(false);
  };
  const cityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCityActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCityActive((a) => (a - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pickCity(suggestions[cityActive]);
    } else if (e.key === 'Escape') {
      setCityOpen(false);
    }
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    // Typed text must match a kota/kabupaten of the list (compared without case), then it is sent in full.
    const match = REGENCIES.find((r) => r.name.toLowerCase() === city.trim().toLowerCase());
    if (!match) {
      setCityError('Pilih kota atau kabupaten dari daftar saran.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, travel_name: travelName, city: match.name, consent, source: visitSource() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(res.status === 404 ? 'Demo sedang disiapkan. Coba lagi beberapa saat lagi.' : data.error || 'Demo belum bisa dibuka.');
      }
      storeDashboardSession(data);
      openDashboard(dashboardUrl(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo belum bisa dibuka.');
      setLoading(false);
    }
  };

  return (
    <AuthPage>
      <AuthCard
        title="Coba dashboard demo"
        subtitle="Isi data singkat, lalu dashboard demo langsung terbuka. Tidak perlu membuat akun."
        error={error}
        brandHref="/"
        trust="Data hanya dipakai tim KlikUmroh untuk membantu Anda"
      >
        <form onSubmit={submit} className={styles.form} noValidate>
          <TextField id="demo-name" label="Nama lengkap" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Siti Aminah" autoComplete="name" required readOnly={loading} />
          <TextField id="demo-phone" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={MAX_PHONE_DIGITS} label="Nomor WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, MAX_PHONE_DIGITS))} placeholder="Contoh: 081234567890" autoComplete="tel" required readOnly={loading} />
          <TextField id="demo-travel" label="Nama travel" value={travelName} onChange={(e) => setTravelName(e.target.value)} placeholder="Contoh: Barokah Tours" autoComplete="organization" required readOnly={loading} />
          <div className={styles.cityWrap}>
            <TextField
              id="demo-city"
              label="Domisili travel"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setCityError(null);
                setCityActive(0);
                setCityOpen(true);
              }}
              onFocus={() => setCityOpen(true)}
              onBlur={() => window.setTimeout(() => setCityOpen(false), 120)}
              onKeyDown={cityKeyDown}
              error={cityError}
              placeholder="Contoh: Kota Bandung"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              aria-controls="demo-city-list"
              required
              readOnly={loading}
            />
            {showSuggestions && (
              <ul id="demo-city-list" role="listbox" className={styles.suggest}>
                {suggestions.map((name, i) => (
                  <li key={name} role="option" aria-selected={i === cityActive}>
                    <button type="button" className={i === cityActive ? styles.suggestActive : undefined} onMouseDown={(e) => { e.preventDefault(); pickCity(name); }}>
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className={styles.consent}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={loading} />
            <span>Saya setuju tim KlikUmroh menghubungi saya lewat WhatsApp terkait demo dan layanan KlikUmroh.</span>
          </label>
          <PrimaryButton type="submit" loading={loading} loadingText="Menyiapkan demo...">
            <span>Buka dashboard demo</span>
            <ArrowRight size={16} />
          </PrimaryButton>
        </form>
      </AuthCard>
    </AuthPage>
  );
}
