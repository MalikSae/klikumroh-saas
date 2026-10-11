'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { capitalizeName } from '@/lib/personName';
import { CustomDropdown } from '../../../../components/CustomDropdown';
import { CityField } from '../../../../components/CityField';
import { MobileContainer } from '../../../../components/MobileContainer';
import { AgentPage } from '../../../../components/agent/AgentPage';
import { AgentPageHeader } from '../../../../components/agent/AgentPageHeader';
import { AgentCard } from '../../../../components/agent/AgentCard';
import { AgentButton } from '../../../../components/agent/AgentButton';
import { jakartaMonthOptions } from '../../../../lib/jakartaTime';
import { readJsonSafe, apiErrorMessage } from '../../../../lib/safeJson';
import './JamaahBaru.css';

// Next 24 months as "YYYY-MM" for the planned departure (plus "belum tahu"), starting at the WIB month:
// the backend rejects months before it.
const departureOptions = (): { value: string; label: string }[] => [{ value: '', label: 'Belum tahu' }, ...jakartaMonthOptions(24)];

interface TenantPackage {
  id: number;
  name: string;
}

interface FormState {
  name: string;
  phone: string;
  package_id: string;
  jumlah_jamaah: number;
  departure_plan: string;
  domicile: string;
  consent: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  phone: '',
  package_id: '', // The package is optional: start with none picked.
  jumlah_jamaah: 1,
  departure_plan: '',
  domicile: '',
  consent: false,
};

