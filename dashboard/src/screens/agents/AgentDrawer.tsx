// Agent drawer: contact, performance, commission balance and history, account actions.
import React, { useEffect, useState } from 'react';
import { MessageCircle, MoreHorizontal } from 'lucide-react';
import {
  fetchAgentCommissions,
  fetchAgentDetail,
  resetAgentPassword,
  toggleAgentStatus,
  updateDashboardAgentProfile,
  type AgentDashboardDetail,
  type AgentPerformance,
  type CommissionHistoryItem,
} from '../../services/api';
import { Banner, Button, Drawer, Field, Menu, Modal, Pill, errorText, fmtDate, fmtNumber, fmtPercent, fmtRupiah } from '../../ui';
import { AGENT_STATUS, CopyText, PAYOUT_STATUS, waHref } from './shared';

type Dialog = null | 'edit' | 'password' | 'deactivate';
const MIN_PASSWORD = 8;

const EditAgentModal: React.FC<{ agent: AgentDashboardDetail; onClose: () => void; onSaved: () => void }> = ({ agent, onClose, onSaved }) => {
  const [name, setName] = useState(agent.name);
  const [phone, setPhone] = useState(agent.phone || '');
  const [email, setEmail] = useState(agent.email || '');
  const [domisili, setDomisili] = useState(agent.domisili || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama agen wajib diisi.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateDashboardAgentProfile(agent.id, { name: name.trim(), phone: phone.trim(), email: email.trim(), domisili: domisili.trim() });
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Gagal menyimpan profil agen'));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Ubah profil agen"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button variant="primary" type="submit" form="ag-edit" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </>
      }
    >
      <form id="ag-edit" className="ag-form" onSubmit={save} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label="Nama">{(id) => <input id={id} className="ku-input" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Nomor WhatsApp">{(id) => <input id={id} className="ku-input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
        <Field label="Email" optional>{(id) => <input id={id} className="ku-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Domisili" optional>{(id) => <input id={id} className="ku-input" value={domisili} onChange={(e) => setDomisili(e.target.value)} />}</Field>
      </form>
    </Modal>
  );
};

const ResetPasswordModal: React.FC<{ agent: AgentDashboardDetail; onClose: () => void }> = ({ agent, onClose }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Password minimal ${MIN_PASSWORD} karakter.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await resetAgentPassword(agent.id, password);
      setDone(true);
    } catch (err) {
      setError(errorText(err, 'Gagal mereset password'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Reset password agen"
      description={done ? undefined : `${agent.name} keluar dari semua perangkat dan masuk lagi dengan password baru ini.`}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Selesai
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" type="submit" form="ag-reset" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Reset password'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Banner tone="success">Password baru tersimpan. Kirimkan ke agen lewat WhatsApp.</Banner>
      ) : (
        <form id="ag-reset" className="ag-form" onSubmit={save} noValidate>
          <Field label="Password baru" error={error} hint={`Minimal ${MIN_PASSWORD} karakter.`}>
            {(id) => <input id={id} className="ku-input" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(error)} />}
          </Field>
        </form>
      )}
    </Modal>
  );
};

