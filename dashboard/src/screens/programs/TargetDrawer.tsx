// Target drawer: progress per agent while running; after closing, who earned the reward and whether it was given.
import React, { useEffect, useState } from 'react';
import { Download, MoreHorizontal } from 'lucide-react';
import {
  closeTargetPeriod,
  deleteTarget,
  exportTargetAchievementsCSV,
  fetchTargetAchievements,
  fetchTargetProgress,
  markRewardGiven,
  type AchievementItem,
  type AgentTarget,
  type AgentTargetProgressRow,
} from '../../services/api';
import { Banner, Button, Drawer, Menu, Modal, Pill, errorText, fmtDate } from '../../ui';
import { METRIC_LABEL, METRIC_UNIT, periodText, targetName, targetState } from './targetUtil';
import { TargetModal } from './TargetModal';

type Dialog = null | 'edit' | 'close' | 'delete' | { reward: AchievementItem };

export const TargetDrawer: React.FC<{ targetId: number; onClose: () => void; onChanged: () => void }> = ({ targetId, onClose, onChanged }) => {
  const [target, setTarget] = useState<AgentTarget | null>(null);
  const [progress, setProgress] = useState<AgentTargetProgressRow[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const p = await fetchTargetProgress(targetId);
      setTarget(p.target);
      setProgress([...(p.rows ?? [])].sort((a, b) => b.achieved_value - a.achieved_value));
      setAchievements(p.target.status === 'closed' ? await fetchTargetAchievements(targetId) : []);
    } catch (e) {
      setError(errorText(e, 'Gagal memuat target'));
    }
  };

  useEffect(() => {
    setTarget(null);
    setError(null);
    setNotice(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const act = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    try {
      const msg = await fn();
      setDialog(null);
      setNotice(msg);
      await load();
      onChanged();
    } catch (e) {
      setError(errorText(e, 'Gagal memproses target'));
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const state = target ? targetState(target) : null;
  const closed = target?.status === 'closed';
  const unit = target ? METRIC_UNIT[target.metric_type] : '';
  const reached = progress.filter((r) => target && (r.achieved || r.achieved_value >= target.metric_value)).length;
  // Closing before the period is over is allowed but final: say so plainly and confirm it explicitly.
  const early = state?.key === 'running' || state?.key === 'upcoming';

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={target ? targetName(target) : 'Memuat target...'}
        subtitle={
          target &&
          state && (
            <span className="ag-sub">
              <Pill tone={state.tone}>{state.label}</Pill>
              {periodText(target)}
            </span>
          )
        }
        footer={
          target && (
            <>
              <Menu
                label="Aksi target"
                trigger={<MoreHorizontal className="ku-icon--sm" />}
                items={[
                  ...(!closed ? [{ label: 'Ubah target', onClick: () => setDialog('edit') }] : []),
                  ...(closed ? [{ label: 'Unduh CSV pencapaian', icon: <Download className="ku-icon--sm" />, onClick: () => exportTargetAchievementsCSV(target.id).catch((e) => setError(errorText(e, 'Gagal mengunduh CSV'))) }] : []),
                  // A target with reward records stays as history: the backend refuses to delete it.
                  ...(closed && achievements.length > 0 ? [] : [{ label: 'Hapus target', danger: true, onClick: () => setDialog('delete') }]),
                ]}
              />
              {!closed && (
                <Button variant={state?.key === 'ended' ? 'primary' : 'secondary'} onClick={() => setDialog('close')}>
                  Tutup periode
                </Button>
              )}
            </>
          )
        }
      >
        {error && <Banner tone="danger">{error}</Banner>}
        {notice && <Banner tone="success">{notice}</Banner>}
        {!target ? (
          !error && <div className="ag-loading" aria-busy="true" />
        ) : (
          <div className="ag-detail">
            <section className="ku-facts">
              <div>
                <div className="ku-facts__k">Yang dihitung</div>
                <div className="ku-facts__v">{METRIC_LABEL[target.metric_type]}</div>
              </div>
              <div>
                <div className="ku-facts__k">Minimal</div>
                <div className="ku-facts__v">
                  {target.metric_value} {unit}
                </div>
              </div>
              <div className="ag-facts-wide">
                <div className="ku-facts__k">Hadiah</div>
                <div className="ku-facts__v">{target.reward_description || '—'}</div>
              </div>
            </section>

            {closed ? (
              <section>
                <h3 className="ku-label">Agen yang berhak mendapat hadiah</h3>
                {achievements.length === 0 ? (
                  <p className="ku-muted">Tidak ada agen yang mencapai target ini.</p>
                ) : (
                  <ul className="pg-list">
                    {achievements.map((a) => (
                      <li key={a.id}>
                        <div className="ag-ledger__text">
                          {a.agent_name}
                          <span className="ku-muted">
                            {a.achieved_value} {unit}
                            {a.reward_status === 'given' && a.reward_given_at ? ` · diberikan ${fmtDate(a.reward_given_at)}` : ''}
                            {a.reward_status === 'pending' && (a.unpaid_jamaah_count ?? 0) > 0 ? ` · ${a.unpaid_jamaah_count} jamaah belum lunas` : ''}
                          </span>
                        </div>
                        {a.reward_status === 'given' ? (
                          <Pill tone="green">Hadiah diberikan</Pill>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setNotes('');
                              setDialog({ reward: a });
                            }}
                          >
                            Tandai diberikan
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : (
              <section>
                <h3 className="ku-label">
                  Progres agen · {reached} dari {progress.length} tercapai
                </h3>
                {progress.length === 0 ? (
                  <p className="ku-muted">Belum ada agen aktif.</p>
                ) : (
                  <ul className="pg-list">
                    {progress.map((r) => {
                      const pct = Math.min(100, Math.round((r.achieved_value / Math.max(1, target.metric_value)) * 100));
                      const done = r.achieved || r.achieved_value >= target.metric_value;
                      return (
                        <li key={r.agent_id} className="pg-progress">
                          <div className="pg-progress__top">
                            <span>{r.agent_name}</span>
                            <span className={done ? 'pg-progress__done' : 'ku-muted'}>
                              {r.achieved_value} / {target.metric_value}
                            </span>
                          </div>
                          <div className="pg-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progres ${r.agent_name}`}>
                            <span className={done ? 'pg-bar__fill pg-bar__fill--done' : 'pg-bar__fill'} style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}
      </Drawer>

      {target && dialog === 'edit' && (
        <TargetModal
          target={target}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            setNotice('Target diperbarui.');
            load();
            onChanged();
          }}
        />
      )}
      <Modal
        open={Boolean(target) && dialog === 'close'}
        onClose={() => setDialog(null)}
        title={early ? 'Tutup periode sebelum selesai?' : 'Tutup periode target?'}
        description={
          early && target
            ? `Periode target ini ${state?.key === 'upcoming' ? 'belum dimulai' : 'masih berjalan'} sampai ${fmtDate(target.period_end)}. Jika ditutup sekarang, hanya ${reached} agen yang sudah mencapai target dicatat sebagai penerima hadiah, progres agen setelah ini tidak dihitung, dan target tidak bisa diubah lagi.`
            : `${reached} agen yang mencapai target dicatat sebagai penerima hadiah. Target tidak bisa diubah setelah ditutup.`
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
              Batal
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => act(async () => { const r = await closeTargetPeriod(targetId, early); return `Periode ditutup. ${r.achieved_count} agen berhak mendapat hadiah.`; })}>
              {busy ? 'Memproses...' : early ? 'Tetap tutup sekarang' : 'Tutup periode'}
            </Button>
          </>
        }
      />
      <Modal
        open={Boolean(target) && dialog === 'delete'}
        onClose={() => setDialog(null)}
        title="Hapus target?"
        description="Target dan progresnya hilang dari dashboard agen."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
              Batal
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteTarget(targetId);
                  onChanged();
                  onClose();
                } catch (e) {
                  setError(errorText(e, 'Gagal menghapus target'));
                  setDialog(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Menghapus...' : 'Hapus target'}
            </Button>
          </>
        }
      />
      {dialog && typeof dialog === 'object' && (
        <Modal
          open
          onClose={() => setDialog(null)}
          title={`Hadiah untuk ${dialog.reward.agent_name} sudah diberikan?`}
          description={dialog.reward.reward_description_snapshot || target?.reward_description || undefined}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
                Batal
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => act(async () => { await markRewardGiven(dialog.reward.id, notes.trim() || undefined); return `Hadiah ${dialog.reward.agent_name} ditandai sudah diberikan.`; })}>
                {busy ? 'Menyimpan...' : 'Sudah diberikan'}
              </Button>
            </>
          }
        >
          <label className="ku-field">
            <span className="ku-field__label">
              Catatan <span className="ku-field__optional">(opsional)</span>
            </span>
            <textarea className="ku-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contoh: ditransfer 5 Okt ke BCA" />
          </label>
        </Modal>
      )}
    </>
  );
};
