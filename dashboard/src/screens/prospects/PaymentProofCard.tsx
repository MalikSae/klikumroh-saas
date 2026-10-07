// A jamaah payment proof the agent sent (closing DP or pelunasan), waiting for the admin in the prospect
// drawer (founder decision 7 Oct 2026): the proof, amount and note, then Setujui (does the same as the
// admin's own Closing / Tandai lunas) or Tolak with a reason.
import React, { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { decidePaymentRequest, fetchPrivateFileUrl, type PaymentRequest } from '../../services/api';
import { Banner, Button, Field, Modal, fmtAgo, fmtRupiah } from '../../ui';

// Thumbnail of the proof. Clicking it opens the proof large in a dialog so the admin can read the amount,
// name and date on the transfer receipt (founder request 7 Oct 2026).
const Proof: React.FC<{ path: string; title: string }> = ({ path, title }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    let cancelled = false;
    fetchPrivateFileUrl(path)
      .then((x) => {
        // Closed before the file arrived: drop the blob right away instead of leaking it.
        if (cancelled) return window.URL.revokeObjectURL(x);
        u = x;
        setUrl(x);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (u) window.URL.revokeObjectURL(u);
    };
  }, [path]);
  if (failed) return <span className="pr-proof__thumb pr-proof__thumb--empty" title="Bukti gagal dimuat"><ImageIcon className="ku-icon--sm" /></span>;
  if (!url) return <span className="pr-proof__thumb" aria-busy="true" />;
  return (
    <>
      <button type="button" className="pr-proof__thumb pr-proof__thumb--btn" onClick={() => setOpen(true)} aria-label="Perbesar bukti transfer" title="Perbesar">
        <img src={url} alt="" />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        wide
        footer={
          <>
            <a className="ku-btn" href={url} target="_blank" rel="noopener noreferrer">Buka ukuran asli</a>
            <Button variant="primary" onClick={() => setOpen(false)}>Tutup</Button>
          </>
        }
      >
        <div className="pr-proof__view">
          <img src={url} alt={title} />
        </div>
      </Modal>
    </>
  );
};

export const PaymentProofCard: React.FC<{ request: PaymentRequest; agentName?: string; onDone: () => void }> = ({ request, agentName, onDone }) => {
  const [dialog, setDialog] = useState<null | 'approve' | 'reject'>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closing = request.kind === 'closing';

  const run = async (approve: boolean) => {
    if (!approve && !reason.trim()) return setError('Isi alasan penolakan.');
    setBusy(true);
    setError(null);
    try {
      await decidePaymentRequest(request.id, approve, reason.trim());
      setDialog(null);
      onDone();
    } catch (e: any) {
      setError(e.message || 'Gagal memproses bukti pembayaran.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pr-proof" aria-label={closing ? 'Bukti DP dari agen' : 'Bukti pelunasan dari agen'}>
      <div className="pr-proof__row">
        <Proof path={request.proof_url} title={closing ? 'Bukti DP dari agen' : 'Bukti pelunasan dari agen'} />
        <div className="pr-proof__text">
          <strong>{closing ? 'Bukti DP dari agen' : 'Bukti pelunasan dari agen'}</strong>
          <span>
            {[agentName, fmtAgo(request.created_at), request.amount ? fmtRupiah(request.amount) : null].filter(Boolean).join(' · ')}
          </span>
          {request.note && <span className="pr-proof__note">"{request.note}"</span>}
        </div>
      </div>
      <div className="pr-proof__actions">
        <Button size="sm" onClick={() => { setReason(''); setError(null); setDialog('reject'); }} disabled={busy}>Tolak</Button>
        <Button size="sm" variant="primary" onClick={() => { setError(null); setDialog('approve'); }} disabled={busy}>
          {closing ? 'Setujui closing' : 'Setujui lunas'}
        </Button>
      </div>

      <Modal
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        title={closing ? 'Setujui closing?' : 'Tandai lunas?'}
        description={closing ? 'Prospek menjadi Closing dan komisi agen dibukukan. Closing tidak bisa diubah ke status lain.' : 'Jamaah ditandai lunas dan komisi agen yang tertahan bisa dicairkan.'}
        footer={
          <>
            <Button onClick={() => setDialog(null)} disabled={busy}>Batal</Button>
            <Button variant="primary" onClick={() => run(true)} disabled={busy}>{busy ? 'Memproses...' : closing ? 'Ya, closing' : 'Ya, tandai lunas'}</Button>
          </>
        }
      >
        {error && <Banner tone="danger">{error}</Banner>}
      </Modal>

      <Modal
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title="Tolak bukti pembayaran?"
        description="Agen menerima alasan ini dan bisa mengirim ulang bukti yang benar."
        footer={
          <>
            <Button onClick={() => setDialog(null)} disabled={busy}>Batal</Button>
            <Button variant="danger" onClick={() => run(false)} disabled={busy}>{busy ? 'Memproses...' : 'Tolak'}</Button>
          </>
        }
      >
        <div className="ku-stack">
          {error && <Banner tone="danger">{error}</Banner>}
          <Field label="Alasan">
            {(id) => <input id={id} className="ku-input" value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: nominal tidak terbaca" />}
          </Field>
        </div>
      </Modal>
    </section>
  );
};
