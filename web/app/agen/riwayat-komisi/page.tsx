'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ReceiptText,
  Calendar,
  Search,
  X,
  AlertCircle,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';

interface CommissionHistoryItem {
  id: number;
  source: string; // 'ledger' | 'payout'
  type: string; // 'direct' | 'override' | 'correction' | 'payout'
  description: string;
  amount: number;
  direction: string; // 'masuk' | 'keluar'
  status?: string; // 'pending' | 'approved' | 'rejected' | 'paid'
  created_at: string;
}

const FILTER_TABS = [
  { key: '', label: 'Semua' },
  { key: 'masuk', label: 'Komisi Masuk' },
  { key: 'keluar', label: 'Pencairan' },
];

const formatRupiah = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.abs(val));
};

const formatDateTime = (dateStr: string): string => {
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

export default function RiwayatKomisiPage() {
  const router = useRouter();
  const [items, setItems] = useState<CommissionHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchHistory = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/agent/commission-history', {
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
        throw new Error('Gagal memuat riwayat transaksi komisi');
      }

      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate totals
  const summary = useMemo(() => {
    let totalMasuk = 0;
    let totalKeluar = 0;
    items.forEach((item) => {
      if (item.direction === 'masuk') {
        totalMasuk += item.amount;
      } else if (item.direction === 'keluar' && item.status !== 'rejected') {
        totalKeluar += item.amount;
      }
    });
    return { totalMasuk, totalKeluar };
  }, [items]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      '': items.length,
      masuk: 0,
      keluar: 0,
    };
    items.forEach((item) => {
      if (item.direction === 'masuk') {
        counts.masuk += 1;
      } else if (item.direction === 'keluar') {
        counts.keluar += 1;
      }
    });
    return counts;
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Tab filter
      if (activeTab && item.direction !== activeTab) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const descMatch = item.description?.toLowerCase().includes(q);
        const amountMatch = String(item.amount).includes(q);
        const typeMatch = item.type?.toLowerCase().includes(q);
        return descMatch || amountMatch || typeMatch;
      }

      return true;
    });
  }, [items, activeTab, searchQuery]);

  const getTypeBadge = (item: CommissionHistoryItem) => {
    if (item.type === 'payout') {
      return {
        label: 'Pencairan',
        bg: 'color-mix(in srgb, var(--tw-rating-star) 12%, var(--tw-background))',
        color: 'var(--tw-rating-star)',
        border: '1px solid color-mix(in srgb, var(--tw-rating-star) 25%, transparent)',
      };
    }
    if (item.type === 'override') {
      return {
        label: 'Komisi Tim',
        bg: 'color-mix(in srgb, #6366f1 12%, var(--tw-background))',
        color: '#4f46e5',
        border: '1px solid color-mix(in srgb, #6366f1 25%, transparent)',
      };
    }
    if (item.type === 'correction') {
      return {
        label: 'Koreksi',
        bg: 'var(--tw-badge-neutral-bg)',
        color: 'var(--tw-text-secondary)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
      };
    }
    return {
      label: 'Komisi Referral',
      bg: 'color-mix(in srgb, var(--tw-brand-primary) 12%, var(--tw-background))',
      color: 'var(--tw-brand-primary)',
      border: '1px solid color-mix(in srgb, var(--tw-brand-primary) 28%, transparent)',
    };
  };

  const getStatusBadge = (item: CommissionHistoryItem) => {
    if (item.source === 'payout') {
      switch (item.status) {
        case 'pending':
          return {
            label: 'Diproses',
            bg: 'color-mix(in srgb, var(--tw-rating-star) 14%, var(--tw-background))',
            color: 'var(--tw-rating-star)',
            border: '1px solid color-mix(in srgb, var(--tw-rating-star) 30%, transparent)',
          };
        case 'approved':
          return {
            label: 'Disetujui',
            bg: 'color-mix(in srgb, #3b82f6 14%, var(--tw-background))',
            color: '#1d4ed8',
            border: '1px solid color-mix(in srgb, #3b82f6 30%, transparent)',
          };
        case 'paid':
          return {
            label: 'Selesai',
            bg: 'var(--tw-badge-success-bg)',
            color: 'var(--tw-income)',
            border: '1px solid color-mix(in srgb, #22c55e 30%, transparent)',
          };
        case 'rejected':
          return {
            label: 'Ditolak',
            bg: 'var(--tw-badge-neutral-bg)',
            color: 'var(--tw-text-muted)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
          };
        default:
          return null;
      }
    }
    return {
      label: 'Berhasil',
      bg: 'var(--tw-badge-success-bg)',
      color: 'var(--tw-income)',
      border: '1px solid color-mix(in srgb, #22c55e 30%, transparent)',
    };
  };

  return (
    <MobileContainer>
      {/* Sticky Header — Consistent with /agen/jamaah */}
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
            Riwayat Komisi
          </h1>
          <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', lineHeight: 1.3 }}>
            Catatan komisi &amp; mutasi saldo Anda
          </span>
        </div>

        <button
          type="button"
          onClick={() => router.push('/agen/tarik-saldo')}
          style={{
            padding: '7px 12px',
            borderRadius: '6px',
            backgroundColor: 'var(--tw-brand-primary)',
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            flexShrink: 0,
          }}
        >
          <Wallet size={14} />
          <span>Tarik Saldo</span>
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
        {/* Top Summary Widgets */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px',
          }}
        >
          {/* Card Total Masuk */}
          <div
            style={{
              backgroundColor: 'var(--tw-background)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              boxShadow: 'var(--tw-card-shadow)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  backgroundColor: 'color-mix(in srgb, var(--tw-income) 12%, var(--tw-background))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ArrowDownLeft size={14} color="var(--tw-income)" />
              </div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tw-text-muted)' }}>
                Total Masuk
              </span>
            </div>
            <span
              style={{
                fontSize: '15px',
                fontWeight: 800,
                color: 'var(--tw-income)',
                fontFamily: 'var(--tw-font-heading)',
                fontVariantNumeric: 'tabular-nums',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {formatRupiah(summary.totalMasuk)}
            </span>
          </div>

          {/* Card Total Keluar */}
          <div
            style={{
              backgroundColor: 'var(--tw-background)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              boxShadow: 'var(--tw-card-shadow)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  backgroundColor: 'color-mix(in srgb, var(--tw-expense) 10%, var(--tw-background))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ArrowUpRight size={14} color="var(--tw-expense)" />
              </div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tw-text-muted)' }}>
                Total Dicairkan
              </span>
            </div>
            <span
              style={{
                fontSize: '15px',
                fontWeight: 800,
                color: 'var(--tw-text-primary)',
                fontFamily: 'var(--tw-font-heading)',
                fontVariantNumeric: 'tabular-nums',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {formatRupiah(summary.totalKeluar)}
            </span>
          </div>
        </div>

        {/* Search Bar — Consistent with /agen/jamaah */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '12px',
              color: 'var(--tw-text-muted)',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <Search size={15} />
          </div>
          <input
            type="text"
            placeholder="Cari transaksi atau nama jamaah..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 36px 10px 36px',
              fontSize: '13px',
              backgroundColor: 'var(--tw-background)',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: '8px',
              color: 'var(--tw-text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                color: 'var(--tw-text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Hapus pencarian"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Tabs — Consistent with /agen/jamaah */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '2px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: isActive
                    ? '1px solid var(--tw-brand-primary)'
                    : '1px solid rgba(0, 0, 0, 0.08)',
                  backgroundColor: isActive ? 'var(--tw-brand-primary)' : 'var(--tw-background)',
                  color: isActive ? '#FFFFFF' : 'var(--tw-text-secondary)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: '10px',
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.06)',
                    color: isActive ? '#FFFFFF' : 'var(--tw-text-muted)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                  }}
                >
                  {tabCounts[tab.key] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
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
              Memuat riwayat transaksi komisi...
            </span>
            <style jsx>{`
              @keyframes spin {
                to {
                  transform: rotate(360deg);
                }
              }
            `}</style>
          </div>
        ) : error ? (
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
              {error}
            </p>
            <button
              type="button"
              onClick={() => fetchHistory()}
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
        ) : filteredItems.length === 0 ? (
          <div
            style={{
              padding: '48px 20px',
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
            <div style={{ color: 'var(--tw-text-muted)' }}>
              <ReceiptText size={36} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--tw-text-primary)',
                  fontFamily: 'var(--tw-font-heading)',
                }}
              >
                Belum Ada Riwayat Transaksi
              </h2>
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--tw-text-secondary)',
                  margin: 0,
                  lineHeight: 1.5,
                  maxWidth: '280px',
                }}
              >
                {searchQuery
                  ? `Tidak ada transaksi yang sesuai dengan "${searchQuery}".`
                  : activeTab === 'masuk'
                  ? 'Belum ada catatan komisi masuk dari jamaah.'
                  : activeTab === 'keluar'
                  ? 'Belum ada catatan pengajuan pencairan saldo.'
                  : 'Setiap komisi dari jamaah closing dan riwayat pengajuan pencairan dana akan tercatat di sini.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push('/agen/jamaah')}
              style={{
                marginTop: '4px',
                padding: '9px 16px',
                borderRadius: '6px',
                backgroundColor: 'var(--tw-brand-primary)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>Lihat Prospek Jamaah</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredItems.map((tx) => {
              const isPayout = tx.type === 'payout';
              const isRejected = isPayout && tx.status === 'rejected';
              const isIncoming = tx.direction === 'masuk';
              const typeBadge = getTypeBadge(tx);
              const statusBadge = getStatusBadge(tx);

              return (
                <div
                  key={`${tx.source}-${tx.id}`}
                  style={{
                    backgroundColor: 'var(--tw-background)',
                    borderRadius: '12px',
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    padding: '14px 15px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: 'var(--tw-card-shadow)',
                    opacity: isRejected ? 0.6 : 1,
                  }}
                >
                  {/* Row 1: Type Badge & Nominal */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: typeBadge.bg,
                        color: typeBadge.color,
                        border: typeBadge.border,
                        flexShrink: 0,
                      }}
                    >
                      {typeBadge.label}
                    </span>

                    <span
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: 'var(--tw-font-heading)',
                        color: isRejected
                          ? 'var(--tw-text-muted)'
                          : isIncoming
                          ? 'var(--tw-income)'
                          : 'var(--tw-text-primary)',
                      }}
                    >
                      {isRejected
                        ? formatRupiah(tx.amount)
                        : isIncoming
                        ? `+ ${formatRupiah(tx.amount)}`
                        : `- ${formatRupiah(tx.amount)}`}
                    </span>
                  </div>

                  {/* Row 2: Description */}
                  <div>
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: isRejected
                          ? 'var(--tw-text-muted)'
                          : 'var(--tw-text-primary)',
                        lineHeight: 1.35,
                        wordBreak: 'break-word',
                      }}
                    >
                      {tx.description}
                    </span>
                  </div>

                  {/* Row 3: Tanggal/Waktu & Status Badge */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: 'var(--tw-text-muted)',
                      paddingTop: '6px',
                      borderTop: '1px solid rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Calendar size={13} color="var(--tw-text-muted)" />
                      <span>{formatDateTime(tx.created_at)}</span>
                    </div>

                    {statusBadge && (
                      <span
                        style={{
                          padding: '2px 7px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 600,
                          backgroundColor: statusBadge.bg,
                          color: statusBadge.color,
                          border: statusBadge.border,
                        }}
                      >
                        {statusBadge.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
