// Pendaftaran: agents who signed up and wait for the travel's approval.
import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { approveAgent, fetchDashboardAgents, fetchPrivateFileUrl, rejectAgent, type AgentItem } from '../../services/api';
import { Banner, Button, DataTable, Drawer, EmptyState, Field, FilterMenu, Modal, Pill, SearchField, Select, Toolbar, errorText, fmtAgo, fmtDate, type Column } from '../../ui';
import { AGENT_STATUS, REG_PAYMENT, waHref } from './shared';

type View = 'pending' | 'rejected';

const ProofImage: React.FC<{ path: string }> = ({ path }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    fetchPrivateFileUrl(path)
      .then((x) => {
        u = x;
        setUrl(x);
      })
      .catch(() => setFailed(true));
    return () => {
      if (u) window.URL.revokeObjectURL(u);
    };
  }, [path]);
  if (failed) return <p className="ku-muted">Bukti transfer gagal dimuat.</p>;
  if (!url) return <div className="ag-proof ag-proof--loading" aria-busy="true" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="ag-proof">
      <img src={url} alt="Bukti transfer biaya pendaftaran" />
    </a>
  );
};

const RegistrationDrawer: React.FC<{ agent: AgentItem; parentName: string | null; onClose: () => void; onDone: (approved: boolean) => void }> = ({ agent, parentName, onClose, onDone }) => {
  const [dialog, setDialog] = useState<null | 'approve' | 'reject'>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pay = REG_PAYMENT[agent.payment_status];
  const wa = waHref(agent.phone);

  const run = async (fn: () => Promise<void>, approved: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setDialog(null);
      onDone(approved);
    } catch (e) {
      setError(errorText(e, 'Gagal memproses pendaftaran'));
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={agent.name}
        subtitle={
          <span className="ag-sub">
            <Pill tone={AGENT_STATUS[agent.status]?.tone}>{AGENT_STATUS[agent.status]?.label}</Pill>
            Mendaftar {fmtDate(agent.created_at)}
          </span>
        }
        footer={
          <>
            {wa && (
              <Button variant="ghost" to={wa} external icon={<MessageCircle className="ku-icon--sm" />}>
                Chat WhatsApp
              </Button>
            )}
            <span className="ag-foot-gap" />
            {agent.status === 'pending' && (
              <Button variant="secondary" onClick={() => setDialog('reject')} disabled={busy}>
                Tolak
              </Button>
            )}
            <Button variant="primary" onClick={() => setDialog('approve')} disabled={busy}>
              Setujui agen
            </Button>
          </>
        }
      >
        <div className="ag-detail">
          {error && <Banner tone="danger">{error}</Banner>}
          {agent.status === 'rejected' && agent.rejection_reason && (
            <Banner tone="danger">
              <b>Ditolak.</b> {agent.rejection_reason}
            </Banner>
          )}
          {agent.payment_status === 'awaiting_proof' && <Banner tone="warning">Agen belum mengunggah bukti transfer biaya pendaftaran.</Banner>}

          <section className="ku-facts">
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
              <div className="ku-facts__v">{parentName || 'Langsung ke travel'}</div>
            </div>
            {agent.bank_name && (
              <div className="ag-facts-wide">
                <div className="ku-facts__k">Rekening untuk komisi</div>
                <div className="ku-facts__v">
                  {agent.bank_name} · {agent.bank_account_number} · {agent.bank_account_holder}
                </div>
              </div>
            )}
          </section>

          {pay && (
            <section>
              <h3 className="ku-label ag-label-row">
                Biaya pendaftaran <Pill tone={pay.tone}>{pay.label}</Pill>
              </h3>
              {agent.payment_proof_url ? <ProofImage path={agent.payment_proof_url} /> : <p className="ku-muted">Belum ada bukti transfer.</p>}
            </section>
          )}
        </div>
      </Drawer>

      <Modal
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        title={`Setujui ${agent.name}?`}
        description={
          agent.payment_status === 'pending_verification'
            ? 'Pastikan bukti transfer sudah masuk ke rekening travel. Agen langsung bisa membagikan link referral.'
            : agent.payment_status === 'awaiting_proof'
              ? 'Agen belum mengirim bukti transfer. Setujui hanya jika pembayaran sudah Anda terima di luar aplikasi.'
              : 'Agen langsung bisa masuk dan membagikan link referral.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
              Batal
            </Button>
            <Button variant="primary" onClick={() => run(() => approveAgent(agent.id), true)} disabled={busy}>
              {busy ? 'Memproses...' : 'Setujui agen'}
            </Button>
          </>
        }
      />
      <Modal
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title={`Tolak ${agent.name}?`}
        description="Alasan dikirim ke agen agar ia bisa memperbaiki pendaftarannya."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
              Batal
            </Button>
            <Button variant="danger" onClick={() => run(() => rejectAgent(agent.id, reason), false)} disabled={busy}>
              {busy ? 'Memproses...' : 'Tolak pendaftaran'}
            </Button>
          </>
        }
      >
        <Field label="Alasan penolakan" optional>
          {(id) => <textarea id={id} className="ku-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: bukti transfer tidak terbaca" />}
        </Field>
      </Modal>
    </>
  );
};

