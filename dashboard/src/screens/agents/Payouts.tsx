// Pencairan komisi: agents' withdrawal requests. Approve, transfer outside the app, then mark as transferred.
import React, { useEffect, useMemo, useState } from 'react';
import { approvePayoutRequest, fetchPayoutRequests, markPayoutRequestPaid, rejectPayoutRequest, type PayoutRequestItem } from '../../services/api';
import { Banner, Button, DataTable, EmptyState, Field, FilterMenu, Metric, MetricStrip, Modal, Pill, SearchField, Select, Toolbar, errorText, fmtAgo, fmtNumber, fmtRupiah, fmtRupiahShort, type Column } from '../../ui';
import { CopyText, PAYOUT_STATUS } from './shared';
import { todayWIB } from '../../utils/datetime';

/** Metric value that fits one line in a 2 x 2 phone strip: below Rp 1 jt in thousands ("Rp 700 rb"); full amount in the tooltip. */
const fmtMetricRupiah = (n: number) =>
  n >= 1e3 && n < 1e6 ? `Rp ${(n / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb` : fmtRupiahShort(n);

type View = 'todo' | 'pending' | 'approved' | 'paid' | 'rejected' | 'all';
type DialogKind = 'approve' | 'paid' | 'reject' | 'cancel';
type Dialog = null | { kind: DialogKind; item: PayoutRequestItem };

