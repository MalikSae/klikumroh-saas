// Package editor: one page, sections left-titled like Pengaturan, sticky save bar with the publish action.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ExternalLink, MoreHorizontal, Plus, X } from 'lucide-react';
import { createPackage, deletePackage, fetchPackageById, updatePackage, uploadPackagePhoto, type PackageItem, type PackagePhoto } from '../../services/api';
import { Banner, Button, Field, IconButton, Menu, Modal, MoneyInput, Pill, Select, errorText } from '../../ui';
import { useFrame, usePageTitle } from '../../app/AppFrame';
import { SettingsSection } from '../settings/Section';
import { PackagePhotos, PendingPhotos } from './PackagePhotos';
import { isDeparted, packageStatusLabel, parseFlight, parseHotels, parseItinerary, serializeFlight, serializeHotels, serializeItinerary, type Flight, type Hotel } from './packageUtil';

type Form = {
  name: string;
  description: string;
  price: number | null;
  commission: number | null;
  quota: string;
  departure: string;
  hotels: Hotel[];
  flight: Flight;
  days: string[];
  included: string;
  excluded: string;
  terms: string;
};

const EMPTY: Form = { name: '', description: '', price: null, commission: null, quota: '', departure: '', hotels: [], flight: { airline: '', route: '' }, days: [], included: '', excluded: '', terms: '' };

const toForm = (p: PackageItem): Form => ({
  name: p.name,
  description: p.description || '',
  price: p.price ?? null,
  commission: p.commission_amount ?? null,
  quota: p.quota ? String(p.quota) : '',
  departure: p.departure_date ? p.departure_date.slice(0, 10) : '',
  hotels: parseHotels(p.hotel_info),
  flight: parseFlight(p.flight_info),
  days: parseItinerary(p.itinerary),
  included: p.facilities_included || '',
  excluded: p.facilities_excluded || '',
  terms: p.terms_conditions || '',
});

const orNull = (v: string) => (v.trim() ? v.trim() : null);

const toPayload = (f: Form, status: PackageItem['status']): Partial<PackageItem> => ({
  name: f.name.trim(),
  description: orNull(f.description),
  price: f.price,
  commission_amount: f.commission,
  quota: f.quota.trim() ? Number(f.quota) : null,
  departure_date: f.departure || null,
  status,
  hotel_info: serializeHotels(f.hotels),
  flight_info: serializeFlight(f.flight),
  itinerary: serializeItinerary(f.days),
  facilities_included: orNull(f.included),
  facilities_excluded: orNull(f.excluded),
  terms_conditions: orNull(f.terms),
});

const STARS = [5, 4, 3, 2, 1].map((s) => ({ value: String(s), label: `Bintang ${s}` }));

