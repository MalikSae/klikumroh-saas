// Commissions and payouts. A commission is held for a few days after the payment is approved, then
// available; a payout request takes all available commission at once and staff transfer it by hand.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Banner, Button, Card, DataTable, EmptyState, Modal, Pill, Tabs, errorText, fmtDate, fmtPercent, fmtRupiah, type Column, type PillTone } from '../../ui';
import {
  fetchAffiliatorCommissions,
  fetchAffiliatorOverview,
  fetchAffiliatorPayouts,
  requestAffiliatorPayout,
  type AffiliatorCommission,
  type AffiliatorOverview,
  type AffiliatorPayout,
} from '../../services/affiliatorApi';
import { affiliatorPayoutState } from './payoutRule';
import './affiliator.css';

type Tab = 'commissions' | 'payouts';

const PAYOUT_STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending: { label: 'Diproses', tone: 'amber' },
  paid: { label: 'Sudah ditransfer', tone: 'green' },
  rejected: { label: 'Ditolak', tone: 'red' },
};

export const AffiliatorCommissionsView: React.FC = () => {
  const [overview, setOverview] = useState<AffiliatorOverview | null>(null);
  const [commissions, setCommissions] = useState<AffiliatorCommission[]>([]);
  const [payouts, setPayouts] = useState<AffiliatorPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('commissions');
  const [confirm, setConfirm] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const load = useCallback(() => {
    Promise.all([fetchAffiliatorOverview(), fetchAffiliatorCommissions(), fetchAffiliatorPayouts()])
      .then(([o, c, p]) => {
        setOverview(o);
        setCommissions(c);
        setPayouts(p);
        setError(null);
      })
      .catch((e) => setError(errorText(e, 'Gagal memuat komisi')))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const payoutStatus = useMemo(() => new Map(payouts.map((p) => [p.id, p.status])), [payouts]);

  const commissionColumns: Column<AffiliatorCommission>[] = useMemo(
    () => [
      { key: 'travel', header: 'Travel', cell: (c) => c.tenant_name },
      {
        key: 'status',
        header: 'Status',
        cell: (c) => {
          const ps = c.payout_id ? payoutStatus.get(c.payout_id) : undefined;
          if (ps === 'paid') return <Pill tone="green">Sudah cair</Pill>;
          if (ps === 'pending') return <Pill tone="amber">Diproses</Pill>;
          if (new Date(c.available_at) > new Date()) return <Pill>Ditahan s/d {fmtDate(c.available_at)}</Pill>;
          return <Pill tone="blue">Siap dicairkan</Pill>;
        },
      },
      { key: 'kind', header: 'Jenis', cell: (c) => (c.kind === 'first' ? 'Pembayaran pertama' : 'Perpanjangan'), mobile: 'labeled' },
      { key: 'base', header: 'Tagihan', cell: (c) => fmtRupiah(c.base_amount), align: 'right' },
      { key: 'rate', header: 'Persen', cell: (c) => fmtPercent(c.rate), align: 'right' },
      { key: 'amount', header: 'Komisi', cell: (c) => <b>{fmtRupiah(c.amount)}</b>, align: 'right' },
      { key: 'date', header: 'Disetujui', cell: (c) => fmtDate(c.created_at), mobile: 'labeled' },
    ],
    [payoutStatus],
  );

  const payoutColumns: Column<AffiliatorPayout>[] = [
    { key: 'date', header: 'Diajukan', cell: (p) => fmtDate(p.created_at) },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => {
        const s = PAYOUT_STATUS[p.status] ?? { label: p.status, tone: 'gray' as PillTone };
        return <Pill tone={s.tone}>{s.label}</Pill>;
      },
    },
    { key: 'amount', header: 'Jumlah', cell: (p) => <b>{fmtRupiah(p.amount)}</b>, align: 'right', mobile: 'line' },
    { key: 'bank', header: 'Rekening', cell: (p) => `${p.bank_name} ${p.bank_account_number} a.n. ${p.bank_account_holder}`, mobile: 'labeled' },
    { key: 'note', header: 'Catatan', cell: (p) => p.rejection_reason ?? '—', mobile: 'labeled' },
  ];

  const submitPayout = async () => {
    setRequesting(true);
    setRequestError(null);
    try {
      await requestAffiliatorPayout();
      setConfirm(false);
      setRequested(true);
      setTab('payouts');
      load();
    } catch (err) {
      setRequestError(errorText(err, 'Gagal mengajukan pencairan'));
      // A 409/400 (already pending, below minimum) means the balance shown is out of date: refresh it.
      load();
    } finally {
      setRequesting(false);
    }
  };

  const retry = (
    <Button size="sm" variant="secondary" onClick={() => { setError(null); load(); }}>
      Coba lagi
    </Button>
  );
  // Only the first load replaces the page; a failed refresh later keeps the data on screen with a banner.
  if (error && !overview) return <Banner tone="danger" action={retry}>{error}</Banner>;
  if (!overview) return <p className="af-muted">Memuat...</p>;

  const a = overview.affiliator;
  const b = overview.balance;
  const { canRequest, reason } = affiliatorPayoutState(overview, fmtRupiah);

  return (
    <div className="af-stack">
      {error && <Banner tone="danger" action={retry}>{error}</Banner>}
      {requested && <Banner tone="success">Pengajuan pencairan terkirim. Tim KlikUmroh akan mentransfer ke rekening Anda.</Banner>}

      <section className="af-balance" aria-label="Saldo komisi">
        <div>
          <div className="af-balance__label">Komisi siap dicairkan</div>
          <div className="af-balance__value">{fmtRupiah(b.available)}</div>
          {reason && <div className="af-balance__note">{reason}</div>}
        </div>
        <Button variant="primary" disabled={!canRequest} onClick={() => { setRequestError(null); setConfirm(true); }}>
          Ajukan pencairan
        </Button>
      </section>

      <dl className="af-stats" aria-label="Rincian saldo">
        <div><dt>Ditahan</dt><dd>{fmtRupiah(b.held)}</dd></div>
        <div><dt>Diproses</dt><dd>{fmtRupiah(b.requested)}</dd></div>
        <div><dt>Sudah cair</dt><dd>{fmtRupiah(b.paid)}</dd></div>
      </dl>

      <Card>
        <div className="af-tabs">
          <Tabs<Tab>
            label="Komisi dan pencairan"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'commissions', label: 'Komisi', count: commissions.length },
              { id: 'payouts', label: 'Pencairan', count: payouts.length },
            ]}
          />
        </div>
        {tab === 'commissions' ? (
          <DataTable
            columns={commissionColumns}
            rows={commissions}
            rowKey={(c) => c.id}
            loading={loading}
            empty={<EmptyState icon={<Wallet className="ku-icon" aria-hidden="true" />} title="Belum ada komisi" description="Komisi tercatat saat pembayaran travel Anda disetujui tim KlikUmroh." compact />}
          />
        ) : (
          <DataTable
            columns={payoutColumns}
            rows={payouts}
            rowKey={(p) => p.id}
            loading={loading}
            empty={<EmptyState icon={<Wallet className="ku-icon" aria-hidden="true" />} title="Belum ada pencairan" compact />}
          />
        )}
      </Card>

      <Modal
        open={confirm}
        onClose={() => !requesting && setConfirm(false)}
        title="Ajukan pencairan"
        description={`${fmtRupiah(b.available)} akan ditransfer ke ${a.bank_name} ${a.bank_account_number} a.n. ${a.bank_account_holder}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={requesting}>Batal</Button>
            <Button variant="primary" onClick={submitPayout} disabled={requesting}>{requesting ? 'Mengirim...' : 'Ajukan'}</Button>
          </>
        }
      >
        {requestError && <Banner tone="danger">{requestError}</Banner>}
      </Modal>
    </div>
  );
};
