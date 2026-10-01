// Aturan komisi & pendaftaran: upline override, when commission becomes withdrawable, minimum payout,
// and what a new agent sees and pays when registering. Commission per jamaah is set on each package.
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import {
  deleteAgentPoster,
  fetchCommissionReleasePolicy,
  fetchCommissionSettings,
  fetchTenantAgentSettings,
  updateCommissionReleasePolicy,
  updateCommissionSettings,
  updateTenantAgentSettings,
  uploadAgentPoster,
  type CommissionReleaseOn,
  type TenantAgentSettings,
} from '../../services/api';
import { Banner, Button, Checkbox, Field, errorText, fmtRupiah } from '../../ui';
import { SettingsSection } from '../settings/Section';
import { ImageField } from '../website/ImageField';
import '../website/website.css';
import './programs.css';

type Form = {
  overrideOn: boolean;
  overridePct: string;
  releaseOn: CommissionReleaseOn;
  minPayout: string;
  fee: string;
  bankName: string;
  bankNumber: string;
  bankHolder: string;
  benefits: string;
  terms: string;
};

const num = (v: string) => {
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return v.trim() === '' || Number.isNaN(n) ? null : n;
};

export const Rules: React.FC = () => {
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [agentSettings, setAgentSettings] = useState<TenantAgentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    Promise.all([fetchCommissionSettings(), fetchCommissionReleasePolicy(), fetchTenantAgentSettings()])
      .then(([c, r, a]) => {
        const f: Form = {
          overrideOn: c.commission_override_enabled,
          overridePct: c.commission_override_percentage != null ? String(c.commission_override_percentage) : '',
          releaseOn: r,
          minPayout: a.minimum_payout_amount ? String(a.minimum_payout_amount) : '',
          fee: a.agent_registration_fee ? String(a.agent_registration_fee) : '',
          bankName: a.agent_bank_name || '',
          bankNumber: a.agent_bank_account_number || '',
          bankHolder: a.agent_bank_account_holder || '',
          benefits: a.agent_registration_benefits || '',
          terms: a.agent_terms_conditions || '',
        };
        setAgentSettings(a);
        setSaved(f);
        setForm(f);
      })
      .catch((e) => setError(errorText(e, 'Gagal memuat aturan agen')))
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(() => Boolean(form && saved && (Object.keys(form) as Array<keyof Form>).some((k) => form[k] !== saved[k])), [form, saved]);

  if (loading) return <div className="st-loading" aria-busy="true" />;
  if (!form || !saved) return <Banner tone="danger">{error || 'Gagal memuat aturan agen.'}</Banner>;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setDone(false);
  };
  const input = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never);

  const fee = num(form.fee) ?? 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof fieldErrors = {};
    const pct = num(form.overridePct);
    if (form.overrideOn && (pct === null || pct <= 0 || pct > 100)) errs.overridePct = 'Isi persentase antara 0 dan 100.';
    const minPayout = num(form.minPayout);
    if (minPayout !== null && minPayout < 0) errs.minPayout = 'Tidak boleh negatif.';
    const feeVal = num(form.fee);
    if (feeVal !== null && feeVal < 0) errs.fee = 'Tidak boleh negatif.';
    if ((feeVal ?? 0) > 0) {
      if (!form.bankName.trim()) errs.bankName = 'Wajib diisi jika ada biaya pendaftaran.';
      if (!form.bankNumber.trim()) errs.bankNumber = 'Wajib diisi jika ada biaya pendaftaran.';
      if (!form.bankHolder.trim()) errs.bankHolder = 'Wajib diisi jika ada biaya pendaftaran.';
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setError(null);
    try {
      if (form.overrideOn !== saved.overrideOn || form.overridePct !== saved.overridePct) {
        await updateCommissionSettings(form.overrideOn, form.overrideOn ? pct : null);
      }
      if (form.releaseOn !== saved.releaseOn) await updateCommissionReleasePolicy(form.releaseOn);
      const agentKeys: Array<keyof Form> = ['minPayout', 'fee', 'bankName', 'bankNumber', 'bankHolder', 'benefits', 'terms'];
      if (agentKeys.some((k) => form[k] !== saved[k])) {
        const next: TenantAgentSettings = {
          ...(agentSettings as TenantAgentSettings),
          minimum_payout_amount: minPayout,
          agent_registration_fee: feeVal,
          agent_bank_name: form.bankName.trim() || null,
          agent_bank_account_number: form.bankNumber.trim() || null,
          agent_bank_account_holder: form.bankHolder.trim() || null,
          agent_registration_benefits: form.benefits.trim() || null,
          agent_terms_conditions: form.terms.trim() || null,
        };
        await updateTenantAgentSettings(next);
        setAgentSettings(next);
      }
      setSaved(form);
      setDone(true);
    } catch (err) {
      setError(errorText(err, 'Gagal menyimpan aturan'));
    } finally {
      setSaving(false);
    }
  };

  const pctPreview = num(form.overridePct);

  return (
    <form className="st-form" onSubmit={save} noValidate>
      {error && <Banner tone="danger">{error}</Banner>}

      <SettingsSection title="Komisi per jamaah" description="Besarnya diatur di setiap paket.">
        <p className="pg-text">
          Agen mendapat komisi paket x jumlah jamaah saat prospeknya closing. Ubah nominalnya di halaman <Link to="/packages">Paket</Link>.
        </p>
      </SettingsSection>

      <SettingsSection title="Komisi override" description="Bonus untuk agen yang merekrut agen lain.">
        <Checkbox checked={form.overrideOn} onChange={(v) => set('overrideOn', v)} label="Beri komisi override ke perekrut (upline)" />
        {form.overrideOn && (
          <Field
            label="Persentase dari komisi agen rekrutan"
            error={fieldErrors.overridePct}
            hint={pctPreview ? `Contoh: rekrutan dapat ${fmtRupiah(1000000)}, perekrut dapat tambahan ${fmtRupiah((pctPreview / 100) * 1000000)}. Komisi rekrutan tidak dipotong.` : 'Dibayar travel di luar komisi rekrutan.'}
          >
            {(id) => (
              <div className="pg-suffix">
                <input id={id} className="ku-input" inputMode="decimal" value={form.overridePct} onChange={input('overridePct')} aria-invalid={Boolean(fieldErrors.overridePct)} />
                <span>%</span>
              </div>
            )}
          </Field>
        )}
      </SettingsSection>

      <SettingsSection title="Pencairan komisi" description="Kapan komisi boleh dicairkan agen.">
        <div className="pg-choices" role="radiogroup" aria-label="Komisi bisa dicairkan saat">
          <label className={`pg-choice${form.releaseOn === 'lunas' ? ' pg-choice--on' : ''}`}>
            <input type="radio" name="release" checked={form.releaseOn === 'lunas'} onChange={() => set('releaseOn', 'lunas')} />
            <span className="pg-choice__title">Setelah jamaah lunas</span>
            <span className="pg-choice__desc">Komisi tertahan sejak DP sampai Anda menandai jamaah lunas. Lebih aman jika jamaah batal.</span>
          </label>
          <label className={`pg-choice${form.releaseOn === 'dp' ? ' pg-choice--on' : ''}`}>
            <input type="radio" name="release" checked={form.releaseOn === 'dp'} onChange={() => set('releaseOn', 'dp')} />
            <span className="pg-choice__title">Langsung saat DP</span>
            <span className="pg-choice__desc">Komisi bisa dicairkan begitu prospek closing. Jika closing dibatalkan, komisi dipotong dari komisi berikutnya.</span>
          </label>
        </div>
        <Field label="Minimal pencairan" optional error={fieldErrors.minPayout} hint="Pengajuan pencairan di bawah angka ini ditolak. Kosongkan jika tidak ada batas.">
          {(id) => (
            <div className="pg-prefix">
              <span>Rp</span>
              <input id={id} className="ku-input" inputMode="numeric" value={form.minPayout} onChange={input('minPayout')} placeholder="0" aria-invalid={Boolean(fieldErrors.minPayout)} />
            </div>
          )}
        </Field>
      </SettingsSection>

      <SettingsSection title="Pendaftaran agen" description="Yang dilihat calon agen di halaman daftar.">
        <Field label="Biaya pendaftaran" optional error={fieldErrors.fee} hint={fee > 0 ? 'Calon agen mentransfer biaya ini lalu mengunggah bukti. Anda menyetujuinya di Agen, tab Pendaftaran.' : 'Kosongkan atau isi 0 jika gratis.'}>
          {(id) => (
            <div className="pg-prefix">
              <span>Rp</span>
              <input id={id} className="ku-input" inputMode="numeric" value={form.fee} onChange={input('fee')} placeholder="0" aria-invalid={Boolean(fieldErrors.fee)} />
            </div>
          )}
        </Field>
        {fee > 0 && (
          <>
            <Field label="Bank tujuan" error={fieldErrors.bankName}>
              {(id) => <input id={id} className="ku-input" value={form.bankName} onChange={input('bankName')} placeholder="Contoh: BSI" aria-invalid={Boolean(fieldErrors.bankName)} />}
            </Field>
            <div className="st-grid">
              <Field label="Nomor rekening" error={fieldErrors.bankNumber}>
                {(id) => <input id={id} className="ku-input" inputMode="numeric" value={form.bankNumber} onChange={input('bankNumber')} aria-invalid={Boolean(fieldErrors.bankNumber)} />}
              </Field>
              <Field label="Atas nama" error={fieldErrors.bankHolder}>
                {(id) => <input id={id} className="ku-input" value={form.bankHolder} onChange={input('bankHolder')} aria-invalid={Boolean(fieldErrors.bankHolder)} />}
              </Field>
            </div>
          </>
        )}
        <Field label="Keuntungan menjadi agen" optional hint="Satu poin per baris.">
          {(id) => <textarea id={id} className="ku-textarea" rows={4} value={form.benefits} onChange={input('benefits')} placeholder={'Komisi setiap jamaah closing\nMateri promosi siap pakai'} />}
        </Field>
        <Field label="Syarat & ketentuan" optional hint="Calon agen wajib menyetujui teks ini saat mendaftar.">
          {(id) => <textarea id={id} className="ku-textarea" rows={5} value={form.terms} onChange={input('terms')} />}
        </Field>
        <ImageField
          label="Poster rekrutmen"
          hint="Tampil di halaman daftar agen. Persegi, maks. 8 MB. Tersimpan langsung saat diunggah."
          url={agentSettings?.agent_poster_url}
          shape="poster"
          maxMB={8}
          onUpload={async (file) => (await uploadAgentPoster(file)).poster_url}
          onRemove={deleteAgentPoster}
          onChange={(u) => setAgentSettings((a) => (a ? { ...a, agent_poster_url: u } : a))}
        />
      </SettingsSection>

      <div className="st-savebar">
        {done && !dirty && (
          <span className="st-savebar__done" role="status">
            <Check className="ku-icon--sm" aria-hidden="true" /> Perubahan tersimpan
          </span>
        )}
        <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setForm(saved); setFieldErrors({}); }}>
          Batalkan
        </Button>
        <Button type="submit" variant="primary" disabled={!dirty || saving}>
          {saving ? 'Menyimpan...' : 'Simpan perubahan'}
        </Button>
      </div>
    </form>
  );
};