export const Registrations: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [all, setAll] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('pending');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    fetchDashboardAgents()
      .then(setAll)
      .catch((e) => setError(errorText(e, 'Gagal memuat pendaftaran')))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const names = useMemo(() => new Map(all.map((a) => [a.id, a.name])), [all]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((a) => a.status === view)
      .filter((a) => !q || [a.name, a.phone, a.domisili].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [all, view, search]);
  const open = openId ? all.find((a) => a.id === openId) || null : null;

  const columns: Column<AgentItem>[] = [
    { key: 'name', header: 'Nama', cell: (a) => a.name },
    { key: 'phone', header: 'WhatsApp', cell: (a) => a.phone || '—' },
    { key: 'city', header: 'Domisili', cell: (a) => a.domisili || '—' },
    { key: 'parent', header: 'Direkrut oleh', cell: (a) => (a.parent_agent_id ? names.get(a.parent_agent_id) || '—' : <span className="ku-muted">Langsung</span>) },
    {
      key: 'pay',
      header: 'Biaya pendaftaran',
      cell: (a) => {
        const p = REG_PAYMENT[a.payment_status];
        return p ? <Pill tone={p.tone}>{p.label}</Pill> : <span className="ku-muted">Gratis</span>;
      },
    },
    { key: 'when', header: 'Mendaftar', cell: (a) => fmtAgo(a.created_at) },
  ];

  return (
    <section className="ku-list">
      {error && <Banner tone="danger">{error}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}
      <Toolbar>
        <SearchField value={search} onChange={setSearch} placeholder="Cari nama, nomor WhatsApp, domisili" />
        <FilterMenu active={view !== 'pending' ? 1 : 0} onReset={() => setView('pending')}>
          <Field label="Status">
            {(id) => (
              <Select
                id={id}
                label="Status"
                value={view}
                onChange={(v) => setView(v as View)}
                options={[
                  { value: 'pending', label: 'Menunggu persetujuan' },
                  { value: 'rejected', label: 'Ditolak' },
                ]}
              />
            )}
          </Field>
        </FilterMenu>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        loading={loading}
        onRowClick={(a) => {
          setNotice(null);
          setOpenId(a.id);
        }}
        empty={
          view === 'pending' ? (
            <EmptyState compact title="Tidak ada pendaftaran baru" description="Calon agen yang mendaftar lewat website travel menunggu persetujuan di sini." />
          ) : (
            <EmptyState compact title="Tidak ada pendaftaran yang ditolak" />
          )
        }
      />
      {open && (
        <RegistrationDrawer
          agent={open}
          parentName={open.parent_agent_id ? names.get(open.parent_agent_id) || null : null}
          onClose={() => setOpenId(null)}
          onDone={(approved) => {
            setNotice(approved ? `${open.name} sekarang agen aktif.` : `Pendaftaran ${open.name} ditolak.`);
            setOpenId(null);
            load();
            onChanged();
          }}
        />
      )}
    </section>
  );
};
