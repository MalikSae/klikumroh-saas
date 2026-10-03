// Agent detail page: contact, performance, daily syiar (habits), commission balance and history, account actions.
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, MessageCircle, MoreHorizontal } from 'lucide-react';
import {
  fetchAgentCommissions,
  fetchAgentDetail,
  fetchAgentPerformance,
  getFullImageUrl,
  resetAgentPassword,
  toggleAgentStatus,
  updateDashboardAgentProfile,
  type AgentDashboardDetail,
  type AgentPerformance,
  type CommissionHistoryItem,
} from '../../services/api';
import { Avatar, Banner, Button, Card, CardBody, CityInput, Field, Menu, Modal, Pill, errorText, fmtDate, fmtNumber, fmtPercent, fmtRupiah } from '../../ui';
import { AGENT_STATUS, CopyText, PAYOUT_STATUS, waHref } from './shared';
import { AgentHabits } from './AgentHabits';

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
        <Field label="Domisili" optional>{(id) => <CityInput id={id} value={domisili} onChange={setDomisili} />}</Field>
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

export const AgentDetail: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { id } = useParams();
  const agentId = Number(id);
  const navigate = useNavigate();
  const [agent, setAgent] = useState<AgentDashboardDetail | null>(null);
  const [perf, setPerf] = useState<AgentPerformance | null>(null);
  const [ledger, setLedger] = useState<CommissionHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([fetchAgentDetail(agentId), fetchAgentCommissions(agentId).catch(() => null), fetchAgentPerformance().catch(() => [] as AgentPerformance[])])
      .then(([a, c, p]) => {
        setAgent(a);
        setLedger(c ?? a.riwayat_komisi ?? []);
        setPerf(p.find((x) => x.agent_id === agentId) ?? null);
      })
      .catch((e) => setError(errorText(e, 'Gagal memuat agen')));

  useEffect(() => {
    setAgent(null);
    setError(null);
    if (!agentId) {
      setError('Agen tidak ditemukan.');
      return;
    }
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
    <div className="ag-page">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} icon={<ArrowLeft className="ku-icon--sm" />}>
          Semua agen
        </Button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {!agent ? (
        !error && <div className="ag-loading" aria-busy="true" />
      ) : (
        <>
          <header className="ag-page__head">
            <div className="ag-page__who">
              <Avatar name={agent.name} src={agent.photo_url ? getFullImageUrl(agent.photo_url) : null} size="lg" />
              <div>
                <h2 className="ag-page__title">{agent.name}</h2>
                <div className="ag-sub ku-muted">
                  {status && <Pill tone={status.tone}>{status.label}</Pill>}
                  Bergabung {fmtDate(agent.created_at)}
                </div>
              </div>
            </div>
            <div className="ag-page__actions">
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
            </div>
          </header>

          {agent.status === 'inactive' && (
            <Banner tone="warning">Prospek baru dari link referral agen ini tidak lagi tercatat atas namanya, dan agen tidak mendapat komisi override dari rekrutannya.</Banner>
          )}

          <section className="ku-facts ag-page__facts">
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
              <div className="ku-facts__k">Email</div>
              <div className="ku-facts__v">{agent.email || '—'}</div>
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

          {/* Each part of the page is its own card with a title, so sections never run into each other. */}
          <Card title="Performa" className="ag-section">
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
          </Card>

          <Card title="Syiar harian" description="Kebiasaan harian agen di portal" className="ag-section">
            <AgentHabits agentId={agent.id} />
          </Card>

          <div className="ag-page__grid">
            <Card title="Saldo komisi" className="ag-section">
              <CardBody>
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
              </CardBody>
            </Card>

            <Card title="Riwayat komisi" className="ag-section">
              <CardBody>
              {ledger.length === 0 ? (
                <p className="ku-muted">Belum ada komisi.</p>
              ) : (
                <ul className="ag-ledger">
                  {ledger.map((c) => {
                    // Cross-check: a commission opens its prospect, a payout opens Pencairan komisi.
                    const to = c.source === 'payout' ? '/payouts' : c.prospect_id ? `/prospects/${c.prospect_id}` : null;
                    const body = (
                      <>
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
                        {to && <ChevronRight className="ku-icon--sm ag-ledger__go" aria-hidden="true" />}
                      </>
                    );
                    return (
                      <li key={`${c.source}-${c.id}`}>
                        {to ? (
                          <Link to={to} className="ag-ledger__row ag-ledger__row--link" title={c.source === 'payout' ? 'Buka pencairan komisi' : 'Buka prospek'}>
                            {body}
                          </Link>
                        ) : (
                          <div className="ag-ledger__row">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              </CardBody>
            </Card>
          </div>
        </>
      )}

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
    </div>
  );
};