export const PackageEditor: React.FC = () => {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const frame = useFrame();
  const [pkg, setPkg] = useState<PackageItem | null>(null);
  const [photos, setPhotos] = useState<PackagePhoto[]>([]);
  const [saved, setSaved] = useState<Form>(EMPTY);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  // Notice to show after "Kembalikan ke draf" once the admin confirmed saving the unsaved edits with it.
  const [confirmDraft, setConfirmDraft] = useState<string | null>(null);
  // Blocks a second save/archive/delete while one is running (the menu items are not disabled by `saving`,
  // and a fast second click lands before the re-render): two PUTs at once could leave the form out of step.
  const busyRef = useRef(false);
  // Photos picked on a new package: uploaded right after the package is created, in this order.
  const [pending, setPending] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const location = useLocation();
  const arrived = (location.state as { notice?: string; photoError?: string } | null) ?? null;

  usePageTitle(isNew ? 'Paket baru' : pkg?.name || 'Paket');

  useEffect(() => {
    // The route id can change on this same instance (e.g. a link to another package): drop the previous
    // package's data first, so its form is never shown under, or saved to, the new id.
    let alive = true;
    setPkg(null);
    setPhotos([]);
    setSaved(EMPTY);
    setForm(EMPTY);
    setErrors({});
    setError(null);
    setNotice(null);
    setConfirmDelete(false);
    setPending([]);
    setLoading(!isNew);
    if (!isNew) {
      fetchPackageById(Number(id))
        .then((p) => {
          if (!alive) return;
          setPkg(p);
          setPhotos(p.photos || []);
          const f = toForm(p);
          setSaved(f);
          setForm(f);
        })
        .catch((e) => {
          if (alive) setError(errorText(e, 'Paket tidak ditemukan'));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }
    // Coming from "new package": show what happened to the save and the photo uploads.
    if (arrived?.notice) setNotice(arrived.notice);
    if (arrived?.photoError) setError(arrived.photoError);
    // Show the message once: a reload must not repeat it.
    if (arrived) window.history.replaceState({}, '');
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setNotice(null);
    setErrors((e) => (k in e ? { ...e, [k]: undefined } : e));
  };
  const text = (k: 'name' | 'description' | 'quota' | 'departure' | 'included' | 'excluded' | 'terms') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);

  const validate = (status: PackageItem['status']) => {
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = 'Nama paket wajib diisi.';
    if (status === 'published' && !form.price) errs.price = 'Isi harga sebelum paket tayang di website.';
    if (form.price && form.commission && form.commission > form.price) errs.commission = 'Komisi tidak boleh melebihi harga paket.';
    if (form.quota.trim() && (!/^\d+$/.test(form.quota.trim()) || Number(form.quota) < 1)) errs.quota = 'Isi angka bulat, atau kosongkan jika tidak dibatasi.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async (status: PackageItem['status'], message: string) => {
    // Only ever save the form of the package that is loaded for this route id.
    if (!isNew && pkg?.id !== Number(id)) return;
    if (busyRef.current) return;
    if (!validate(status)) return;
    busyRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const body = toPayload(form, status);
      if (isNew) {
        const created = await createPackage(body);
        let failed = 0;
        // The server reason of the last failure (e.g. 503 "Server sedang memproses gambar lain") is shown with the count.
        let failReason = '';
        for (const [i, file] of pending.entries()) {
          setProgress(`Mengunggah foto ${i + 1} dari ${pending.length}...`);
          try {
            await uploadPackagePhoto(created.id, file);
          } catch (e) {
            failed++;
            failReason = errorText(e, '');
          }
        }
        navigate(`/packages/${created.id}`, {
          replace: true,
          state: {
            notice: status === 'published' ? 'Paket dibuat dan tayang di website.' : 'Paket disimpan sebagai draf.',
            photoError: failed ? `${failed} foto gagal diunggah.${failReason ? ` ${failReason.replace(/\.?$/, '.')}` : ''} Tambahkan lagi di bagian Foto.` : undefined,
          },
        });
        return;
      }
      const updated = await updatePackage(Number(id), body);
      // Keep the known seat count if the response lacks it, so the hint never drops to "0 kursi".
      const next = { ...updated, photos, seats_taken: updated.seats_taken ?? pkg?.seats_taken };
      setPkg(next);
      const f = toForm(next);
      setSaved(f);
      setForm(f);
      setNotice(message);
    } catch (e) {
      setError(errorText(e, 'Gagal menyimpan paket'));
    } finally {
      busyRef.current = false;
      setSaving(false);
      setProgress(null);
    }
  };

  const remove = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await deletePackage(Number(id));
      navigate('/packages');
    } catch (e) {
      setError(errorText(e, 'Gagal menghapus paket'));
      setConfirmDelete(false);
      setSaving(false);
    } finally {
      busyRef.current = false;
    }
  };

  // Archiving saves the whole form: with unsaved edits, ask first instead of saving them silently.
  const archive = () => {
    if (busyRef.current) return;
    if (dirty) setConfirmArchive(true);
    else save('archived', 'Paket diarsipkan.');
  };

  // Un-publishing / un-archiving also saves the whole form: same confirmation as archiving.
  const toDraft = (notice: string) => {
    if (busyRef.current) return;
    if (dirty) setConfirmDraft(notice);
    else save('draft', notice);
  };

  if (loading) return <div className="st-loading" aria-busy="true" />;
  if (!isNew && !pkg) {
    return (
      <div className="st-stack">
        <div>
          <Button variant="ghost" size="sm" to="/packages" icon={<ArrowLeft className="ku-icon--sm" />}>
            Paket
          </Button>
        </div>
        <Banner tone="danger">{error || 'Paket tidak ditemukan.'}</Banner>
      </div>
    );
  }

  const status = pkg?.status ?? 'draft';
  // A departed package is off the website: label it so, without a link to a page that no longer exists.
  const departed = !!pkg && isDeparted(pkg);
  const statusLabel = pkg ? packageStatusLabel(pkg) : { label: 'Draf', tone: 'gray' as const };
  const site = frame?.siteUrl ?? null;
  const commissionPct = form.price && form.commission ? Math.round((form.commission / form.price) * 1000) / 10 : null;

  const menuItems = [
    ...(status === 'published' ? [{ label: 'Kembalikan ke draf', onClick: () => toDraft('Paket dijadikan draf dan tidak tampil di website.') }] : []),
    ...(status !== 'archived' ? [{ label: 'Arsipkan', onClick: archive }] : [{ label: 'Kembalikan ke draf', onClick: () => toDraft('Paket dikembalikan ke draf.') }]),
    { label: 'Hapus paket', danger: true, onClick: () => setConfirmDelete(true) },
  ];

  return (
    <div className="pk-editor">
      <div className="pk-editor__top">
        <Button variant="ghost" size="sm" to="/packages" icon={<ArrowLeft className="ku-icon--sm" />}>
          Paket
        </Button>
        {!isNew && (
          <span className="pk-editor__status">
            <Pill tone={statusLabel.tone}>{statusLabel.label}</Pill>
            {status === 'published' && !departed && site && (
              <a className="pk-link" href={`${site}/paket/${pkg?.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="ku-icon--sm" aria-hidden="true" /> Lihat di website
              </a>
            )}
          </span>
        )}
      </div>

      <form className="st-form" onSubmit={(e) => { e.preventDefault(); save(isNew ? 'draft' : status, 'Perubahan tersimpan.'); }} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}

        <SettingsSection title="Informasi paket" description="Yang pertama dibaca calon jamaah.">
          <Field label="Nama paket" error={errors.name}>
            {(fid) => <input id={fid} className="ku-input" value={form.name} onChange={text('name')} maxLength={255} placeholder="Contoh: Umroh Reguler 9 Hari Januari" aria-invalid={Boolean(errors.name)} />}
          </Field>
          <Field label="Deskripsi" optional hint="Pisahkan paragraf dengan baris kosong.">
            {(fid) => <textarea id={fid} className="ku-textarea" rows={5} value={form.description} onChange={text('description')} />}
          </Field>
        </SettingsSection>

        <SettingsSection title="Harga & keberangkatan" description="Harga per jamaah dan kursi yang tersedia.">
          <div className="st-grid">
            <Field label="Harga per jamaah" error={errors.price} hint={!errors.price ? 'Wajib diisi sebelum tayang.' : undefined}>
              {(fid) => <MoneyInput id={fid} value={form.price} onChange={(v) => set('price', v)} invalid={Boolean(errors.price)} placeholder="0" />}
            </Field>
            <Field label="Komisi agen per jamaah" optional error={errors.commission} hint={commissionPct !== null && !errors.commission ? `${commissionPct}% dari harga.` : 'Dibayar ke agen saat prospeknya closing.'}>
              {(fid) => <MoneyInput id={fid} value={form.commission} onChange={(v) => set('commission', v)} invalid={Boolean(errors.commission)} placeholder="0" />}
            </Field>
          </div>
          <div className="st-grid">
            <Field label="Tanggal berangkat" optional>
              {(fid) => <input id={fid} className="ku-input" type="date" value={form.departure} onChange={text('departure')} />}
            </Field>
            <Field label="Kuota kursi" optional error={errors.quota} hint={pkg && !errors.quota ? `${pkg.seats_taken ?? 0} kursi sudah terisi (prospek closing).` : 'Kosongkan jika tidak dibatasi.'}>
              {(fid) => <input id={fid} className="ku-input" inputMode="numeric" value={form.quota} onChange={text('quota')} aria-invalid={Boolean(errors.quota)} />}
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection title="Foto" description="Maksimal 10 foto. Foto pertama jadi sampul.">
          {isNew || !pkg ? <PendingPhotos files={pending} onChange={setPending} disabled={saving} /> : <PackagePhotos packageId={pkg.id} photos={photos} onChange={setPhotos} />}
        </SettingsSection>

        <SettingsSection title="Hotel" description="Hotel di setiap kota.">
          {form.hotels.map((h, i) => (
            <div key={i} className="pk-row">
              <input className="ku-input pk-row__city" aria-label={`Kota hotel ${i + 1}`} placeholder="Makkah" value={h.city} onChange={(e) => set('hotels', form.hotels.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))} />
              <input className="ku-input" aria-label={`Nama hotel ${i + 1}`} placeholder="Nama hotel" value={h.name} onChange={(e) => set('hotels', form.hotels.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <div className="pk-row__stars">
                <Select label={`Bintang hotel ${i + 1}`} value={String(h.stars)} options={STARS} onChange={(v) => set('hotels', form.hotels.map((x, j) => (j === i ? { ...x, stars: Number(v) } : x)))} />
              </div>
              <IconButton label={`Hapus hotel ${i + 1}`} size="sm" onClick={() => set('hotels', form.hotels.filter((_, j) => j !== i))}>
                <X className="ku-icon--sm" />
              </IconButton>
            </div>
          ))}
          <div>
            <Button size="sm" variant="secondary" icon={<Plus className="ku-icon--sm" />} onClick={() => set('hotels', [...form.hotels, { city: form.hotels.length === 0 ? 'Makkah' : form.hotels.length === 1 ? 'Madinah' : '', name: '', stars: 5 }])}>
              Tambah hotel
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection title="Penerbangan" description="Maskapai dan rute.">
          <div className="st-grid">
            <Field label="Maskapai" optional>
              {(fid) => <input id={fid} className="ku-input" value={form.flight.airline} onChange={(e) => set('flight', { ...form.flight, airline: e.target.value })} placeholder="Contoh: Saudia" />}
            </Field>
            <Field label="Rute" optional>
              {(fid) => <input id={fid} className="ku-input" value={form.flight.route} onChange={(e) => set('flight', { ...form.flight, route: e.target.value })} placeholder="Contoh: CGK - JED, MED - CGK" />}
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection title="Rencana perjalanan" description="Kegiatan per hari.">
          {form.days.map((d, i) => (
            <div key={i} className="pk-day">
              <span className="pk-day__n">Hari {i + 1}</span>
              <textarea className="ku-textarea pk-day__text" rows={2} aria-label={`Kegiatan hari ${i + 1}`} value={d} onChange={(e) => set('days', form.days.map((x, j) => (j === i ? e.target.value : x)))} />
              <IconButton label={`Hapus hari ${i + 1}`} size="sm" onClick={() => set('days', form.days.filter((_, j) => j !== i))}>
                <X className="ku-icon--sm" />
              </IconButton>
            </div>
          ))}
          <div>
            <Button size="sm" variant="secondary" icon={<Plus className="ku-icon--sm" />} onClick={() => set('days', [...form.days, ''])}>
              Tambah hari
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection title="Fasilitas" description="Satu fasilitas per baris.">
          <Field label="Termasuk" optional>
            {(fid) => <textarea id={fid} className="ku-textarea" rows={5} value={form.included} onChange={text('included')} placeholder={'Tiket pesawat PP\nVisa umroh\nMakan 3x sehari'} />}
          </Field>
          <Field label="Tidak termasuk" optional>
            {(fid) => <textarea id={fid} className="ku-textarea" rows={3} value={form.excluded} onChange={text('excluded')} placeholder={'Paspor\nKelebihan bagasi'} />}
          </Field>
        </SettingsSection>

        <SettingsSection title="Syarat & ketentuan" description="Satu poin per baris.">
          <Field label="Syarat & ketentuan" optional>
            {(fid) => <textarea id={fid} className="ku-textarea" rows={5} value={form.terms} onChange={text('terms')} />}
          </Field>
        </SettingsSection>

        <div className="st-savebar">
          {notice && !dirty && (
            <span className="st-savebar__done" role="status">
              <Check className="ku-icon--sm" aria-hidden="true" /> {notice}
            </span>
          )}
          {dirty && !notice && !isNew && <span className="pk-unsaved">Ada perubahan yang belum disimpan</span>}
          {!isNew && <Menu label="Aksi paket" trigger={<MoreHorizontal className="ku-icon--sm" />} items={menuItems} />}
          {progress && <span className="pk-progress" role="status">{progress}</span>}
          {isNew ? (
            <>
              <Button type="submit" variant="secondary" disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan draf'}
              </Button>
              <Button variant="primary" disabled={saving} onClick={() => save('published', '')}>
                Tayangkan di website
              </Button>
            </>
          ) : status === 'published' ? (
            <Button type="submit" variant="primary" disabled={saving || !dirty}>
              {saving ? 'Menyimpan...' : 'Simpan perubahan'}
            </Button>
          ) : (
            <>
              <Button type="submit" variant="secondary" disabled={saving || !dirty}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </Button>
              <Button variant="primary" disabled={saving} onClick={() => save('published', 'Paket tayang di website.')}>
                Tayangkan di website
              </Button>
            </>
          )}
        </div>
      </form>

      <Modal
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Arsipkan paket?"
        description="Ada perubahan yang belum disimpan. Perubahan itu ikut disimpan saat paket diarsipkan. Pilih Batal untuk memeriksanya dulu."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmArchive(false)} disabled={saving}>
              Batal
            </Button>
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => {
                setConfirmArchive(false);
                void save('archived', 'Paket diarsipkan.');
              }}
            >
              Simpan dan arsipkan
            </Button>
          </>
        }
      />

      <Modal
        open={confirmDraft !== null}
        onClose={() => setConfirmDraft(null)}
        title="Kembalikan ke draf?"
        description="Ada perubahan yang belum disimpan. Perubahan itu ikut disimpan saat paket dikembalikan ke draf. Pilih Batal untuk memeriksanya dulu."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDraft(null)} disabled={saving}>
              Batal
            </Button>
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => {
                const notice = confirmDraft ?? 'Paket dikembalikan ke draf.';
                setConfirmDraft(null);
                void save('draft', notice);
              }}
            >
              Simpan dan jadikan draf
            </Button>
          </>
        }
      />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Hapus paket?"
        description="Paket dan fotonya dihapus permanen. Paket yang sudah dipakai prospek tidak bisa dihapus; arsipkan saja."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={saving}>
              Batal
            </Button>
            <Button variant="danger" onClick={remove} disabled={saving}>
              {saving ? 'Menghapus...' : 'Hapus paket'}
            </Button>
          </>
        }
      />
    </div>
  );
};
