// Prospect detail in a side drawer: status, facts, commission, origin, notes, history and every closing
// action of the old detail page (closing confirmation + commission/seat warnings, lunas, batal closing,
// delete for spam, UU PDP anonymisation).
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, MessageCircle, MoreHorizontal, Pencil, Trash2, UserX } from 'lucide-react';
import { EditProspectModal } from './EditProspectModal';
import {
  LOST_REASON_OPTIONS,
  addProspectNote,
  anonymizeProspect,
  cancelProspectClosing,
  deleteProspect,
  fetchCommissionReleasePolicy,
  fetchProspectDetail,
  formatDeparturePlan,
  lostReasonCategoryLabel,
  markProspectPaidOff,
  updateProspectStatus,
  type PackageItem,
  type ProspectDetailResponse,
} from '../../services/api';
import { formatDateTimeWIB } from '../../utils/datetime';
import { closingSeatsWarning } from '../../utils/packageSeats';
import { closingCommissionNote, closingPayoffNote, lostReasonNote, paidOffDialogNote, type ReleasePolicy } from '../../utils/prospectTexts';
import {
  Banner,
  Button,
  ChannelTag,
  Drawer,
  Field,
  Menu,
  Modal,
  PROSPECT_STATUS,
  Select,
  channelOf,
  fmtAgo,
  fmtDate,
  fmtRupiah,
} from '../../ui';

const STEPS = ['baru', 'dihubungi', 'tertarik', 'closing', 'tidak_lanjut'] as const;
type Step = (typeof STEPS)[number];

