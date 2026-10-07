// Edit a prospect's data. Changing the package or jamaah count of a Closing prospect books a commission
// correction, so a correction reason is required then (same rule as the backend).
import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { departurePlanOptions, updateProspect, type PackageItem, type ProspectDetailResponse } from '../../services/api';
import { Banner, Button, CityInput, Field, Modal, Select, fmtRupiah } from '../../ui';
import { parseJamaahCount } from '../programs/numberInput';

export const EditProspectModal: React.FC<{
  open: boolean;
  detail: ProspectDetailResponse | null;
  packages: PackageItem[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, detail, packages, onClose, onSaved }) => {
  const p = detail?.prospect;
  const initialJamaah = p?.jumlah_jamaah && p.jumlah_jamaah > 0 ? p.jumlah_jamaah : 1;
  const initialPkg = p?.package_id ? String(p.package_id) : '';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pkg, setPkg] = useState('');
  // Kept as typed text so it can be empty while the admin retypes it; validated on save (1..50).
  const [jamaahText, setJamaahText] = useState('1');
  const jamaah = parseJamaahCount(jamaahText);
  const [plan, setPlan] = useState('');
  const [domicile, setDomicile] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !p) return;
    setName(p.name || '');
    setPhone(p.phone || '');
    setPkg(initialPkg);
    setJamaahText(String(initialJamaah));
    setPlan(p.departure_plan || '');
    setDomicile(p.domicile || '');
    setReason('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p?.id]);

  // An empty/invalid count (mid-retype) is not compared, so the correction box does not flicker.
  const correction = p?.status === 'closing' && ((jamaah !== null && jamaah !== initialJamaah) || pkg !== initialPkg);
  const selected = packages.find((x) => String(x.id) === pkg);

  const save = async () => {
    if (!p) return;
    if (!name.trim()) return setError('Nama wajib diisi.');
    if (!phone.trim()) return setError('Nomor WhatsApp wajib diisi.');
    if (jamaah === null) return setError('Jumlah jamaah harus angka bulat 1 sampai 50.');
    if (!pkg && initialPkg && (p.status === 'tertarik' || p.status === 'closing')) return setError('Paket wajib diisi untuk prospek berstatus Tertarik atau Closing.');
    if (correction && !reason.trim()) return setError('Isi alasan koreksi: paket atau jumlah jamaah prospek closing berubah.');
    try {
      setSaving(true);
      setError(null);
      await updateProspect(p.id, {
        name: name.trim(),
        phone: phone.trim(),
        package_id: pkg ? Number(pkg) : null,
        jumlah_jamaah: jamaah,
        departure_plan: plan || null,
        domicile: domicile.trim() || null,
        correction_reason: correction ? reason.trim() : undefined,
      });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Perubahan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit data prospek"
      wide
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Batal</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan perubahan'}</Button>
        </>
      }
    >
      <div className="ku-stack">
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="pr-form-grid">
          <Field label="Nama">{(id) => <input id={id} className="ku-input" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Nomor WhatsApp">{(id) => <input id={id} className="ku-input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
          <Field label="Paket">
            {(id) => (
              <Select
                id={id}
                label="Paket"
                value={pkg}
                onChange={setPkg}
                options={[{ value: '', label: 'Belum pilih paket' }, ...packages.map((x) => ({ value: String(x.id), label: x.status === 'published' ? x.name : `${x.name} (${x.status === 'draft' ? 'draf' : 'diarsipkan'})` }))]}
              />
            )}
          </Field>
          <Field label="Jumlah jamaah">
            {(id) => <input id={id} className="ku-input" type="number" min={1} max={50} value={jamaahText} onChange={(e) => setJamaahText(e.target.value)} />}
          </Field>
          {!pkg && (
            <Field label="Rencana berangkat" optional>
              {(id) => <Select id={id} label="Rencana berangkat" value={plan} onChange={setPlan} options={departurePlanOptions(plan)} />}
            </Field>
          )}
          <Field label="Domisili" optional>{(id) => <CityInput id={id} value={domicile} onChange={setDomicile} />}</Field>
        </div>
        {selected?.price && jamaah !== null ? (
          <p className="pr-hint">
            Nilai paket {fmtRupiah(selected.price * jamaah)}
            {detail?.agent && selected.commission_amount ? ` · komisi agen ${fmtRupiah(selected.commission_amount * jamaah)}` : ''}
          </p>
        ) : null}
        {correction && (
          <>
            <Banner tone="warning" icon={<AlertTriangle className="ku-icon--sm" />}>
              Prospek ini sudah closing. Mengubah paket atau jumlah jamaah membukukan koreksi komisi agen.
            </Banner>
            <Field label="Alasan koreksi">{(id) => <input id={id} className="ku-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: jamaah menambah 1 orang" />}</Field>
          </>
        )}
      </div>
    </Modal>
  );
};