export const AgentDrawer: React.FC<{ agentId: number; perf: AgentPerformance | null; onClose: () => void; onChanged: () => void }> = ({ agentId, perf, onClose, onChanged }) => {
  const [agent, setAgent] = useState<AgentDashboardDetail | null>(null);
  const [ledger, setLedger] = useState<CommissionHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([fetchAgentDetail(agentId), fetchAgentCommissions(agentId).catch(() => null)])
      .then(([a, c]) => {
        setAgent(a);
        setLedger(c ?? a.riwayat_komisi ?? []);
      })
      .catch((e) => setError(errorText(e, 'Gagal memuat agen')));

  useEffect(() => {
    setAgent(null);
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const setStatus = async (action: 'activate' | 'deactivate') => {
    if (!agent) return;
    setBusy(true);
    try {
      await toggleAgentStatus(agent.id, action);
      setDialog(null);
      await load();
      onChanged();
    } catch (e) {
      setError(errorText(e, 'Gagal mengubah status agen'));
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const status = agent ? AGENT_STATUS[agent.status] : null;
  const wa = waHref(agent?.phone);
  const inProcess = (agent?.riwayat_pencairan || []).filter((p) => p.status === 'pending' || p.status === 'approved').reduce((sum, p) => sum + p.amount, 0);
  const prospects = perf ? perf.baru + perf.dihubungi + perf.tertarik + perf.closing + perf.tidak_lanjut : 0;

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={agent?.name ?? 'Memuat agen...'}
        subtitle={
          agent && (
            <span className="ag-sub">
              {status && <Pill tone={status.tone}>{status.label}</Pill>}
              Bergabung {fmtDate(agent.created_at)}
            </span>
          )
        }
        footer={
          agent && (
            <>
              <Menu
                label="Aksi agen"
                trigger={<MoreHorizontal className="ku-icon--sm" />}
                items={[
                  { label: 'Ubah profil', onClick: () => setDialog('edit') },
                  { label: 'Reset password', onClick: () => setDialog('password') },
                  ...(agent.status === 'active'
                    ? [{ label: 'Nonaktifkan agen', danger: true, onClick: () => setDialog('deactivate') }]
                    : agent.status === 'inactive'
                      ? [{ label: 'Aktifkan kembali', onClick: () => setStatus('activate') }]
                      : []),
                ]}
              />
              {wa && (
                <Button variant="primary" to={wa} external icon={<MessageCircle className="ku-icon--sm" />}>
                  Chat WhatsApp
                </Button>
              )}
            </>
          )
        }
      >
        {error && <Banner tone="danger">{error}</Banner>}
        {!agent ? (
          !error && <div className="ag-loading" aria-busy="true" />
        ) : (
          <div className="ag-detail">
            {agent.status === 'inactive' && (
              <Banner tone="warning">Prospek baru dari link referral agen ini tidak lagi tercatat atas namanya, dan agen tidak mendapat komisi override dari rekrutannya.</Banner>
            )}

            <section className="ku-facts">
              <div>
                <div className="ku-facts__k">Kode referral</div>
                <div className="ku-facts__v">
                  <CopyText value={agent.referral_code} label="kode referral" />
                </div>
              </div>
              <div>
                <div className="ku-facts__k">WhatsApp</div>
                <div className="ku-facts__v">{agent.phone || '—'}</div>
              </div>
              <div>
                <div className="ku-facts__k">Domisili</div>
                <div className="ku-facts__v">{agent.domisili || '—'}</div>
              </div>
              <div>
                <div className="ku-facts__k">Direkrut oleh</div>
                <div className="ku-facts__v">{agent.parent_agent_name || 'Langsung ke travel'}</div>
              </div>
            </section>

            <section>
              <h3 className="ku-label">Performa</h3>
              <div className="ag-stats">
                <div>
                  <span>Klik 30 hari</span>
                  <b>{fmtNumber(perf?.clicks_30d ?? 0)}</b>
                </div>
                <div>
                  <span>Prospek</span>
                  <b>{fmtNumber(prospects)}</b>
                </div>
                <div>
                  <span>Jamaah closing</span>
                  <b>{fmtNumber(agent.total_jamaah_closing)}</b>
                </div>
                <div>
                  <span>Konversi</span>
                  <b>{prospects > 0 && perf ? fmtPercent((perf.closing / prospects) * 100) : '—'}</b>
                </div>
              </div>
            </section>

            <section>
              <h3 className="ku-label">Saldo komisi</h3>
              <dl className="ag-balance">
                <div>
                  <dt>Siap dicairkan</dt>
                  <dd className="ag-balance__main">{fmtRupiah(agent.saldo_siap_cair)}</dd>
                </div>
                <div>
                  <dt>Dalam proses pencairan</dt>
                  <dd>{fmtRupiah(inProcess)}</dd>
                </div>
                <div>
                  <dt>Tertahan, jamaah belum lunas</dt>
                  <dd>{fmtRupiah(agent.saldo_tertahan ?? 0)}</dd>
                </div>
                <div className="ag-balance__muted">
                  <dt>Potensi dari prospek yang berjalan</dt>
                  <dd>{fmtRupiah(agent.saldo_tertunda)}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="ku-label">Riwayat komisi</h3>
              {ledger.length === 0 ? (
                <p className="ku-muted">Belum ada komisi.</p>
              ) : (
                <ul className="ag-ledger">
                  {ledger.slice(0, 20).map((c) => (
                    <li key={`${c.source}-${c.id}`}>
                      <div className="ag-ledger__text">
                        {c.description}
                        <span className="ku-muted">
                          {fmtDate(c.created_at)}
                          {c.held ? ' · tertahan' : ''}
                          {c.source === 'payout' && c.status ? ` · ${PAYOUT_STATUS[c.status]?.label ?? c.status}` : ''}
                        </span>
                      </div>
                      <span className={c.direction === 'keluar' ? 'ag-ledger__out' : 'ag-ledger__in'}>
                        {c.direction === 'keluar' ? '−' : '+'}
                        {fmtRupiah(Math.abs(c.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>

      {agent && dialog === 'edit' && (
        <EditAgentModal
          agent={agent}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            load();
            onChanged();
          }}
        />
      )}
      {agent && dialog === 'password' && <ResetPasswordModal agent={agent} onClose={() => setDialog(null)} />}
      <Modal
        open={Boolean(agent) && dialog === 'deactivate'}
        onClose={() => setDialog(null)}
        title="Nonaktifkan agen?"
        description={agent ? `Prospek baru dari link referral ${agent.name} tidak lagi tercatat atas namanya dan agen keluar dari semua perangkat. Saldo komisi tetap tersimpan.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
              Batal
            </Button>
            <Button variant="danger" onClick={() => setStatus('deactivate')} disabled={busy}>
              {busy ? 'Memproses...' : 'Nonaktifkan'}
            </Button>
          </>
        }
      />
    </>
  );
};