const waLink = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits.startsWith('0') ? '62' + digits.slice(1) : digits}`;
};

export const ProspectDrawer: React.FC<{
  id: number;
  packages: PackageItem[];
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  /** Open with the edit form (route /prospects/:id/edit). */
  startEditing?: boolean;
}> = ({ id, packages, onClose, onChanged, onDeleted, startEditing }) => {
  const [editing, setEditing] = useState(!!startEditing);
  const [data, setData] = useState<ProspectDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [dialog, setDialog] = useState<null | 'closing' | 'lost' | 'paid' | 'cancel' | 'delete' | 'anonymize'>(null);
  const [confirmClosing, setConfirmClosing] = useState(false);
  const [lostCategory, setLostCategory] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  // The travel's commission release rule (Program agen > Aturan), for the closing confirmation text.
  const [releasePolicy, setReleasePolicy] = useState<ReleasePolicy | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCommissionReleasePolicy()
      .then((v) => { if (alive) setReleasePolicy(v); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchProspectDetail(id));
    } catch (e: any) {
      setError(e.message || 'Detail prospek tidak dapat dimuat.');
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    try {
      setBusy(true);
      setActionError(null);
      await fn();
      setDialog(null);
      after?.();
      await load();
      onChanged();
    } catch (e: any) {
      setActionError(e.message || 'Perubahan gagal disimpan.');
      setConfirmClosing(false);
    } finally {
      setBusy(false);
    }
  };

  const openDialog = (d: typeof dialog) => {
    setActionError(null);
    setConfirmClosing(false);
    setDialog(d);
  };

  const p = data?.prospect;
  const anonymized = !!p?.anonymized_at;
  const isClosing = p?.status === 'closing';
  // A closing (or a cancelled closing) keeps commission history, so the prospect cannot be deleted.
  const hasCommissionHistory = isClosing || data?.info_komisi?.type === 'dibatalkan';
  const statusLocked = isClosing || (anonymized && !isClosing);
  const pkg = data?.package ?? (p?.package_id ? packages.find((x) => x.id === p.package_id) : undefined);
  const commissionGap = !data?.agent ? null : !data.package ? 'Prospek ini belum punya paket' : !data.package.commission_amount || data.package.commission_amount <= 0 ? `Komisi paket ${data.package.name} belum diatur` : null;
  const seatsWarning = closingSeatsWarning(data?.package, p?.jumlah_jamaah);

  const lostLabel = lostReasonCategoryLabel(p?.lost_reason_category);
  // Typed note behind the category; a legacy row without a category has only free text.
  const lostNote = !p ? '' : lostLabel ? lostReasonNote(p.lost_reason_category, lostLabel, p.lost_reason) : (p.lost_reason || '').trim();

  const pickStatus = (s: Step) => {
    if (!p || statusLocked || busy) return;
    if (s === 'closing') return openDialog('closing');
    if (s === 'tidak_lanjut') {
      setLostCategory(p.lost_reason_category && p.lost_reason_category !== 'batal_setelah_dp' ? p.lost_reason_category : '');
      // Prefilled for every category, so saving again (for example to fix the category) keeps the note.
      setLostReason(lostNote);
      return openDialog('lost');
    }
    if (s === p.status) return;
    run(() => updateProspectStatus(id, s));
  };

  const submitLost = () => {
    if (!lostCategory) return setActionError('Pilih alasan tidak lanjut.');
    if (lostCategory === 'lainnya' && !lostReason.trim()) return setActionError('Jelaskan alasan untuk pilihan Lainnya.');
    run(() => updateProspectStatus(id, 'tidak_lanjut', lostReason.trim() || undefined, lostCategory));
  };

  const komisi = data?.info_komisi;
  const title = p ? (anonymized ? 'Data pribadi dihapus' : p.name) : 'Memuat…';
  const subtitle = p && !anonymized ? [p.phone, p.domicile, `masuk ${fmtAgo(p.created_at)}`].filter(Boolean).join(' · ') : p ? `Masuk ${fmtAgo(p.created_at)}` : undefined;

  const menuItems = [
    ...(p && !hasCommissionHistory ? [{ label: 'Hapus prospek', danger: true, icon: <Trash2 className="ku-icon--sm" />, onClick: () => openDialog('delete') }] : []),
    ...(p && hasCommissionHistory && !anonymized ? [{ label: 'Hapus data pribadi (UU PDP)', danger: true, icon: <UserX className="ku-icon--sm" />, onClick: () => openDialog('anonymize') }] : []),
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <span className="pr-drawer-title">
          {title}
          {menuItems.length > 0 && <Menu label="Aksi lain" align="start" trigger={<MoreHorizontal className="ku-icon--sm" />} items={menuItems} />}
        </span>
      }
      subtitle={subtitle}
      footer={
        p && (
          <>
            {!anonymized && (
              <Button onClick={() => setEditing(true)} icon={<Pencil className="ku-icon--sm" />}>
                Edit data
              </Button>
            )}
            {!anonymized && (
              <Button variant="primary" to={waLink(p.phone)} external icon={<MessageCircle className="ku-icon--sm" />}>
                Hubungi via WhatsApp
              </Button>
            )}
          </>
        )
      }
    >
      {error && <Banner tone="danger">{error}</Banner>}
      {!p && !error && <div className="pr-loading" />}
      {p && (
        <div className="pr-detail">
          {anonymized && (
            <Banner tone="info">
              Data pribadi dihapus pada {formatDateTimeWIB(p.anonymized_at)} atas permintaan jamaah (UU PDP). Status, paket, dan riwayat komisi tetap disimpan.
            </Banner>
          )}
          {actionError && !dialog && <Banner tone="danger">{actionError}</Banner>}

          <section>
            <h3 className="ku-label">Status</h3>
            <div className="pr-steps" role="group" aria-label="Status prospek">
              {STEPS.map((s) => (
                <button key={s} type="button" className={`pr-step${p.status === s ? ' pr-step--on' : ''}`} disabled={statusLocked || busy} aria-pressed={p.status === s} onClick={() => pickStatus(s)}>
                  {PROSPECT_STATUS[s].label}
                </button>
              ))}
            </div>
            {p.status === 'tidak_lanjut' && (p.lost_reason_category || p.lost_reason) && (
              <p className="pr-hint">
                Alasan: {lostLabel || p.lost_reason}
                {lostLabel && lostNote ? ` — ${lostNote}` : ''}
              </p>
            )}
            {isClosing && (
              <div className="pr-closing">
                <div>
                  <div className="ku-strong">{p.paid_off_at ? 'Lunas' : 'Sudah DP, menunggu lunas'}</div>
                  <div className="ku-muted ku-small">
                    {p.paid_off_at ? `Ditandai lunas ${fmtDate(p.paid_off_at)}` : closingPayoffNote(!!data?.agent, komisi)}
                  </div>
                </div>
                <div className="ku-row">
                  <Button size="sm" variant="ghost" onClick={() => { setCancelReason(''); openDialog('cancel'); }}>Batalkan closing</Button>
                  {!p.paid_off_at && <Button size="sm" onClick={() => openDialog('paid')}>Tandai lunas</Button>}
                </div>
              </div>
            )}
          </section>

          <section className="ku-facts">
            <div>
              <div className="ku-facts__k">Paket</div>
              <div className="ku-facts__v">{pkg ? pkg.name : 'Belum pilih paket'}</div>
            </div>
            <div>
              <div className="ku-facts__k">Jamaah</div>
              <div className="ku-facts__v">{p.jumlah_jamaah && p.jumlah_jamaah > 0 ? p.jumlah_jamaah : 1} orang</div>
            </div>
            {pkg ? (
              <div>
                <div className="ku-facts__k">Berangkat</div>
                <div className="ku-facts__v">{pkg.departure_date ? fmtDate(pkg.departure_date) : 'Belum diatur di paket'}</div>
              </div>
            ) : (
              <div>
                <div className="ku-facts__k">Rencana berangkat</div>
                <div className="ku-facts__v">{p.departure_plan ? formatDeparturePlan(p.departure_plan) : 'Belum diisi'}</div>
              </div>
            )}
            <div>
              <div className="ku-facts__k">{komisi?.type === 'final' ? 'Komisi agen' : komisi?.type === 'dibatalkan' ? 'Komisi agen (dibatalkan)' : 'Potensi komisi agen'}</div>
              <div className="ku-facts__v">{data?.agent && komisi ? fmtRupiah(komisi.direct_amount) : '—'}</div>
            </div>
            {pkg?.price ? (
              <div>
                <div className="ku-facts__k">Nilai paket</div>
                <div className="ku-facts__v">{fmtRupiah(pkg.price * (p.jumlah_jamaah && p.jumlah_jamaah > 0 ? p.jumlah_jamaah : 1))}</div>
              </div>
            ) : null}
            {komisi?.type === 'final' && (komisi.held_amount || komisi.released_amount) ? (
              <div>
                <div className="ku-facts__k">Tertahan / siap cair</div>
                <div className="ku-facts__v">{fmtRupiah(komisi.held_amount ?? 0)} / {fmtRupiah(komisi.released_amount ?? 0)}</div>
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="ku-label">Asal prospek</h3>
            <div className="ku-trail">
              <div>
                <ChannelTag channel={channelOf(p.source_channel, p.agent_id)} detail={data?.agent?.name ?? null} />
                <span className="ku-trail__when">
                  {p.entry_method === 'agent_manual' ? 'Dicatat manual oleh agen' : 'Mengisi form minat di website'} · {formatDateTimeWIB(p.created_at)}
                </span>
              </div>
              {(p.utm_source || p.utm_campaign) && (
                <div>
                  Kampanye iklan
                  <span className="ku-trail__when">{[p.utm_source, p.utm_medium, p.utm_campaign].filter(Boolean).join(' · ')}</span>
                </div>
              )}
              {p.consent_at && (
                <div>
                  Menyetujui dihubungi
                  <span className="ku-trail__when">{formatDateTimeWIB(p.consent_at)}</span>
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="ku-label">Catatan</h3>
            {!anonymized && (
              <form
                className="pr-note-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim()) run(() => addProspectNote(id, note.trim()), () => setNote(''));
                }}
              >
                <textarea className="ku-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tulis catatan follow-up untuk tim dan agen" aria-label="Catatan baru" />
                <Button size="sm" type="submit" disabled={!note.trim() || busy}>Simpan catatan</Button>
              </form>
            )}
            {data!.notes.length === 0 ? (
              <p className="pr-hint">Belum ada catatan.</p>
            ) : (
              <ul className="pr-notes">
                {data!.notes.map((n) => (
                  <li key={n.id} className={n.author_type === 'system' ? 'pr-note pr-note--system' : 'pr-note'}>
                    <div className="ku-muted ku-small">
                      {n.author_type === 'system' ? 'Sistem' : `${n.author_name || (n.author_type === 'agent' ? 'Agen' : 'Admin')}${n.author_type === 'agent' ? ' (agen)' : ''}`} · {formatDateTimeWIB(n.created_at)}
                    </div>
                    <div className="pr-note__text">{n.note_text}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="ku-label">Riwayat status</h3>
            <div className="ku-trail">
              {data!.status_history.map((h) => (
                <div key={h.id}>
                  {h.old_status && (
                    <>
                      {PROSPECT_STATUS[h.old_status]?.label ?? h.old_status}{' '}
                      <ArrowRight size={14} aria-label="menjadi" style={{ verticalAlign: 'middle' }} />{' '}
                    </>
                  )}
                  {PROSPECT_STATUS[h.new_status]?.label ?? h.new_status}
                  <span className="ku-trail__when">
                    {h.changed_by_name || (h.changed_by_type === 'agent' ? 'Agen' : 'Admin')} · {formatDateTimeWIB(h.changed_at)}
                  </span>
                </div>
              ))}
              <div>
                Prospek masuk
                <span className="ku-trail__when">{formatDateTimeWIB(p.created_at)}</span>
              </div>
            </div>
          </section>
        </div>
      )}

      <EditProspectModal
        open={editing && !!data}
        detail={data}
        packages={packages}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          load();
          onChanged();
        }}
      />

      {/* ---------- Dialogs ---------- */}
      <Modal
        open={dialog === 'closing'}
        onClose={() => setDialog(null)}
        title={confirmClosing ? 'Konfirmasi closing' : 'Ubah status ke Closing'}
        description="Closing berarti jamaah sudah membayar DP."
        footer={
          <>
            <Button onClick={() => setDialog(null)} disabled={busy}>Batal</Button>
            {confirmClosing ? (
              <Button variant="primary" disabled={busy} onClick={() => run(() => updateProspectStatus(id, 'closing'))}>
                {data?.agent && !commissionGap ? 'Ya, closing & bukukan komisi' : 'Ya, closing'}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setConfirmClosing(true)}>Lanjutkan</Button>
            )}
          </>
        }
      >
        <div className="ku-stack">
          {actionError && <Banner tone="danger">{actionError}</Banner>}
          {confirmClosing ? (
            <p className="pr-dialog-text">
              Closing untuk <b>{p?.name}</b> tidak bisa diubah ke status lain. Jika jamaah batal nanti, gunakan <b>Batalkan closing</b>.
            </p>
          ) : commissionGap ? (
            <Banner tone="warning" icon={<AlertTriangle className="ku-icon--sm" />}>
              <b>{commissionGap}</b>, jadi komisi agen tidak dibukukan. Isi paket lewat Edit data dulu jika agen berhak komisi.
            </Banner>
          ) : data?.agent ? (
            <p className="pr-dialog-text">{closingCommissionNote(data.agent.name, releasePolicy)}</p>
          ) : null}
          {seatsWarning && (
            <Banner tone="warning" icon={<AlertTriangle className="ku-icon--sm" />}>
              {seatsWarning}
            </Banner>
          )}
        </div>
      </Modal>

      <Modal
        open={dialog === 'lost'}
        onClose={() => setDialog(null)}
        title="Ubah status ke Tidak lanjut"
        footer={
          <>
            <Button onClick={() => setDialog(null)} disabled={busy}>Batal</Button>
            <Button variant="primary" disabled={busy} onClick={submitLost}>Simpan</Button>
          </>
        }
      >
        <div className="ku-stack">
          {actionError && <Banner tone="danger">{actionError}</Banner>}
          <Field label="Alasan">
            {(id) => <Select id={id} label="Alasan tidak lanjut" value={lostCategory} onChange={setLostCategory} options={[{ value: '', label: 'Pilih alasan' }, ...LOST_REASON_OPTIONS]} />}
          </Field>
          <Field label="Keterangan" optional={lostCategory !== 'lainnya'}>
            {(fid) => <input id={fid} className="ku-input" value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder={lostCategory === 'lainnya' ? 'Jelaskan alasannya' : 'Keterangan tambahan'} />}
          </Field>
        </div>
      </Modal>

      <Modal
        open={dialog === 'paid'}
        onClose={() => setDialog(null)}
        title="Tandai lunas"
        footer={
          <>
            <Button onClick={() => setDialog(null)} disabled={busy}>Batal</Button>
            <Button variant="primary" disabled={busy} onClick={() => run(() => markProspectPaidOff(id))}>Tandai lunas</Button>
          </>
        }
      >
        <div className="ku-stack">
          {actionError && <Banner tone="danger">{actionError}</Banner>}
          <p className="pr-dialog-text">
            Tandai <b>{p?.name}</b> sudah melunasi pembayaran.{paidOffDialogNote(!!data?.agent, komisi)}
          </p>
        </div>
      </Modal>

      <Modal
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title="Batalkan closing"
        description="Status menjadi Tidak lanjut (batal setelah DP)."
        footer={
          <>
            <Button onClick={() => setDialog(null)} disabled={busy}>Kembali</Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => (cancelReason.trim() ? run(() => cancelProspectClosing(id, cancelReason.trim())) : setActionError('Alasan pembatalan wajib diisi.'))}
            >
              Batalkan closing
            </Button>
          </>
        }
      >
        <div className="ku-stack">
          {actionError && <Banner tone="danger">{actionError}</Banner>}
          {data?.agent && <p className="pr-dialog-text">Komisi agen untuk prospek ini ikut dibatalkan.</p>}
          <Field label="Alasan pembatalan">
            {(fid) => <input id={fid} className="ku-input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Contoh: jamaah mengundurkan diri" />}
          </Field>
        </div>
      </Modal>

      <Modal
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title="Hapus prospek"
        footer={
          <>
            <Button onClick={() => setDialog(null)} disabled={busy}>Batal</Button>
            <Button variant="danger" disabled={busy} onClick={() => run(() => deleteProspect(id), onDeleted)}>Hapus permanen</Button>
          </>
        }
      >
        <div className="ku-stack">
          {actionError && <Banner tone="danger">{actionError}</Banner>}
          <p className="pr-dialog-text">
            Hapus <b>{p?.name}</b> beserta catatan dan riwayat statusnya? Gunakan untuk data spam atau data uji. Tindakan ini tidak dapat dibatalkan.
          </p>
        </div>
      </Modal>

      <Modal
        open={dialog === 'anonymize'}
        onClose={() => setDialog(null)}
        title="Hapus data pribadi jamaah"
        footer={
          <>
            <Button onClick={() => setDialog(null)} disabled={busy}>Batal</Button>
            <Button variant="danger" disabled={busy} onClick={() => run(() => anonymizeProspect(id))}>Hapus data pribadi</Button>
          </>
        }
      >
        <div className="ku-stack">
          {actionError && <Banner tone="danger">{actionError}</Banner>}
          <p className="pr-dialog-text">
            Gunakan hanya jika <b>{p?.name}</b> meminta datanya dihapus (UU PDP). Nama, nomor WhatsApp, email, domisili, dan semua catatan dihapus permanen. Status, paket, jumlah jamaah,
            dan riwayat komisi agen tetap disimpan. Tindakan ini tidak dapat dibatalkan.
          </p>
        </div>
      </Modal>
    </Drawer>
  );
};