export const Payouts: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [items, setItems] = useState<PayoutRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('todo');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // keepError: after a failed action the error banner must survive the reload that follows it.
  const load = (keepError = false) =>
    fetchPayoutRequests()
      .then((list) => {
        setItems(list);
        if (!keepError) setError(null);
      })
      .catch((e) => setError(errorText(e, 'Gagal memuat pencairan')))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((p) => (view === 'all' ? true : view === 'todo' ? p.status === 'pending' || p.status === 'approved' : p.status === view))
      .filter((p) => !q || [p.agent_name, p.agent_phone, p.bank_account_holder_snapshot].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [items, view, search]);

  // Totals per step. "Bulan ini" uses the last update of a paid request (the moment it was marked transferred).
  const sum = useMemo(() => {
    const thisMonth = todayWIB().slice(0, 7);
    const add = (acc: { amount: number; count: number }, p: PayoutRequestItem) => ({ amount: acc.amount + p.amount_requested, count: acc.count + 1 });
    const zero = { amount: 0, count: 0 };
    const of = (pred: (p: PayoutRequestItem) => boolean) => items.filter(pred).reduce(add, zero);
    return {
      pending: of((p) => p.status === 'pending'),
      approved: of((p) => p.status === 'approved'),
      paid: of((p) => p.status === 'paid'),
      paidMonth: of((p) => {
        if (p.status !== 'paid') return false;
        // Compare WIB year-month: a payout paid on the 1st at 06:00 WIB is still the previous month in UTC.
        const d = new Date(p.updated_at);
        return !Number.isNaN(d.getTime()) && todayWIB(d).slice(0, 7) === thisMonth;
      }),
    };
  }, [items]);

  const open = (kind: DialogKind, item: PayoutRequestItem) => {
    setReason('');
    setReasonError(null);
    setDialog({ kind, item });
  };

  const confirm = async () => {
    if (!dialog) return;
    const { kind, item } = dialog;
    if ((kind === 'reject' || kind === 'cancel') && !reason.trim()) {
      setReasonError(kind === 'cancel' ? 'Alasan pembatalan wajib diisi.' : 'Alasan penolakan wajib diisi.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === 'approve') await approvePayoutRequest(item.id);
      if (kind === 'paid') await markPayoutRequestPaid(item.id);
      // Cancelling an approved request uses the same reject endpoint (status 'approved' is allowed, reason required).
      if (kind === 'reject' || kind === 'cancel') await rejectPayoutRequest(item.id, reason.trim());
      setDialog(null);
      await load();
      onChanged();
    } catch (e) {
      setError(errorText(e, 'Gagal memproses pencairan'));
      setDialog(null);
      // A 409/404 means another admin already changed this request, or the agent's balance no longer covers it
      // (the server text says so): reload so the row shows its real status, keeping the error banner.
      await load(true);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<PayoutRequestItem>[] = [
    {
      key: 'agent',
      header: 'Agen',
      cell: (p) => (
        <span className="ag-name">
          {p.agent_name || `Agen #${p.agent_id}`}
          {p.agent_phone && <span className="ku-muted">{p.agent_phone}</span>}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Jumlah',
      align: 'right',
      mobile: 'line',
      cell: (p) => <b className="ku-num">{fmtRupiah(p.amount_requested)}</b>,
      mobileCell: (p) => <b className="ku-num ag-pay-amount">{fmtRupiah(p.amount_requested)}</b>,
    },
    {
      key: 'bank',
      header: 'Rekening tujuan',
      cell: (p) => (
        <span className="ag-name">
          <span>
            {p.bank_name_snapshot} · <CopyText value={p.bank_account_number_snapshot.replace(/\s/g, '')} label="nomor rekening">{p.bank_account_number_snapshot}</CopyText>
          </span>
          <span className="ku-muted">a.n. {p.bank_account_holder_snapshot}</span>
        </span>
      ),
    },
    { key: 'when', header: 'Diajukan', mobile: 'labeled', cell: (p) => fmtAgo(p.created_at) },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => (
        <span className="ag-name">
          <Pill tone={PAYOUT_STATUS[p.status]?.tone}>{PAYOUT_STATUS[p.status]?.label ?? p.status}</Pill>
          {p.status === 'rejected' && p.rejection_reason && <span className="ku-muted">{p.rejection_reason}</span>}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (p) =>
        p.status === 'pending' ? (
          <span className="ag-row-actions">
            <Button size="sm" variant="ghost" onClick={() => open('reject', p)}>
              Tolak
            </Button>
            <Button size="sm" variant="secondary" onClick={() => open('approve', p)}>
              Setujui
            </Button>
          </span>
        ) : p.status === 'approved' ? (
          <span className="ag-row-actions">
            <Button size="sm" variant="ghost" onClick={() => open('cancel', p)}>
              Batalkan
            </Button>
            <Button size="sm" variant="secondary" onClick={() => open('paid', p)}>
              Tandai sudah ditransfer
            </Button>
          </span>
        ) : null,
    },
  ];

  const d = dialog;
  const title = !d ? '' : d.kind === 'approve' ? 'Setujui pencairan?' : d.kind === 'paid' ? 'Tandai sudah ditransfer?' : d.kind === 'cancel' ? 'Batalkan pencairan?' : 'Tolak pencairan?';
  const desc = !d
    ? undefined
    : d.kind === 'approve'
      ? `${fmtRupiah(d.item.amount_requested)} untuk ${d.item.agent_name}. Setelah disetujui, transfer ke rekening agen lalu tandai sudah ditransfer.`
      : d.kind === 'paid'
        ? `Pastikan ${fmtRupiah(d.item.amount_requested)} sudah Anda transfer ke ${d.item.bank_name_snapshot} ${d.item.bank_account_number_snapshot} a.n. ${d.item.bank_account_holder_snapshot}.`
        : d.kind === 'cancel'
          ? `Pencairan yang sudah disetujui ini dibatalkan dan tidak perlu ditransfer. ${fmtRupiah(d.item.amount_requested)} kembali ke saldo siap cair ${d.item.agent_name}, lalu agen bisa mengajukan ulang.`
          : `Saldo ${fmtRupiah(d.item.amount_requested)} kembali ke saldo siap cair ${d.item.agent_name}.`;

  return (
    <section className="ku-list">
      {/* Money at each step, so the admin sees what to approve, what to transfer, and what went out. The
          "Siap ditransfer" metric replaces the old info banner with the same amount. */}
      <MetricStrip label="Ringkasan pencairan komisi">
        <Metric label="Perlu disetujui" value={loading ? '—' : fmtMetricRupiah(sum.pending.amount)} note={loading ? undefined : `${fmtNumber(sum.pending.count)} pengajuan`} hint={loading ? undefined : `${fmtNumber(sum.pending.count)} pengajuan menunggu persetujuan, total ${fmtRupiah(sum.pending.amount)}`} />
        <Metric label="Siap ditransfer" value={loading ? '—' : fmtMetricRupiah(sum.approved.amount)} note={loading ? undefined : `${fmtNumber(sum.approved.count)} pengajuan`} hint={loading ? undefined : `${fmtNumber(sum.approved.count)} pengajuan disetujui, total ${fmtRupiah(sum.approved.amount)}. Transfer ke rekening agen lalu tandai sudah ditransfer.`} />
        <Metric label="Ditransfer bulan ini" value={loading ? '—' : fmtMetricRupiah(sum.paidMonth.amount)} note={loading ? undefined : `${fmtNumber(sum.paidMonth.count)} pencairan`} hint={loading ? undefined : `${fmtNumber(sum.paidMonth.count)} pencairan bulan ini, total ${fmtRupiah(sum.paidMonth.amount)}`} />
        <Metric label="Total ditransfer" value={loading ? '—' : fmtMetricRupiah(sum.paid.amount)} note={loading ? undefined : `${fmtNumber(sum.paid.count)} pencairan`} hint={loading ? undefined : `${fmtNumber(sum.paid.count)} pencairan sejak awal, total ${fmtRupiah(sum.paid.amount)}`} />
      </MetricStrip>
      {error && <Banner tone="danger">{error}</Banner>}
      <Toolbar>
        <SearchField value={search} onChange={setSearch} placeholder="Cari nama agen atau pemilik rekening" />
        <FilterMenu active={view !== 'todo' ? 1 : 0} onReset={() => setView('todo')}>
          <Field label="Status">
            {(id) => (
              <Select
                id={id}
                label="Status"
                value={view}
                onChange={(v) => setView(v as View)}
                options={[
                  { value: 'todo', label: 'Perlu tindakan' },
                  { value: 'pending', label: 'Menunggu persetujuan' },
                  { value: 'approved', label: 'Siap ditransfer' },
                  { value: 'paid', label: 'Sudah ditransfer' },
                  { value: 'rejected', label: 'Ditolak' },
                  { value: 'all', label: 'Semua' },
                ]}
              />
            )}
          </Field>
        </FilterMenu>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        empty={
          view === 'todo' ? (
            <EmptyState compact title="Tidak ada pencairan yang perlu diproses" description="Pengajuan pencairan komisi dari agen muncul di sini." />
          ) : (
            <EmptyState compact title="Tidak ada pencairan" />
          )
        }
      />
      <Modal
        open={Boolean(d)}
        onClose={() => setDialog(null)}
        title={title}
        description={desc}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
              Batal
            </Button>
            <Button variant={d?.kind === 'reject' || d?.kind === 'cancel' ? 'danger' : 'primary'} onClick={confirm} disabled={busy}>
              {busy ? 'Memproses...' : d?.kind === 'approve' ? 'Setujui' : d?.kind === 'paid' ? 'Sudah ditransfer' : d?.kind === 'cancel' ? 'Batalkan pencairan' : 'Tolak pencairan'}
            </Button>
          </>
        }
      >
        {(d?.kind === 'reject' || d?.kind === 'cancel') && (
          <Field label={d.kind === 'cancel' ? 'Alasan pembatalan' : 'Alasan penolakan'} error={reasonError} hint="Dikirim ke agen.">
            {(id) => <textarea id={id} className="ku-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={Boolean(reasonError)} />}
          </Field>
        )}
      </Modal>
    </section>
  );
};
