'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Clock, CheckCircle2, AlertCircle, RefreshCw, ReceiptText } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentPage } from '../../../components/agent/AgentPage';
import { AgentPageHeader } from '../../../components/agent/AgentPageHeader';
import { BankField } from '../../../components/BankField';
import { jakartaDateLabel, jakartaTimeLabel } from '../../../lib/jakartaTime';
import { readJsonSafe, apiErrorMessage } from '../../../lib/safeJson';
import './TarikSaldo.css';

interface PendingRequest {
  id: number;
  amount_requested: number;
  status: string;
  bank_name_snapshot: string;
  bank_account_number_snapshot: string;
  bank_account_holder_snapshot: string;
  created_at: string;
}

interface PayoutInfo {
  saldo_tersedia: number;
  minimum_payout_amount: number | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  pending_request: PendingRequest | null;
}

const formatRupiah = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val);
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  // Labelled WIB: format in Asia/Jakarta, not the device time zone.
  const datePart = jakartaDateLabel(dateStr, { day: 'numeric', month: 'short', year: 'numeric' });
  if (!datePart) return dateStr;
  return `${datePart} • ${jakartaTimeLabel(dateStr)}`;
};

export default function TarikSaldoPage() {
  const router = useRouter();

  const [info, setInfo] = useState<PayoutInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form State
  const [amountStr, setAmountStr] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountHolder, setAccountHolder] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  // Saved bank account is shown as one line; the form opens when it is missing or the agent taps Ubah.
  const [editBank, setEditBank] = useState<boolean>(false);

  // keepBankForm: refresh only the balance and saved data, without overwriting what the agent typed.
  const loadPayoutInfo = async (keepBankForm = false) => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      const res = await fetch('/api/agent/payout-info', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem('agent_token');
        router.push('/agen/login');
        return;
      }

      if (res.status === 403) {
        router.push('/agen/status');
        return;
      }

      if (!res.ok) {
        throw new Error('Gagal memuat data saldo dan pencairan');
      }

      const data = await readJsonSafe<PayoutInfo>(res);
      if (!data) {
        throw new Error('Gagal memuat data saldo dan pencairan');
      }
      setInfo(data);

      // Pre-fill bank details if available
      if (keepBankForm) return;
      if (data.bank_name) setBankName(data.bank_name);
      if (data.bank_account_number) setAccountNumber(data.bank_account_number);
      if (data.bank_account_holder) setAccountHolder(data.bank_account_holder);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      setFetchError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Refresh after an action: show the loader again, then load.
  const fetchPayoutInfo = () => {
    setLoading(true);
    setFetchError(null);
    return loadPayoutInfo();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set when the response lands
    loadPayoutInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!info) return;

    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    const cleanAmount = parseInt(amountStr.replace(/\D/g, ''), 10);
    if (!cleanAmount || cleanAmount <= 0) {
      setFormError('Masukkan jumlah penarikan yang valid');
      return;
    }

    const minPayout = info.minimum_payout_amount ?? 0;
    if (minPayout > 0 && cleanAmount < minPayout) {
      setFormError(`Jumlah penarikan minimal ${formatRupiah(minPayout)}`);
      return;
    }

    if (cleanAmount > info.saldo_tersedia) {
      setFormError(`Jumlah penarikan melebihi saldo tersedia (${formatRupiah(info.saldo_tersedia)})`);
      return;
    }

    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      setEditBank(true);
      setFormError('Lengkapi data rekening tujuan.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/agent/payout-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount_requested: cleanAmount,
          bank_name: bankName.trim(),
          bank_account_number: accountNumber.trim(),
          bank_account_holder: accountHolder.trim(),
        }),
      });

      // A gateway error page (Caddy 502/504) is not JSON: never show "Unexpected token '<'".
      const resJson = await readJsonSafe(res);
      if (!res.ok) {
        // The balance or a pending request may have changed elsewhere (409/400): show the current numbers.
        if (res.status !== 401) void loadPayoutInfo(true);
        setFormError(apiErrorMessage(res.status, resJson, 'Gagal mengajukan pencairan'));
        return;
      }

      setFormSuccess('Pengajuan penarikan terkirim.');
      setEditBank(false);
      setAmountStr('');
      await fetchPayoutInfo();
    } catch {
      // Network failure: fetch throws a TypeError ("Failed to fetch"), never shown as is.
      setFormError('Gagal terhubung ke server. Periksa koneksi Anda lalu coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const minPayout = info?.minimum_payout_amount ?? 0;
  const saldo = Math.max(0, Math.floor(info?.saldo_tersedia ?? 0));
  const hasSavedBank = Boolean(info?.bank_name && info?.bank_account_number && info?.bank_account_holder);
  const showBankForm = editBank || !hasSavedBank;

  const onAmountChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
      setAmountStr('');
      return;
    }
    const num = parseInt(digits, 10);
    if (digits.length > 15 || num > saldo) {
      setAmountStr(saldo > 0 ? String(saldo) : '');
      return;
    }
    setAmountStr(String(num));
  };

  return (
    <MobileContainer>
      <AgentPageHeader title="Tarik saldo" onBack={() => router.push('/agen/dashboard')} backLabel="Kembali ke beranda" />

      <AgentPage>
        <div className="ag-shell-toolbar">
          <button type="button" className="ag-shell-action" onClick={() => router.push('/agen/riwayat-komisi')}>
            <ReceiptText size={16} aria-hidden="true" />
            <span>Riwayat komisi</span>
          </button>
        </div>
        {loading ? (
          <div className="ts-center" role="status">
            <span className="ag-shell-spinner" aria-hidden="true" />
            <span>Memuat saldo...</span>
          </div>
        ) : fetchError ? (
          <div className="ts-center">
            <AlertCircle size={28} className="ts-center__icon" aria-hidden="true" />
            <p className="ts-title">Saldo belum bisa dimuat</p>
            <p className="ts-muted">{fetchError}</p>
            <button type="button" className="ts-btn ts-btn--outline" onClick={() => fetchPayoutInfo()}>
              <RefreshCw size={18} aria-hidden="true" />
              Coba lagi
            </button>
          </div>
        ) : info?.pending_request ? (
          /* A request is in progress: show it instead of the form. */
          <>
            <section className="ts-card">
              <div className="ts-row">
                <span className="ts-label">Pengajuan sedang diproses</span>
                <span className={`ts-badge${info.pending_request.status === 'approved' ? ' ts-badge--ok' : ''}`}>
                  {info.pending_request.status === 'approved' ? 'Disetujui' : 'Menunggu verifikasi'}
                </span>
              </div>
              <p className="ts-amount">{formatRupiah(info.pending_request.amount_requested)}</p>
              <p className="ts-muted">Diajukan {formatDate(info.pending_request.created_at)}</p>
              <div className="ts-bank">
                <Building2 size={18} aria-hidden="true" />
                <span>
                  {info.pending_request.bank_name_snapshot} · {info.pending_request.bank_account_number_snapshot}
                  <small>a.n. {info.pending_request.bank_account_holder_snapshot}</small>
                </span>
              </div>
              <p className="ts-note">
                <Clock size={16} aria-hidden="true" />
                {info.pending_request.status === 'approved'
                  ? 'Disetujui, menunggu transfer. Admin travel akan mentransfer dana ke rekening di atas.'
                  : 'Admin travel sedang memverifikasi. Dana ditransfer ke rekening di atas setelah disetujui.'}
              </p>
            </section>
            <div className="ts-actions">
              <button type="button" className="ts-btn ts-btn--outline" onClick={() => router.push('/agen/dashboard')}>
                Kembali ke beranda
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="ts-form" noValidate>
            {/* Balance */}
            <section className="ts-card">
              <span className="ts-label">Saldo bisa ditarik</span>
              <p className="ts-amount">{formatRupiah(saldo)}</p>
              {minPayout > 0 && <p className="ts-muted">Minimal penarikan {formatRupiah(minPayout)}</p>}
            </section>

            {/* Amount */}
            <section className="ts-card">
              <div className="ts-row">
                <label className="tw-field-label ts-flush" htmlFor="ts-amount">
                  Jumlah penarikan
                </label>
                <button type="button" className="ts-link" onClick={() => setAmountStr(String(saldo))} disabled={saldo <= 0}>
                  Tarik semua
                </button>
              </div>
              <div className="ts-money">
                <span className="ts-money__prefix" aria-hidden="true">
                  Rp
                </span>
                <input
                  id="ts-amount"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={amountStr ? new Intl.NumberFormat('id-ID').format(parseInt(amountStr, 10)) : ''}
                  onChange={(e) => onAmountChange(e.target.value)}
                  className="tw-field ts-money__input"
                  aria-describedby="ts-amount-hint"
                  required
                />
              </div>
              <p id="ts-amount-hint" className="ts-muted">
                Maks. {formatRupiah(saldo)}
              </p>
            </section>

            {/* Bank account: one line when saved, the form when missing or editing */}
            <section className="ts-card">
              <div className="ts-row">
                <span className="tw-field-label ts-flush">Rekening tujuan</span>
                {hasSavedBank && (
                  <button
                    type="button"
                    className="ts-link"
                    onClick={() => {
                      if (editBank && info) {
                        // Cancel: back to the saved account.
                        setBankName(info.bank_name || '');
                        setAccountNumber(info.bank_account_number || '');
                        setAccountHolder(info.bank_account_holder || '');
                      }
                      setEditBank(!editBank);
                    }}
                  >
                    {editBank ? 'Batal' : 'Ubah'}
                  </button>
                )}
              </div>
              {showBankForm ? (
                <div className="ts-fields">
                  <BankField id="ts-bank" value={bankName} onChange={setBankName} />
                  <div>
                    <label className="tw-field-label" htmlFor="ts-number">
                      Nomor rekening
                    </label>
                    <input
                      id="ts-number"
                      type="text"
                      inputMode="numeric"
                      placeholder="1234567890"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d]/g, ''))}
                      className="tw-field"
                      required
                    />
                  </div>
                  <div>
                    <label className="tw-field-label" htmlFor="ts-holder">
                      Nama pemilik rekening
                    </label>
                    <input id="ts-holder" type="text" placeholder="Sesuai buku tabungan" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} className="tw-field" autoComplete="name" required />
                  </div>
                  <p className="ts-muted">Rekening ini disimpan untuk penarikan berikutnya.</p>
                </div>
              ) : (
                <div className="ts-bank">
                  <Building2 size={18} aria-hidden="true" />
                  <span>
                    {bankName} · {accountNumber}
                    <small>a.n. {accountHolder}</small>
                  </span>
                </div>
              )}
            </section>

            {formError && (
              <p className="ts-alert ts-alert--error" role="alert">
                <AlertCircle size={18} aria-hidden="true" />
                {formError}
              </p>
            )}
            {formSuccess && (
              <p className="ts-alert ts-alert--ok" role="status">
                <CheckCircle2 size={18} aria-hidden="true" />
                {formSuccess}
              </p>
            )}

            {/* Primary action, always reachable at the bottom of the screen */}
            <div className="ts-submit">
              <button type="submit" className="ts-btn ts-btn--primary" disabled={submitting}>
                {submitting ? 'Mengirim...' : 'Ajukan penarikan'}
              </button>
            </div>
          </form>
        )}
      </AgentPage>
    </MobileContainer>
  );
}
