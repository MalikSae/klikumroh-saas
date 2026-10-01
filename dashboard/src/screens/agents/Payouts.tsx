// Pencairan komisi: agents' withdrawal requests. Approve, transfer outside the app, then mark as transferred.
import React, { useEffect, useMemo, useState } from 'react';
import { approvePayoutRequest, fetchPayoutRequests, markPayoutRequestPaid, rejectPayoutRequest, type PayoutRequestItem } from '../../services/api';
import { Banner, Button, DataTable, EmptyState, Field, FilterMenu, Modal, Pill, SearchField, Select, Toolbar, errorText, fmtAgo, fmtRupiah, type Column } from '../../ui';
import { CopyText, PAYOUT_STATUS } from './shared';

type View = 'todo' | 'pending' | 'approved' | 'paid' | 'rejected' | 'all';
type Dialog = null | { kind: 'approve' | 'paid' | 'reject'; item: PayoutRequestItem };

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

  const load = () =>
    fetchPayoutRequests()
      .then(setItems)
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

  const toTransfer = items.filter((p) => p.status === 'approved').reduce((s, p) => s + p.amount_requested, 0);

  const open = (kind: 'approve' | 'paid' | 'reject', item: PayoutRequestItem) => {
    setReason('');
    setReasonError(null);
    setDialog({ kind, item });
  };

  const confirm = async () => {
    if (!dialog) return;
    const { kind, item } = dialog;
    if (kind === 'reject' && !reason.trim()) {
      setReasonError('Alasan penolakan wajib diisi.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === 'approve') await approvePayoutRequest(item.id);
      if (kind === 'paid') await markPayoutRequestPaid(item.id);
      if (kind === 'reject') await rejectPayoutRequest(item.id, reason.trim());
      setDialog(null);
      await load();
      onChanged();
    } catch (e) {
      setError(errorText(e, 'Gagal memproses pencairan'));
      setDialog(null);
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
    { key: 'amount', header: 'Jumlah', align: 'right', cell: (p) => <b className="ku-num">{fmtRupiah(p.amount_requested)}</b> },
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
    { key: 'when', header: 'Diajukan', cell: (p) => fmtAgo(p.created_at) },
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
          <Button size="sm" variant="secondary" onClick={() => open('paid', p)}>
            Tandai sudah ditransfer
          </Button>
        ) : null,
    },
  ];

  const d = dialog;
  const title = !d ? '' : d.kind === 'approve' ? 'Setujui pencairan?' : d.kind === 'paid' ? 'Tandai sudah ditransfer?' : 'Tolak pencairan?';
  const desc = !d
    ? undefined
    : d.kind === 'approve'
      ? `${fmtRupiah(d.item.amount_requested)} untuk ${d.item.agent_name}. Setelah disetujui, transfer ke rekening agen lalu tandai sudah ditransfer.`
      : d.kind === 'paid'
        ? `Pastikan ${fmtRupiah(d.item.amount_requested)} sudah Anda transfer ke ${d.item.bank_name_snapshot} ${d.item.bank_account_number_snapshot} a.n. ${d.item.bank_account_holder_snapshot}.`
        : `Saldo ${fmtRupiah(d.item.amount_requested)} kembali ke saldo siap cair ${d.item.agent_name}.`;

  return (
    <section className="ku-list">
      {error && <Banner tone="danger">{error}</Banner>}
      {toTransfer > 0 && (
        <Banner tone="info">
          <b>{fmtRupiah(toTransfer)}</b> sudah disetujui dan menunggu Anda transfer ke rekening agen.
        </Banner>
      )}
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
            <Button variant={d?.kind === 'reject' ? 'danger' : 'primary'} onClick={confirm} disabled={busy}>
              {busy ? 'Memproses...' : d?.kind === 'approve' ? 'Setujui' : d?.kind === 'paid' ? 'Sudah ditransfer' : 'Tolak pencairan'}
            </Button>
          </>
        }
      >
        {d?.kind === 'reject' && (
          <Field label="Alasan penolakan" error={reasonError} hint="Dikirim ke agen.">
            {(id) => <textarea id={id} className="ku-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={Boolean(reasonError)} />}
          </Field>
        )}
      </Modal>
    </section>
  );
};
