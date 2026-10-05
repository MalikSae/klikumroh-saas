// Staff portal: one affiliator. Balance, specification (contact, codes, bank, effective rates), actions
// (custom rates, deactivate), and its travels, commissions, and payouts.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, KeyRound, Percent, Power } from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import { AdminDataGrid, type AdminColumn } from '../components/AdminDataGrid';
import { FormInput, Modal } from '../shared';
import {
  fetchStaffAffiliatorDetail,
  resetStaffAffiliatorPassword,
  setStaffAffiliatorRates,
  setStaffAffiliatorStatus,
  type StaffAffiliatorDetail,
  type StaffAffiliatorPayout,
} from '../../../services/staffApi';
import type { AffiliatorCommission, AffiliatorTenant } from '../../../services/affiliatorApi';
import { PayoutDialogs } from './AdminAffiliatorsView';
import { PAYOUT_PILL, formatDateID, formatIDR } from './affiliatorFormat';
import { resetPasswordProblem } from '../../../utils/password';
import './AdminAffiliators.css';

const TENANT_PILL: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Menunggu pembayaran', cls: 'sa-pill--amber' },
  active: { label: 'Aktif', cls: 'sa-pill--green' },
  inactive: { label: 'Nonaktif', cls: 'sa-pill--neutral' },
};