// "Tambah jamaah" as a page of its own (it used to be a sheet over the list): the agent records a prospect that
// came through WhatsApp or in person. Saved, it opens the new jamaah's detail page.
export default function AgenJamaahBaruPage() {
  const router = useRouter();
  const [packages, setPackages] = useState<TenantPackage[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => router.push('/agen/jamaah');

  useEffect(() => {
    fetch('/api/public/packages')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setPackages(Array.isArray(data) ? data : []))
      .catch(() => {
        // The package is optional: the form works without the list.
      });
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.replace('/agen/login');
      return;
    }
    fetch('/api/agent/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        // A suspended travel is read-only: there is nothing to add here.
        if (me?.travel_suspended) router.replace('/agen/jamaah');
      })
      .catch(() => {
        // The backend still refuses writes while suspended.
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    if (!form.name.trim()) {
      setError('Nama lengkap jamaah wajib diisi');
      return;
    }
    if (!form.phone.trim()) {
      setError('Nomor WhatsApp jamaah wajib diisi');
      return;
    }
    const cleanDigits = form.phone.trim().replace(/\D/g, '');
    if (!form.consent) {
      setError('Konfirmasi bahwa calon jamaah sudah setuju dihubungi oleh travel.');
      return;
    }
    if (!/^(?:08\d{8,11}|628\d{8,11})$/.test(cleanDigits)) {
      setError('Format nomor WhatsApp tidak valid. Masukkan nomor HP aktif (contoh: 081234567890, min. 10 digit).');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload: {
        name: string;
        phone: string;
        package_id?: number;
        jumlah_jamaah?: number;
        departure_plan?: string;
        domicile?: string;
        consent: boolean;
      } = {
        name: form.name.trim(),
        phone: cleanDigits.startsWith('62') ? '0' + cleanDigits.slice(2) : cleanDigits,
        jumlah_jamaah: Number(form.jumlah_jamaah) || 1,
        consent: form.consent,
      };
      if (form.departure_plan && !form.package_id) payload.departure_plan = form.departure_plan;
      if (form.domicile.trim()) payload.domicile = form.domicile.trim();
      if (form.package_id) payload.package_id = Number(form.package_id);

      const res = await fetch('/api/agent/jamaah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      // A gateway error page is not JSON: show a friendly message, never the parser's.
      const body = await readJsonSafe<{ id?: number; error?: string }>(res);
      if (!res.ok) {
        throw new Error(apiErrorMessage(res.status, body, 'Gagal menambahkan jamaah'));
      }
      // Saved. Replace this page so Back from the detail returns to the list, not to an empty form.
      router.replace(body?.id ? `/agen/jamaah/${body.id}` : '/agen/jamaah');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MobileContainer>
      <AgentPageHeader title="Tambah jamaah" onBack={goBack} />

      <AgentPage>
        <AgentCard as="form" onSubmit={handleSubmit} noValidate>
          <p className="jb-intro">Catat calon jamaah yang mendaftar lewat WhatsApp atau bertemu langsung.</p>

          {error && (
            <p className="jb-error" role="alert">
              {error}
            </p>
          )}

          <div className="jb-field">
            <label className="tw-field-label" htmlFor="jb-name">
              Nama lengkap jamaah <span className="jb-required">*</span>
            </label>
            <input
              id="jb-name"
              type="text"
              required
              autoCapitalize="words"
              placeholder="Contoh: H. Ahmad Subagio"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: capitalizeName(e.target.value) })}
              className="tw-field"
            />
          </div>

          <div className="jb-field">
            <label className="tw-field-label" htmlFor="jb-phone">
              Nomor WhatsApp <span className="jb-required">*</span>
            </label>
            <input
              id="jb-phone"
              type="tel"
              inputMode="tel"
              required
              placeholder="Contoh: 081234567890"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d+]/g, '') })}
              className="tw-field"
            />
            <span className="jb-hint">Format: 08xx atau 628xx (10-13 digit angka)</span>
          </div>

          <div className="jb-field">
            <label className="tw-field-label" htmlFor="jb-package">
              Pilihan paket umroh
            </label>
            <CustomDropdown
              id="jb-package"
              value={form.package_id}
              placeholder="Pilih paket (opsional)"
              options={[{ value: '', label: 'Pilih paket (opsional)' }, ...packages.map((pkg) => ({ value: String(pkg.id), label: pkg.name }))]}
              onChange={(e) => setForm({ ...form, package_id: String(e.target.value) })}
            />
          </div>

          <div className="jb-field">
            <label className="tw-field-label" htmlFor="jb-count">
              Jumlah jamaah
            </label>
            <input
              id="jb-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={form.jumlah_jamaah}
              onChange={(e) => setForm({ ...form, jumlah_jamaah: Math.min(50, parseInt(e.target.value, 10) || 1) })}
              className="tw-field"
            />
          </div>

          {/* Planned departure: only without a package (a package has its own departure date). */}
          {!form.package_id && (
            <div className="jb-field">
              <label className="tw-field-label" htmlFor="jb-departure">
                Rencana berangkat
              </label>
              <CustomDropdown
                id="jb-departure"
                value={form.departure_plan}
                options={departureOptions().map((o) => ({ value: o.value, label: o.label }))}
                onChange={(e) => setForm({ ...form, departure_plan: String(e.target.value) })}
              />
            </div>
          )}

          <CityField
            id="jb-domicile"
            label="Domisili (kota)"
            placeholder="Contoh: Bandung"
            value={form.domicile}
            onChange={(v) => setForm({ ...form, domicile: v })}
            className="jb-field"
            labelClassName="tw-field-label"
            inputClassName="tw-field"
          />

          {/* Consent (UU PDP) */}
          <label className="jb-consent" htmlFor="jb-consent">
            <input
              id="jb-consent"
              type="checkbox"
              checked={form.consent}
              onChange={(e) => setForm({ ...form, consent: e.target.checked })}
            />
            <span>Calon jamaah sudah setuju nama dan nomor WhatsApp-nya disimpan dan dihubungi oleh travel.</span>
          </label>

          <AgentButton type="submit" variant="primary" size="lg" block disabled={submitting}>
            {submitting ? 'Menyimpan...' : 'Simpan jamaah'}
          </AgentButton>
        </AgentCard>
      </AgentPage>
    </MobileContainer>
  );
}
