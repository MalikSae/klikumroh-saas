// Create or edit a sales target. The metric cannot change once the target exists.
import React, { useState } from 'react';
import { createTarget, updateTarget, type AgentTarget } from '../../services/api';
import { Banner, Button, Field, Modal, Select, errorText } from '../../ui';
import { METRIC_UNIT } from './targetUtil';

const monthRange = () => {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return [iso(start), iso(end)];
};

export const TargetModal: React.FC<{ target?: AgentTarget | null; onClose: () => void; onSaved: (t: AgentTarget) => void }> = ({ target, onClose, onSaved }) => {
  const [defStart, defEnd] = monthRange();
  const [title, setTitle] = useState(target?.title || '');
  const [metric, setMetric] = useState<AgentTarget['metric_type']>(target?.metric_type || 'closing_pax');
  const [value, setValue] = useState(target ? String(target.metric_value) : '');
  const [reward, setReward] = useState(target?.reward_description || '');
  const [start, setStart] = useState(target?.period_start.slice(0, 10) || defStart);
  const [end, setEnd] = useState(target?.period_end.slice(0, 10) || defEnd);
  const [errors, setErrors] = useState<{ value?: string; reward?: string; period?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) next.value = 'Isi angka bulat lebih dari 0.';
    if (!reward.trim()) next.reward = 'Tulis hadiah agar agen tahu apa yang dikejar.';
    if (!start || !end || end < start) next.period = 'Tanggal selesai harus sama atau setelah tanggal mulai.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setError(null);
    try {
      const body = { title: title.trim() || undefined, metric_value: n, reward_description: reward.trim(), period_start: start, period_end: end };
      const saved = target ? await updateTarget(target.id, body) : await createTarget({ ...body, metric_type: metric });
      onSaved(saved);
    } catch (err) {
      setError(errorText(err, 'Gagal menyimpan target'));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={target ? 'Ubah target' : 'Buat target'}
      description={target ? undefined : 'Agen melihat target, progres, dan hadiahnya di dashboard agen.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button variant="primary" type="submit" form="pg-target" disabled={saving}>
            {saving ? 'Menyimpan...' : target ? 'Simpan' : 'Buat target'}
          </Button>
        </>
      }
    >
      <form id="pg-target" className="ag-form" onSubmit={submit} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label="Nama target" optional hint="Contoh: Promo Ramadhan. Kosongkan untuk memakai nama otomatis.">
          {(id) => <input id={id} className="ku-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />}
        </Field>
        <div className="pg-grid">
          <Field label="Yang dihitung" hint={target ? 'Tidak bisa diubah setelah target dibuat.' : undefined}>
            {(id) => (
              <Select
                id={id}
                label="Yang dihitung"
                value={metric}
                onChange={(v) => setMetric(v as AgentTarget['metric_type'])}
                disabled={Boolean(target)}
                options={[
                  { value: 'closing_pax', label: 'Jamaah closing' },
                  { value: 'mitra_baru_count', label: 'Agen baru direkrut' },
                ]}
              />
            )}
          </Field>
          <Field label={`Jumlah ${METRIC_UNIT[metric]}`} error={errors.value}>
            {(id) => <input id={id} className="ku-input" type="number" min={1} step={1} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={Boolean(errors.value)} />}
          </Field>
        </div>
        <div className="pg-grid">
          <Field label="Mulai" error={errors.period}>
            {(id) => <input id={id} className="ku-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={Boolean(errors.period)} />}
          </Field>
          <Field label="Selesai">{(id) => <input id={id} className="ku-input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={Boolean(errors.period)} />}</Field>
        </div>
        <Field label="Hadiah" error={errors.reward}>
          {(id) => <textarea id={id} className="ku-textarea" rows={2} value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Contoh: Bonus Rp 2.000.000 atau voucher umroh" aria-invalid={Boolean(errors.reward)} />}
        </Field>
      </form>
    </Modal>
  );
};
