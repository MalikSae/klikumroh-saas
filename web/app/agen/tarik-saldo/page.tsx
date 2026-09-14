'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Wallet,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  CreditCard,
  UserCheck,
  ReceiptText,
  HelpCircle,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';

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
  try {
    const d = new Date(dateStr);
    const datePart = d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timePart = d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart} • ${timePart} WIB`;
  } catch {
    return dateStr;
  }
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

  const fetchPayoutInfo = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setLoading(true);
      setFetchError(null);

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

      const data: PayoutInfo = await res.json();
      setInfo(data);

      // Pre-fill bank details if available
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

  useEffect(() => {
    fetchPayoutInfo();
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
      setFormError('Semua field rekening bank tujuan wajib diisi');
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

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'Gagal mengajukan pencairan');
      }

      setFormSuccess('Pengajuan pencairan komisi berhasil dikirim!');
      setAmountStr('');
      await fetchPayoutInfo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat mengajukan penarikan';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MobileContainer>
      {/* Sticky Header — Consistent with /agen/jamaah & /agen/riwayat-komisi */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backgroundColor: 'var(--tw-background)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <button
          type="button"
          onClick={() => router.push('/agen/dashboard')}
          aria-label="Kembali ke Dashboard"
          style={{
            background: 'none',
            border: 'none',
            padding: '6px',
            cursor: 'pointer',
            color: 'var(--tw-text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={20} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--tw-text-primary)',
              margin: 0,
              fontFamily: 'var(--tw-font-heading)',
              lineHeight: 1.2,
            }}
          >
            Tarik Saldo Komisi
          </h1>
          <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', lineHeight: 1.3 }}>
            Pencairan komisi closing ke rekening Anda
          </span>
        </div>

        <button
          type="button"
          onClick={() => router.push('/agen/riwayat-komisi')}
          style={{
            padding: '7px 12px',
            borderRadius: '6px',
            backgroundColor: 'var(--tw-background)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            color: 'var(--tw-text-primary)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            flexShrink: 0,
          }}
        >
          <ReceiptText size={14} color="var(--tw-text-muted)" />
          <span>Riwayat</span>
        </button>
      </header>

      {/* Main Canvas */}
      <div
        style={{
          backgroundColor: 'var(--tw-page-bg)',
          minHeight: 'calc(100vh - 62px)',
          padding: '14px 16px calc(80px + env(safe-area-inset-bottom)) 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Loading State */}
        {loading ? (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                border: '3px solid rgba(0, 0, 0, 0.08)',
                borderTopColor: 'var(--tw-brand-primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ fontSize: '13px', color: 'var(--tw-text-muted)' }}>
              Memuat status saldo komisi...
            </span>
            <style jsx>{`
              @keyframes spin {
                to {
                  transform: rotate(360deg);
                }
              }
            `}</style>
          </div>
        ) : fetchError ? (
          /* Error State */
          <div
            style={{
              padding: '36px 16px',
              backgroundColor: 'var(--tw-background)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div style={{ color: 'var(--tw-brand-primary)' }}>
              <AlertCircle size={32} />
            </div>
            <p style={{ fontSize: '14px', color: 'var(--tw-text-primary)', margin: 0, fontWeight: 600 }}>
              {fetchError}
            </p>
            <button
              type="button"
              onClick={() => fetchPayoutInfo()}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                backgroundColor: 'var(--tw-brand-primary)',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={13} />
              <span>Coba Lagi</span>
            </button>
          </div>
        ) : info?.pending_request ? (
          /* STATE 1: Sedang Ada Pengajuan Aktif -> Tampilkan Info Status Pengajuan */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                backgroundColor: 'var(--tw-background)',
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.06)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: 'var(--tw-card-shadow)',
              }}
            >
              {/* Header Status Pengajuan */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={16} color="var(--tw-rating-star)" />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tw-text-primary)', fontFamily: 'var(--tw-font-heading)' }}>
                    Pengajuan Sedang Diproses
                  </span>
                </div>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'color-mix(in srgb, var(--tw-rating-star) 14%, var(--tw-background))',
                    color: 'var(--tw-rating-star)',
                    border: '1px solid color-mix(in srgb, var(--tw-rating-star) 30%, transparent)',
                  }}
                >
                  {info.pending_request.status === 'approved'
                    ? 'Disetujui'
                    : 'Menunggu Verifikasi'}
                </span>
              </div>

              {/* Nominal Banner */}
              <div
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 8%, var(--tw-background))',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', fontWeight: 600 }}>
                  Jumlah Penarikan
                </span>
                <span
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: 'var(--tw-brand-primary)',
                    fontFamily: 'var(--tw-font-heading)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatRupiah(info.pending_request.amount_requested)}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--tw-text-secondary)', marginTop: '2px' }}>
                  Diajukan pada {formatDate(info.pending_request.created_at)}
                </span>
              </div>

              {/* Rekening Tujuan Detail */}
              <div
                style={{
                  borderTop: '1px solid rgba(0, 0, 0, 0.05)',
                  paddingTop: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', fontWeight: 600 }}>
                  Rekening Tujuan Transfer:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--tw-text-primary)' }}>
                  <Building2 size={15} color="var(--tw-text-muted)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>
                    Bank {info.pending_request.bank_name_snapshot} • {info.pending_request.bank_account_number_snapshot}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--tw-text-secondary)' }}>
                  <UserCheck size={15} color="var(--tw-text-muted)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '12px' }}>
                    a.n {info.pending_request.bank_account_holder_snapshot}
                  </span>
                </div>
              </div>

              <div
                style={{
                  borderTop: '1px solid rgba(0, 0, 0, 0.05)',
                  paddingTop: '10px',
                  fontSize: '11px',
                  color: 'var(--tw-text-muted)',
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                }}
              >
                <HelpCircle size={14} color="var(--tw-text-muted)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  Admin travel sedang memverifikasi pengajuan Anda. Dana akan ditransfer ke rekening di atas setelah disetujui.
                </span>
              </div>
            </div>

            {/* CTA Balik */}
            <button
              type="button"
              onClick={() => router.push('/agen/dashboard')}
              style={{
                padding: '11px 16px',
                borderRadius: '8px',
                backgroundColor: 'var(--tw-background)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                color: 'var(--tw-text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              Kembali ke Beranda
            </button>
          </div>
        ) : (
          /* STATE 2: Tidak Ada Pengajuan Aktif -> Tampilkan Kartu Saldo & Form */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Kartu Saldo Siap Cair */}
            <div
              style={{
                backgroundColor: 'var(--tw-background)',
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.06)',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                boxShadow: 'var(--tw-card-shadow)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 12%, var(--tw-background))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Wallet size={14} color="var(--tw-brand-primary)" />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tw-text-muted)' }}>
                    Saldo Komisi Tersedia
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: 'var(--tw-brand-primary)',
                    fontFamily: 'var(--tw-font-heading)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatRupiah(info?.saldo_tersedia ?? 0)}
                </span>
                {info?.minimum_payout_amount && info.minimum_payout_amount > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>
                    Minimal pencairan: {formatRupiah(info.minimum_payout_amount)}
                  </span>
                )}
              </div>

              {(info?.saldo_tersedia ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setAmountStr(String(Math.floor(info?.saldo_tersedia ?? 0)))}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid color-mix(in srgb, var(--tw-brand-primary) 25%, transparent)',
                    backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 8%, var(--tw-background))',
                    color: 'var(--tw-brand-primary)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Tarik Semua
                </button>
              )}
            </div>

            {/* Alert Messages */}
            {formSuccess && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--tw-badge-success-bg)',
                  border: '1px solid color-mix(in srgb, #22c55e 30%, transparent)',
                  color: 'var(--tw-income)',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle2 size={16} />
                <span>{formSuccess}</span>
              </div>
            )}

            {formError && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'color-mix(in srgb, #e11d48 8%, var(--tw-background))',
                  border: '1px solid color-mix(in srgb, #e11d48 25%, transparent)',
                  color: '#be123c',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} color="#be123c" />
                <span>{formError}</span>
              </div>
            )}

            {/* Form Input Pencairan */}
            <form
              onSubmit={handleSubmit}
              style={{
                backgroundColor: 'var(--tw-background)',
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.06)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: 'var(--tw-card-shadow)',
              }}
            >
              {/* Field 1: Jumlah Penarikan */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tw-text-primary)' }}>
                  Jumlah Penarikan (Rp) <span style={{ color: 'var(--tw-brand-primary)' }}>*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Contoh: 1.000.000"
                  value={amountStr ? new Intl.NumberFormat('id-ID').format(parseInt(amountStr.replace(/\D/g, '') || '0', 10)) : ''}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    if (!digits) {
                      setAmountStr('');
                      return;
                    }
                    const num = parseInt(digits, 10);
                    const maxSaldo = Math.max(0, Math.floor(info?.saldo_tersedia ?? 0));
                    if (digits.length > 15 || num > maxSaldo) {
                      setAmountStr(maxSaldo > 0 ? String(maxSaldo) : '');
                      return;
                    }
                    setAmountStr(String(num));
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    backgroundColor: 'var(--tw-background)',
                    color: 'var(--tw-text-primary)',
                    fontSize: '15px',
                    fontWeight: 700,
                    fontFamily: 'var(--tw-font-heading)',
                    fontVariantNumeric: 'tabular-nums',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  required
                />
                <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>
                  {info?.minimum_payout_amount && info.minimum_payout_amount > 0
                    ? `Minimum ${formatRupiah(info.minimum_payout_amount)}, maksimum ${formatRupiah(info?.saldo_tersedia ?? 0)}`
                    : `Maksimum yang dapat ditarik: ${formatRupiah(info?.saldo_tersedia ?? 0)}`}
                </span>
              </div>

              {/* Section Header: Rekening Tujuan */}
              <div
                style={{
                  borderTop: '1px solid rgba(0, 0, 0, 0.05)',
                  paddingTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CreditCard size={15} color="var(--tw-brand-primary)" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tw-text-primary)', fontFamily: 'var(--tw-font-heading)' }}>
                  Rekening Bank Tujuan
                </span>
              </div>

              {/* Field 2: Nama Bank */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-secondary)' }}>
                  Nama Bank <span style={{ color: 'var(--tw-brand-primary)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: BCA / Mandiri / BSI / BRI"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    backgroundColor: 'var(--tw-background)',
                    color: 'var(--tw-text-primary)',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  required
                />
              </div>

              {/* Field 3: Nomor Rekening */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-secondary)' }}>
                  Nomor Rekening <span style={{ color: 'var(--tw-brand-primary)' }}>*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Contoh: 1234567890"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    backgroundColor: 'var(--tw-background)',
                    color: 'var(--tw-text-primary)',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  required
                />
              </div>

              {/* Field 4: Nama Pemilik Rekening */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-secondary)' }}>
                  Nama Pemilik Rekening <span style={{ color: 'var(--tw-brand-primary)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nama sesuai buku tabungan"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    backgroundColor: 'var(--tw-background)',
                    color: 'var(--tw-text-primary)',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  required
                />
                <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>
                  Data rekening ini akan tersimpan otomatis untuk pengajuan berikutnya.
                </span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting || (info?.saldo_tersedia ?? 0) <= 0}
                style={{
                  marginTop: '6px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--tw-brand-primary)',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: submitting || (info?.saldo_tersedia ?? 0) <= 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: submitting || (info?.saldo_tersedia ?? 0) <= 0 ? 0.6 : 1,
                  transition: 'opacity 0.15s ease',
                }}
              >
                {submitting ? (
                  <span>Mengirim Pengajuan...</span>
                ) : (
                  <span>Kirim Pengajuan Pencairan</span>
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
