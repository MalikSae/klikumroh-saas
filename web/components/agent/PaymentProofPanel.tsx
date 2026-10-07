'use client';

// Jamaah payment proof from the agent (founder decision 7 Oct 2026): "Kirim bukti transfer" with the DP transfer
// proof, or "Kirim bukti lunas" for a closing not paid off yet. The travel admin verifies it; until then the
// status stays (no new pipeline status). A waiting proof shows as such; a rejected one shows the reason and
// can be sent again.
import React, { useState } from 'react';
import { Clock, FileUp, X } from 'lucide-react';
import { CustomDropdown } from '../CustomDropdown';
import { readJsonSafe, apiErrorMessage } from '../../lib/safeJson';
import { jakartaDateLabel } from '../../lib/jakartaTime';

export interface AgentPaymentRequest {
  id: number;
  kind: 'closing' | 'paid_off';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejection_reason?: string | null;
  created_at: string;
}

interface Props {
  prospectId: string | number;
  status: string;
  paidOffAt?: string | null;
  packageId?: number | null;
  jumlahJamaah?: number | null;
  requests: AgentPaymentRequest[];
  onSent: () => void;
}

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 13);
const thousands = (v: string) => (v ? Number(v).toLocaleString('id-ID') : '');

export const PaymentProofPanel: React.FC<Props> = ({ prospectId, status, paidOffAt, packageId, jumlahJamaah, requests, onSent }) => {
  const kind: 'closing' | 'paid_off' | null =
    status === 'closing' ? (paidOffAt ? null : 'paid_off') : status === 'tidak_lanjut' ? null : 'closing';
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [packages, setPackages] = useState<{ id: number; name: string }[]>([]);
  const [pkgChoice, setPkgChoice] = useState('');
  const [paxText, setPaxText] = useState('1');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!kind) return null;
  const ofKind = requests.filter((r) => r.kind === kind);
  const pending = ofKind.find((r) => r.status === 'pending');
  const latest = ofKind[0];
  const rejected = !pending && latest?.status === 'rejected' ? latest : null;
  const needPkg = kind === 'closing' && !packageId;
  const needPax = kind === 'closing' && !(jumlahJamaah && jumlahJamaah > 0);
  const label = kind === 'closing' ? 'bukti DP' : 'bukti pelunasan';

  const openForm = () => {
    setFile(null);
    setAmount('');
    setNote('');
    setPkgChoice('');
    setPaxText('1');
    setError(null);
    setOpen(true);
    if (needPkg && packages.length === 0) {
      fetch('/api/public/packages')
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => setPackages(Array.isArray(list) ? list : []))
        .catch(() => {});
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('agent_token');
    if (!token) return;
    if (!file) return setError('Pilih foto bukti transfer.');
    if (needPkg && !pkgChoice) return setError('Pilih paket jamaah.');
    const pax = Number(paxText);
    if (needPax && (!Number.isInteger(pax) || pax < 1 || pax > 50)) return setError('Jumlah jamaah harus angka 1 sampai 50.');
    const form = new FormData();
    form.append('kind', kind);
    form.append('proof_file', file);
    if (amount) form.append('amount', amount);
    if (note.trim()) form.append('note', note.trim());
    if (needPkg) form.append('package_id', pkgChoice);
    if (needPax) form.append('jumlah_jamaah', String(pax));
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/jamaah/${prospectId}/payment-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, await readJsonSafe(res), 'Gagal mengirim bukti'));
      setOpen(false);
      onSent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim bukti');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="jd-proof">
      {pending ? (
        <p className="jd-proof__state">
          <Clock size={16} aria-hidden="true" />
          <span>
            {kind === 'closing' ? 'Bukti DP' : 'Bukti pelunasan'} sedang diverifikasi admin travel · dikirim {jakartaDateLabel(pending.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </p>
      ) : (
        <>
          {rejected && (
            <p className="jd-proof__rejected">
              {kind === 'closing' ? 'Bukti DP' : 'Bukti pelunasan'} ditolak: {rejected.rejection_reason || 'tidak sesuai'}. Kirim ulang bukti yang benar.
            </p>
          )}
          <button type="button" className="jd-btn jd-proof__cta" onClick={openForm}>
            <FileUp size={18} aria-hidden="true" />
            {kind === 'closing' ? (rejected ? 'Kirim ulang bukti transfer' : 'Kirim bukti transfer') : rejected ? 'Kirim ulang bukti lunas' : 'Kirim bukti lunas'}
          </button>
        </>
      )}

      {open && (
        <div className="jd-sheet" role="dialog" aria-modal="true" aria-labelledby="jd-proof-title" onClick={() => !sending && setOpen(false)}>
          <form className="jd-sheet__panel" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="jd-sheet__head">
              <h3 id="jd-proof-title">{kind === 'closing' ? 'Kirim bukti transfer' : 'Kirim bukti lunas'}</h3>
              <button type="button" className="jd-sheet__close" aria-label="Tutup" onClick={() => setOpen(false)} disabled={sending}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <p className="jd-muted">Unggah {label} dari jamaah. Admin travel memeriksa lalu mengubah status.</p>
            {error && <p className="jd-proof__error" role="alert">{error}</p>}

            <label className="jd-field">
              <span>Foto bukti transfer</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={sending} />
            </label>

            {needPkg && (
              <div className="jd-field">
                <span>Paket</span>
                <CustomDropdown value={pkgChoice} placeholder="Pilih paket" options={packages.map((p) => ({ value: String(p.id), label: p.name }))} onChange={(e) => setPkgChoice(String(e.target.value))} />
              </div>
            )}
            {needPax && (
              <label className="jd-field">
                <span>Jumlah jamaah</span>
                <input className="jd-input" type="number" inputMode="numeric" min={1} max={50} value={paxText} onChange={(e) => setPaxText(e.target.value)} disabled={sending} />
              </label>
            )}

            <label className="jd-field">
              <span>Nominal (opsional)</span>
              <input className="jd-input" inputMode="numeric" placeholder="Rp" value={thousands(amount)} onChange={(e) => setAmount(digits(e.target.value))} disabled={sending} />
            </label>
            <label className="jd-field">
              <span>Catatan (opsional)</span>
              <textarea className="jd-input jd-input--area" maxLength={500} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: DP 2 jamaah via BSI" disabled={sending} />
            </label>

            <button type="submit" className="jd-btn jd-proof__submit" disabled={sending}>
              {sending ? 'Mengirim...' : 'Kirim ke admin travel'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
