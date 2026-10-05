// Staff portal: Affiliator KlikUmroh program. Three views on one page: affiliators, payout requests
// (staff transfer by hand, then mark paid or reject), and the program settings.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, RefreshCw, Save } from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import { AdminDataGrid, type AdminColumn } from '../components/AdminDataGrid';
import { FormInput, Modal } from '../shared';
import {
  fetchAffiliatorSettings,
  fetchStaffAffiliatorPayouts,
  fetchStaffAffiliators,
  markStaffAffiliatorPayoutPaid,
  rejectStaffAffiliatorPayout,
  updateAffiliatorSettings,
  type StaffAffiliatorItem,
  type StaffAffiliatorPayout,
} from '../../../services/staffApi';
import { PAYOUT_PILL, formatDateID, formatIDR } from './affiliatorFormat';
import { parseAffiliatorDraft, toAffiliatorDraft, type AffiliatorSettingsDraft } from './affiliatorSettingsForm';
import './AdminAffiliators.css';

type View = 'affiliators' | 'payouts' | 'settings';

/** Mark-paid and reject dialogs for one payout, shared with the affiliator detail page. */
export const PayoutDialogs: React.FC<{
  target: { payout: StaffAffiliatorPayout | null; action: 'paid' | 'reject' | null };
  onClose: () => void;
  onDone: (message: string) => void;
}> = ({ target, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = target.payout;

  useEffect(() => {
    setReason('');
    setError(null);
  }, [target.payout, target.action]);

  if (!p || !target.action) return null;

  const submit = async () => {
    if (target.action === 'reject' && !reason.trim()) {
      setError('Alasan penolakan wajib diisi.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (target.action === 'paid') {
        await markStaffAffiliatorPayoutPaid(p.id);
        onDone(`Pencairan ${formatIDR(p.amount)} untuk ${p.affiliator_name} ditandai sudah ditransfer.`);
      } else {
        await rejectStaffAffiliatorPayout(p.id, reason.trim());
        onDone(`Pencairan ${p.affiliator_name} ditolak. Komisinya kembali ke saldo affiliator.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses pencairan');
    } finally {
      setBusy(false);
    }
  };

  const paid = target.action === 'paid';
  return (
    <Modal
      isOpen
      onClose={() => !busy && onClose()}
      title={paid ? 'Tandai sudah ditransfer' : 'Tolak pencairan'}
      footer={
        <>
          <button type="button" className="sa-btn sa-btn--secondary" onClick={onClose} disabled={busy}>Batal</button>
          <button type="button" className={`sa-btn ${paid ? 'sa-btn--primary' : 'sa-btn--danger'}`} onClick={submit} disabled={busy}>
            {busy ? 'Memproses...' : paid ? 'Sudah ditransfer' : 'Tolak'}
          </button>
        </>
      }
    >
      <p className="sa-aff-modal-text">
        {paid
          ? `Pastikan ${formatIDR(p.amount)} sudah ditransfer ke ${p.bank_name} ${p.bank_account_number} a.n. ${p.bank_account_holder}.`
          : 'Komisi dalam pengajuan ini kembali ke saldo affiliator dan bisa diajukan lagi.'}
      </p>
      {!paid && (
        <FormInput type="textarea" label="Alasan penolakan" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: nama pemilik rekening tidak sesuai" />
      )}
      {error && <div className="sa-aff-msg sa-aff-msg--error"><AlertCircle size={14} /> {error}</div>}
    </Modal>
  );
};

export const AdminAffiliatorsView: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('affiliators');
  const [affiliators, setAffiliators] = useState<StaffAffiliatorItem[]>([]);
  const [payouts, setPayouts] = useState<StaffAffiliatorPayout[]>([]);
  const [payoutFilter, setPayoutFilter] = useState<'pending' | 'all'>('pending');
  // Typed text per field: a cleared field stays empty and is refused on save (never saved as 0).
  const [settings, setSettings] = useState<AffiliatorSettingsDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [target, setTarget] = useState<{ payout: StaffAffiliatorPayout | null; action: 'paid' | 'reject' | null }>({ payout: null, action: null });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, p, s] = await Promise.all([fetchStaffAffiliators(), fetchStaffAffiliatorPayouts('all'), fetchAffiliatorSettings()]);
      setAffiliators(a);
      setPayouts(p);
      setSettings(toAffiliatorDraft(s));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data affiliator');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const pending = useMemo(() => payouts.filter((p) => p.status === 'pending'), [payouts]);
  const shownPayouts = payoutFilter === 'pending' ? pending : payouts;
  const active = affiliators.filter((a) => a.status === 'active').length;
  const totalEarned = affiliators.reduce((sum, a) => sum + a.total_earned, 0);

  const affiliatorColumns: AdminColumn<StaffAffiliatorItem>[] = [
    {
      key: 'name',
      label: 'Affiliator',
      render: (a) => (
        <span>
          <span className="sa-aff-name">{a.name}</span>
          <span className="sa-aff-sub">{a.email}</span>
        </span>
      ),
    },
    { key: 'coupon_code', label: 'Kupon', render: (a) => (a.coupon_code ? <span className="sa-aff-code">{a.coupon_code}</span> : '-') },
    { key: 'link_code', label: 'Kode link', render: (a) => <span className="sa-aff-code">{a.link_code}</span> },
    { key: 'tenant_count', label: 'Travel', align: 'right', render: (a) => a.tenant_count.toLocaleString('id-ID') },
    { key: 'total_earned', label: 'Total komisi', align: 'right', render: (a) => <span className="sa-aff-amount">{formatIDR(a.total_earned)}</span> },
    {
      key: 'rates',
      label: 'Persen',
      render: (a) =>
        a.first_rate !== null || a.renewal_rate !== null ? (
          <span className="sa-pill sa-pill--neutral">Khusus</span>
        ) : (
          <span className="sa-aff-sub">Default</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (a) => <span className={`sa-pill ${a.status === 'active' ? 'sa-pill--green' : 'sa-pill--neutral'}`}>{a.status === 'active' ? 'Aktif' : 'Nonaktif'}</span>,
    },
    { key: 'created_at', label: 'Bergabung', render: (a) => formatDateID(a.created_at) },
  ];

  const payoutColumns: AdminColumn<StaffAffiliatorPayout>[] = [
    { key: 'created_at', label: 'Diajukan', render: (p) => formatDateID(p.created_at) },
    { key: 'affiliator_name', label: 'Affiliator', render: (p) => <span className="sa-aff-name">{p.affiliator_name}</span> },
    { key: 'amount', label: 'Jumlah', align: 'right', render: (p) => <span className="sa-aff-amount">{formatIDR(p.amount)}</span> },
    {
      key: 'bank',
      label: 'Rekening',
      render: (p) => (
        <span>
          {p.bank_name} <span className="sa-aff-code">{p.bank_account_number}</span>
          <span className="sa-aff-sub">a.n. {p.bank_account_holder}</span>
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => {
        const s = PAYOUT_PILL[p.status] ?? { label: p.status, cls: 'sa-pill--neutral' };
        return <span className={`sa-pill ${s.cls}`} title={p.rejection_reason ?? undefined}>{s.label}</span>;
      },
    },
    {
      key: 'action',
      label: 'Aksi',
      align: 'right',
      render: (p) =>
        p.status === 'pending' ? (
          <span className="sa-aff-actions">
            <button type="button" className="sa-btn sa-btn--secondary sa-btn--sm" onClick={(e) => { e.stopPropagation(); setTarget({ payout: p, action: 'reject' }); }}>Tolak</button>
            <button type="button" className="sa-btn sa-btn--primary sa-btn--sm" onClick={(e) => { e.stopPropagation(); setTarget({ payout: p, action: 'paid' }); }}>Sudah ditransfer</button>
          </span>
        ) : (
          <span className="sa-aff-sub">{formatDateID(p.reviewed_at)}</span>
        ),
    },
  ];

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    const parsed = parseAffiliatorDraft(settings);
    if (!parsed.ok) {
      setMessage(null);
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setSettings(toAffiliatorDraft(await updateAffiliatorSettings(parsed.value)));
      setMessage('Pengaturan program affiliator disimpan. Diskon kupon berlaku untuk semua kupon affiliator yang aktif.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };
  const num = (key: keyof AffiliatorSettingsDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    settings && setSettings({ ...settings, [key]: e.target.value });

  return (
    <AdminLayout
      title="Affiliator"
      subtitle="Program Affiliator KlikUmroh: mitra yang membawa travel berlangganan"
      headerActions={
        <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'db-spin' : ''} />
          <span>Segarkan</span>
        </button>
      }
    >
      {message && <div className="sa-aff-msg sa-aff-msg--ok"><CheckCircle2 size={16} /> {message}</div>}
      {error && <div className="sa-aff-msg sa-aff-msg--error"><AlertCircle size={16} /> {error}</div>}

      <div className="sa-metric-ribbon">
        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Affiliator aktif</span>
          <div className="sa-metric-cell__val">{active.toLocaleString('id-ID')}</div>
          <span className="sa-metric-cell__sub">dari {affiliators.length.toLocaleString('id-ID')} terdaftar</span>
        </div>
        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Travel dibawa</span>
          <div className="sa-metric-cell__val">{affiliators.reduce((s, a) => s + a.tenant_count, 0).toLocaleString('id-ID')}</div>
          <span className="sa-metric-cell__sub">lewat link atau kupon affiliator</span>
        </div>
        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Total komisi</span>
          <div className="sa-metric-cell__val">{formatIDR(totalEarned)}</div>
          <span className="sa-metric-cell__sub">tercatat dari pembayaran disetujui</span>
        </div>
        <div className="sa-metric-cell">
          <span className="sa-metric-cell__label">Menunggu transfer</span>
          <div className="sa-metric-cell__val">{formatIDR(pending.reduce((s, p) => s + p.amount, 0))}</div>
          <span className="sa-metric-cell__sub">{pending.length.toLocaleString('id-ID')} pengajuan pencairan</span>
        </div>
      </div>

      <div className="sa-segmented-tabs sa-aff-tabs" role="tablist" aria-label="Affiliator">
        {([
          ['affiliators', 'Affiliator'],
          ['payouts', `Pencairan${pending.length ? ` (${pending.length})` : ''}`],
          ['settings', 'Pengaturan program'],
        ] as Array<[View, string]>).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={`sa-segmented-tab${view === id ? ' sa-segmented-tab--active' : ''}`} onClick={() => { setView(id); setMessage(null); }}>
            {label}
          </button>
        ))}
      </div>

      {view === 'affiliators' && (
        <AdminDataGrid
          title="Daftar affiliator"
          data={affiliators}
          columns={affiliatorColumns}
          loading={loading}
          searchPlaceholder="Cari nama, email, kupon..."
          searchKeys={['name', 'email', 'coupon_code', 'link_code']}
          onRowClick={(a) => navigate(`/internal/affiliators/${a.id}`)}
          emptyMessage="Belum ada affiliator terdaftar"
        />
      )}

      {view === 'payouts' && (
        <AdminDataGrid
          title="Pengajuan pencairan"
          data={shownPayouts}
          columns={payoutColumns}
          loading={loading}
          searchPlaceholder="Cari affiliator..."
          searchKeys={['affiliator_name', 'bank_account_holder']}
          tabs={[
            { key: 'pending', label: 'Menunggu transfer', count: pending.length },
            { key: 'all', label: 'Semua', count: payouts.length },
          ]}
          activeTab={payoutFilter}
          onTabChange={(k) => setPayoutFilter(k as 'pending' | 'all')}
          onRowClick={(p) => navigate(`/internal/affiliators/${p.affiliator_id}`)}
          emptyMessage={payoutFilter === 'pending' ? 'Tidak ada pencairan yang menunggu' : 'Belum ada pengajuan pencairan'}
        />
      )}

      {view === 'settings' && settings && (
        <form className="sa-panel sa-aff-settings" onSubmit={saveSettings}>
          <div className="sa-aff-settings__grid">
            <FormInput type="text" inputMode="decimal" label="Komisi pembayaran pertama (%)" value={settings.first_rate} onChange={num('first_rate')} tooltip="Persen dari tagihan setelah diskon (tanpa kode unik) pada pembayaran pertama travel yang disetujui." />
            <FormInput type="text" inputMode="decimal" label="Komisi perpanjangan (%)" value={settings.renewal_rate} onChange={num('renewal_rate')} tooltip="Persen dari setiap pembayaran perpanjangan berikutnya, selama travel terus berlangganan." />
            <FormInput type="text" inputMode="decimal" label="Diskon kupon affiliator (%)" value={settings.coupon_discount} onChange={num('coupon_discount')} tooltip="Sama untuk semua affiliator. Mengubahnya langsung berlaku untuk semua kupon affiliator yang aktif. Kupon affiliator hanya untuk pendaftaran travel baru." />
            <FormInput type="number" label="Masa tahan komisi (hari)" min={0} max={365} step={1} value={settings.hold_days} onChange={num('hold_days')} tooltip="Komisi baru bisa diajukan pencairan setelah sekian hari sejak pembayaran disetujui." />
            <FormInput type="number" label="Minimal pencairan (Rp)" min={0} step={10000} value={settings.min_payout} onChange={num('min_payout')} />
          </div>
          <p className="sa-aff-modal-text">Persen khusus per affiliator diatur di halaman detail affiliator.</p>
          <div className="sa-aff-settings__foot">
            <button type="submit" className="sa-btn sa-btn--primary" disabled={saving}>
              <Save size={14} />
              <span>{saving ? 'Menyimpan...' : 'Simpan pengaturan'}</span>
            </button>
          </div>
        </form>
      )}

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