const rateText = (n: number) => `${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;

export const AdminAffiliatorDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const affiliatorId = Number(id);
  const [data, setData] = useState<StaffAffiliatorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<'tenants' | 'commissions' | 'payouts'>('tenants');
  const [target, setTarget] = useState<{ payout: StaffAffiliatorPayout | null; action: 'paid' | 'reject' | null }>({ payout: null, action: null });
  const [ratesOpen, setRatesOpen] = useState(false);
  const [firstRate, setFirstRate] = useState('');
  const [renewalRate, setRenewalRate] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchStaffAffiliatorDetail(affiliatorId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat affiliator');
    }
  }, [affiliatorId]);
  useEffect(() => {
    void load();
  }, [load]);

  const a = data?.affiliator;
  const hasOverride = Boolean(a && (a.first_rate !== null || a.renewal_rate !== null));

  const openRates = () => {
    setFirstRate(a?.first_rate !== null && a?.first_rate !== undefined ? String(a.first_rate) : '');
    setRenewalRate(a?.renewal_rate !== null && a?.renewal_rate !== undefined ? String(a.renewal_rate) : '');
    setDialogError(null);
    setRatesOpen(true);
  };

  const saveRates = async (clear = false) => {
    const parse = (v: string) => (clear || v.trim() === '' ? null : Number(v));
    const f = parse(firstRate);
    const r = parse(renewalRate);
    if ((f !== null && (isNaN(f) || f < 0 || f > 100)) || (r !== null && (isNaN(r) || r < 0 || r > 100))) {
      setDialogError('Persen komisi harus 0-100.');
      return;
    }
    setBusy(true);
    setDialogError(null);
    try {
      await setStaffAffiliatorRates(affiliatorId, f, r);
      setRatesOpen(false);
      setMessage(clear ? 'Persen khusus dihapus, kembali ke default program.' : 'Persen khusus disimpan. Berlaku untuk komisi berikutnya.');
      await load();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Gagal menyimpan persen');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    // Sent exactly as typed (login does not trim); blank or space-padded passwords are refused.
    const problem = resetPasswordProblem(newPassword);
    if (problem) {
      setDialogError(problem);
      return;
    }
    setBusy(true);
    setDialogError(null);
    try {
      await resetStaffAffiliatorPassword(affiliatorId, newPassword);
      setResetOpen(false);
      setNewPassword('');
      setMessage('Kata sandi affiliator direset. Sesi lama sudah keluar; sampaikan kata sandi baru ke affiliator.');
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Gagal mereset kata sandi');
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async () => {
    if (!a) return;
    const next = a.status === 'active' ? 'inactive' : 'active';
    setBusy(true);
    setDialogError(null);
    try {
      await setStaffAffiliatorStatus(affiliatorId, next);
      setStatusOpen(false);
      setMessage(next === 'inactive' ? 'Affiliator dinonaktifkan. Kuponnya tidak berlaku dan tidak ada komisi baru.' : 'Affiliator diaktifkan kembali. Affiliator perlu membuat kupon baru.');
      await load();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Gagal mengubah status');
    } finally {
      setBusy(false);
    }
  };

  const tenantColumns: AdminColumn<AffiliatorTenant>[] = [
    { key: 'name', label: 'Travel', render: (t) => <span className="sa-aff-name">{t.name}</span> },
    { key: 'status', label: 'Status', render: (t) => { const s = TENANT_PILL[t.status] ?? { label: t.status, cls: 'sa-pill--neutral' }; return <span className={`sa-pill ${s.cls}`}>{s.label}</span>; } },
    { key: 'source', label: 'Lewat', render: (t) => (t.source === 'coupon' ? 'Kupon' : 'Link') },
    { key: 'affiliated_at', label: 'Mendaftar', render: (t) => formatDateID(t.affiliated_at) },
    { key: 'subscription_expires_at', label: 'Aktif sampai', render: (t) => formatDateID(t.subscription_expires_at) },
  ];

  const payoutStatus = new Map((data?.payouts ?? []).map((p) => [p.id, p.status]));
  const commissionColumns: AdminColumn<AffiliatorCommission>[] = [
    { key: 'created_at', label: 'Disetujui', render: (c) => formatDateID(c.created_at) },
    { key: 'tenant_name', label: 'Travel', render: (c) => <span className="sa-aff-name">{c.tenant_name}</span> },
    { key: 'kind', label: 'Jenis', render: (c) => (c.kind === 'first' ? 'Pembayaran pertama' : 'Perpanjangan') },
    { key: 'base_amount', label: 'Tagihan', align: 'right', render: (c) => formatIDR(c.base_amount) },
    { key: 'rate', label: 'Persen', align: 'right', render: (c) => rateText(c.rate) },
    { key: 'amount', label: 'Komisi', align: 'right', render: (c) => <span className="sa-aff-amount">{formatIDR(c.amount)}</span> },
    {
      key: 'state',
      label: 'Status',
      render: (c) => {
        const ps = c.payout_id ? payoutStatus.get(c.payout_id) : undefined;
        if (ps === 'paid') return <span className="sa-pill sa-pill--green">Sudah cair</span>;
        if (ps === 'pending') return <span className="sa-pill sa-pill--amber">Diajukan</span>;
        if (new Date(c.available_at) > new Date()) return <span className="sa-pill sa-pill--neutral">Ditahan s/d {formatDateID(c.available_at)}</span>;
        return <span className="sa-pill sa-pill--neutral">Siap dicairkan</span>;
      },
    },
  ];

  const payouts: StaffAffiliatorPayout[] = (data?.payouts ?? []).map((p) => ({ ...p, affiliator_id: affiliatorId, affiliator_name: a?.name ?? '' }));
  const payoutColumns: AdminColumn<StaffAffiliatorPayout>[] = [
    { key: 'created_at', label: 'Diajukan', render: (p) => formatDateID(p.created_at) },
    { key: 'amount', label: 'Jumlah', align: 'right', render: (p) => <span className="sa-aff-amount">{formatIDR(p.amount)}</span> },
    { key: 'bank', label: 'Rekening', render: (p) => `${p.bank_name} ${p.bank_account_number} a.n. ${p.bank_account_holder}` },
    { key: 'status', label: 'Status', render: (p) => { const s = PAYOUT_PILL[p.status] ?? { label: p.status, cls: 'sa-pill--neutral' }; return <span className={`sa-pill ${s.cls}`} title={p.rejection_reason ?? undefined}>{s.label}</span>; } },
    {
      key: 'action',
      label: 'Aksi',
      align: 'right',
      render: (p) =>
        p.status === 'pending' ? (
          <span className="sa-aff-actions">
            <button type="button" className="sa-btn sa-btn--secondary sa-btn--sm" onClick={() => setTarget({ payout: p, action: 'reject' })}>Tolak</button>
            <button type="button" className="sa-btn sa-btn--primary sa-btn--sm" onClick={() => setTarget({ payout: p, action: 'paid' })}>Sudah ditransfer</button>
          </span>
        ) : (
          <span className="sa-aff-sub">{formatDateID(p.reviewed_at)}</span>
        ),
    },
  ];

  const gridTabs = {
    tabs: [
      { key: 'tenants', label: 'Travel', count: data?.tenants.length ?? 0 },
      { key: 'commissions', label: 'Komisi', count: data?.commissions.length ?? 0 },
      { key: 'payouts', label: 'Pencairan', count: data?.payouts.length ?? 0 },
    ],
    activeTab: tab as string,
    onTabChange: (k: string) => setTab(k as typeof tab),
  };

  return (
    <AdminLayout
      title={a?.name ?? 'Affiliator'}
      subtitle={a ? `Affiliator sejak ${formatDateID(a.created_at)}` : undefined}
      onBack={() => navigate('/internal/affiliators')}
      backLabel="Affiliator"
      headerActions={
        a && (
          <div className="sa-aff-actions">
            <button type="button" className="sa-btn sa-btn--secondary" onClick={() => { setNewPassword(''); setDialogError(null); setResetOpen(true); }}>
              <KeyRound size={14} />
              <span>Reset password</span>
            </button>
            <button type="button" className="sa-btn sa-btn--secondary" onClick={openRates}>
              <Percent size={14} />
              <span>Persen khusus</span>
            </button>
            <button type="button" className={`sa-btn ${a.status === 'active' ? 'sa-btn--danger' : 'sa-btn--secondary'}`} onClick={() => { setDialogError(null); setStatusOpen(true); }}>
              <Power size={14} />
              <span>{a.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</span>
            </button>
          </div>
        )
      }
    >
      {message && <div className="sa-aff-msg sa-aff-msg--ok"><CheckCircle2 size={16} /> {message}</div>}
      {error && <div className="sa-aff-msg sa-aff-msg--error"><AlertCircle size={16} /> {error}</div>}

      {data && a && (
        <>
          <div className="sa-metric-ribbon">
            <div className="sa-metric-cell">
              <span className="sa-metric-cell__label">Ditahan</span>
              <div className="sa-metric-cell__val">{formatIDR(data.balance.held)}</div>
              <span className="sa-metric-cell__sub">masa tahan {data.hold_days} hari</span>
            </div>
            <div className="sa-metric-cell">
              <span className="sa-metric-cell__label">Siap dicairkan</span>
              <div className="sa-metric-cell__val">{formatIDR(data.balance.available)}</div>
              <span className="sa-metric-cell__sub">minimal {formatIDR(data.min_payout)}</span>
            </div>
            <div className="sa-metric-cell">
              <span className="sa-metric-cell__label">Menunggu transfer</span>
              <div className="sa-metric-cell__val">{formatIDR(data.balance.requested)}</div>
              <span className="sa-metric-cell__sub">pengajuan pencairan</span>
            </div>
            <div className="sa-metric-cell">
              <span className="sa-metric-cell__label">Sudah cair</span>
              <div className="sa-metric-cell__val">{formatIDR(data.balance.paid)}</div>
              <span className="sa-metric-cell__sub">{data.clicks.toLocaleString('id-ID')} klik link, {data.tenant_count.toLocaleString('id-ID')} travel</span>
            </div>
          </div>

          <section className="sa-panel sa-aff-spec">
            <div className="sa-aff-spec__head">
              <h2 className="sa-aff-spec__title">Spesifikasi</h2>
              <span className={`sa-pill ${a.status === 'active' ? 'sa-pill--green' : 'sa-pill--neutral'}`}>{a.status === 'active' ? 'Aktif' : 'Nonaktif'}</span>
            </div>
            <dl className="sa-aff-spec__list">
              <div><dt>Email</dt><dd>{a.email}</dd></div>
              <div><dt>WhatsApp</dt><dd>{a.whatsapp || '-'}</dd></div>
              <div><dt>Kode link</dt><dd className="sa-aff-code">{a.link_code}</dd></div>
              <div><dt>Kupon aktif</dt><dd className="sa-aff-code">{data.coupon_code ?? '-'}</dd></div>
              <div><dt>Komisi pertama</dt><dd>{rateText(data.first_rate)}{a.first_rate !== null ? ' (khusus)' : ''}</dd></div>
              <div><dt>Komisi perpanjangan</dt><dd>{rateText(data.renewal_rate)}{a.renewal_rate !== null ? ' (khusus)' : ''}</dd></div>
              <div><dt>Rekening</dt><dd>{a.bank_name ? `${a.bank_name} ${a.bank_account_number} a.n. ${a.bank_account_holder}` : 'Belum diisi'}</dd></div>
            </dl>
          </section>

          {tab === 'tenants' && <AdminDataGrid title="Travel" data={data.tenants} columns={tenantColumns} {...gridTabs} searchKeys={['name']} emptyMessage="Belum ada travel yang dibawa" />}
          {tab === 'commissions' && <AdminDataGrid title="Komisi" data={data.commissions} columns={commissionColumns} {...gridTabs} searchKeys={['tenant_name']} emptyMessage="Belum ada komisi" />}
          {tab === 'payouts' && <AdminDataGrid title="Pencairan" data={payouts} columns={payoutColumns} {...gridTabs} searchKeys={['bank_account_holder']} emptyMessage="Belum ada pencairan" />}
        </>
      )}

      <Modal
        isOpen={ratesOpen}
        onClose={() => !busy && setRatesOpen(false)}
        title="Persen komisi khusus"
        footer={
          <>
            {hasOverride && <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void saveRates(true)} disabled={busy}>Pakai default</button>}
            <button type="button" className="sa-btn sa-btn--secondary" onClick={() => setRatesOpen(false)} disabled={busy}>Batal</button>
            <button type="button" className="sa-btn sa-btn--primary" onClick={() => void saveRates()} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button>
          </>
        }
      >
        <p className="sa-aff-modal-text">Kosongkan untuk memakai default program. Berlaku untuk komisi berikutnya, komisi lama tidak berubah.</p>
        <div className="sa-aff-modal-fields">
          <FormInput type="number" label="Komisi pembayaran pertama (%)" min={0} max={100} step={0.5} value={firstRate} onChange={(e) => setFirstRate(e.target.value)} placeholder={data ? `Default ${rateText(data.first_rate)}` : ''} />
          <FormInput type="number" label="Komisi perpanjangan (%)" min={0} max={100} step={0.5} value={renewalRate} onChange={(e) => setRenewalRate(e.target.value)} />
        </div>
        {dialogError && <div className="sa-aff-msg sa-aff-msg--error"><AlertCircle size={14} /> {dialogError}</div>}
      </Modal>

      <Modal
        isOpen={statusOpen}
        onClose={() => !busy && setStatusOpen(false)}
        title={a?.status === 'active' ? 'Nonaktifkan affiliator' : 'Aktifkan affiliator'}
        footer={
          <>
            <button type="button" className="sa-btn sa-btn--secondary" onClick={() => setStatusOpen(false)} disabled={busy}>Batal</button>
            <button type="button" className={`sa-btn ${a?.status === 'active' ? 'sa-btn--danger' : 'sa-btn--primary'}`} onClick={() => void toggleStatus()} disabled={busy}>
              {busy ? 'Memproses...' : a?.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          </>
        }
      >
        <p className="sa-aff-modal-text">
          {a?.status === 'active'
            ? 'Affiliator tidak bisa masuk, kuponnya tidak berlaku, dan tidak mendapat komisi baru (termasuk dari perpanjangan travel yang dibawanya). Komisi yang sudah tercatat tetap bisa dicairkan.'
            : 'Affiliator bisa masuk lagi dan mendapat komisi dari pembayaran berikutnya. Kupon lama tetap nonaktif; affiliator perlu membuat kupon baru.'}
        </p>
        {dialogError && <div className="sa-aff-msg sa-aff-msg--error"><AlertCircle size={14} /> {dialogError}</div>}
      </Modal>

      <Modal
        isOpen={resetOpen}
        onClose={() => !busy && setResetOpen(false)}
        title="Reset password affiliator"
        footer={
          <>
            <button type="button" className="sa-btn sa-btn--secondary" onClick={() => setResetOpen(false)} disabled={busy}>Batal</button>
            <button type="button" className="sa-btn sa-btn--primary" onClick={() => void resetPassword()} disabled={busy || newPassword.trim() === ''}>{busy ? 'Menyimpan...' : 'Reset password'}</button>
          </>
        }
      >
        <p className="sa-aff-modal-text">Untuk affiliator yang lupa kata sandi ({a?.email}). Semua sesi affiliator ini langsung keluar. Sampaikan kata sandi baru lewat kontak yang terdaftar.</p>
        <FormInput type="text" label="Kata sandi baru" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} hint="Minimal 8 karakter." />
        {dialogError && <div className="sa-aff-msg sa-aff-msg--error"><AlertCircle size={14} /> {dialogError}</div>}
      </Modal>

      <PayoutDialogs
        target={target}
        onClose={() => setTarget({ payout: null, action: null })}
        onDone={(m) => {
          setTarget({ payout: null, action: null });
          setMessage(m);
          void load();
        }}
      />
    </AdminLayout>
  );
};
