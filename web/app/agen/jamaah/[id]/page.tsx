'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  MessageCircle,
  Calendar,
  Package as PackageIcon,
  Users,
  Send,
  AlertCircle,
  RefreshCw,
  X,
  Info,
  MessageSquare,
  Lock,
} from 'lucide-react';
import { MobileContainer } from '../../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../../components/AgentBottomNavbar';

interface ProspectData {
  id: number;
  tenant_id: number;
  package_id?: number | null;
  agent_id?: number | null;
  name: string;
  phone: string;
  email?: string | null;
  jumlah_jamaah?: number | null;
  status: string;
  source_channel?: string;
  entry_method: string;
  created_at: string;
  updated_at: string;
}

interface PackageData {
  id: number;
  name: string;
  price?: number | null;
  status?: string;
  departure_date?: string | null;
}

interface CommissionInfo {
  type: string; // "potensi" or "final"
  direct_amount: number;
  override_amount: number;
  total_amount: number;
  rate_per_jamaah: number;
}

interface StatusHistoryItem {
  id: number;
  prospect_id: number;
  old_status?: string | null;
  new_status: string;
  changed_by_type: string; // "agent" or "admin"
  changed_by_id: number;
  lost_reason?: string | null;
  changed_at: string;
}

interface NoteItem {
  id: number;
  prospect_id: number;
  author_type: string; // "agent" or "admin"
  author_id: number;
  note_text: string;
  created_at: string;
}

interface ProspectDetailResponse {
  prospect: ProspectData;
  package?: PackageData | null;
  info_komisi?: CommissionInfo | null;
  status_history: StatusHistoryItem[];
  notes: NoteItem[];
}

export default function AgenJamaahDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [data, setData] = useState<ProspectDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>('Portal Mitra Agen');

  // Status Change Modal
  const [isStatusModalOpen, setIsStatusModalOpen] = useState<boolean>(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('baru');
  const [lostReason, setLostReason] = useState<string>('');
  const [statusSubmitting, setStatusSubmitting] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Note Form
  const [newNoteText, setNewNoteText] = useState<string>('');
  const [noteSubmitting, setNoteSubmitting] = useState<boolean>(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const fetchDetail = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch me for branding
      try {
        const meRes = await fetch('/api/agent/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const meJson = await meRes.json();
          if (meJson.tenant_name) setTenantName(meJson.tenant_name);
        }
      } catch {
        // Soft fail
      }

      // 2. Fetch jamaah detail
      const res = await fetch(`/api/agent/jamaah/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        localStorage.removeItem('agent_token');
        router.push('/agen/login');
        return;
      }

      if (res.status === 404) {
        setError('Data jamaah tidak ditemukan atau Anda tidak memiliki akses ke data ini.');
        return;
      }

      if (!res.ok) {
        throw new Error('Gagal memuat detail jamaah');
      }

      const resData: ProspectDetailResponse = await res.json();
      setData(resData);
      setSelectedStatus(resData.prospect.status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleOpenStatusModal = () => {
    if (data?.prospect && data.prospect.status !== 'closing') {
      setSelectedStatus(data.prospect.status);
      setLostReason('');
      setStatusError(null);
      setIsStatusModalOpen(true);
    }
  };

  const handleCloseStatusModal = () => {
    if (!statusSubmitting) {
      setIsStatusModalOpen(false);
      setStatusError(null);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setStatusSubmitting(true);
      setStatusError(null);

      const payload: { status: string; lost_reason?: string } = {
        status: selectedStatus,
      };
      if (selectedStatus === 'tidak_lanjut' && lostReason.trim()) {
        payload.lost_reason = lostReason.trim();
      }

      const res = await fetch(`/api/agent/jamaah/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Gagal mengubah status');
      }

      setIsStatusModalOpen(false);
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat mengubah status';
      setStatusError(msg);
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    if (!newNoteText.trim()) return;

    try {
      setNoteSubmitting(true);
      setNoteError(null);

      const res = await fetch(`/api/agent/jamaah/${id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note_text: newNoteText.trim() }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Gagal menambahkan catatan');
      }

      setNewNoteText('');
      await fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setNoteError(msg);
    } finally {
      setNoteSubmitting(false);
    }
  };

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
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string): string => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'baru':
        return {
          label: 'Baru',
          bg: 'color-mix(in srgb, #3b82f6 12%, var(--tw-background))',
          color: '#1d4ed8',
          border: '1px solid color-mix(in srgb, #3b82f6 30%, transparent)',
        };
      case 'dihubungi':
        return {
          label: 'Dihubungi',
          bg: 'color-mix(in srgb, #f59e0b 12%, var(--tw-background))',
          color: '#b45309',
          border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)',
        };
      case 'tertarik':
        return {
          label: 'Tertarik',
          bg: 'color-mix(in srgb, var(--tw-brand-primary) 12%, var(--tw-background))',
          color: 'var(--tw-brand-primary)',
          border: '1px solid color-mix(in srgb, var(--tw-brand-primary) 28%, transparent)',
        };
      case 'closing':
        return {
          label: 'Closing',
          bg: 'var(--tw-badge-success-bg)',
          color: 'var(--tw-income)',
          border: '1px solid color-mix(in srgb, #22c55e 30%, transparent)',
        };
      case 'tidak_lanjut':
        return {
          label: 'Tidak Lanjut',
          bg: 'var(--tw-badge-neutral-bg)',
          color: 'var(--tw-text-muted)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
        };
      default:
        return {
          label: status,
          bg: 'var(--tw-badge-neutral-bg)',
          color: 'var(--tw-text-muted)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
        };
    }
  };

  const getWhatsAppUrl = (phone: string, name: string): string => {
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '62');
    const greeting = `Assalamu'alaikum ${name}, perkenalkan saya mitra resmi ${tenantName}. Terkait rencana ibadah umroh Bapak/Ibu, apakah ada informasi yang ingin ditanyakan?`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(greeting)}`;
  };

  if (loading) {
    return (
      <MobileContainer>
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
            onClick={() => router.back()}
            aria-label="Kembali"
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
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <span
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--tw-text-primary)',
              fontFamily: 'var(--tw-font-heading)',
            }}
          >
            Detail Jamaah
          </span>
        </header>
        <div
          style={{
            padding: '80px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            backgroundColor: 'var(--tw-page-bg)',
            minHeight: 'calc(100vh - 62px)',
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
            Memuat data detail jamaah...
          </span>
          <style jsx>{`
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </div>
      </MobileContainer>
    );
  }

  if (error || !data) {
    return (
      <MobileContainer>
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
            onClick={() => router.back()}
            aria-label="Kembali"
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              cursor: 'pointer',
              color: 'var(--tw-text-primary)',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '8px',
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <span
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--tw-text-primary)',
              fontFamily: 'var(--tw-font-heading)',
            }}
          >
            Detail Jamaah
          </span>
        </header>
        <div
          style={{
            padding: '50px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            backgroundColor: 'var(--tw-page-bg)',
            minHeight: 'calc(100vh - 62px)',
          }}
        >
          <div style={{ color: 'var(--tw-brand-primary)' }}>
            <AlertCircle size={36} />
          </div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--tw-text-primary)' }}>
            Data Tidak Ditemukan
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--tw-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            {error || 'Informasi jamaah tidak dapat ditampilkan.'}
          </p>
          <Link
            href="/agen/jamaah"
            style={{
              padding: '9px 16px',
              borderRadius: '6px',
              backgroundColor: 'var(--tw-brand-primary)',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ArrowLeft size={15} />
            <span>Kembali ke Daftar Jamaah</span>
          </Link>
        </div>
      </MobileContainer>
    );
  }

  const { prospect, package: pkg, info_komisi, status_history, notes } = data;
  const statusBadge = getStatusBadge(prospect.status);
  const isClosing = prospect.status === 'closing';

  return (
    <MobileContainer>
      {/* Sticky Header */}
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
          onClick={() => router.back()}
          aria-label="Kembali"
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
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--tw-text-primary)',
              margin: 0,
              fontFamily: 'var(--tw-font-heading)',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {prospect.name}
          </h1>
          <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', lineHeight: 1.3 }}>
            Detail Calon Jamaah
          </span>
        </div>

        <span
          style={{
            padding: '3px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: statusBadge.bg,
            color: statusBadge.color,
            border: statusBadge.border,
            flexShrink: 0,
          }}
        >
          {statusBadge.label}
        </span>
      </header>

      {/* Main Canvas */}
      <div
        style={{
          backgroundColor: 'var(--tw-page-bg)',
          minHeight: 'calc(100vh - 62px)',
          padding: '14px 16px calc(84px + env(safe-area-inset-bottom)) 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* 1. Info Kontak Section */}
        <section
          aria-label="Info Kontak Jamaah"
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                color: 'var(--tw-text-muted)',
              }}
            >
              Calon Jamaah
            </span>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--tw-text-primary)',
                margin: 0,
                fontFamily: 'var(--tw-font-heading)',
              }}
            >
              {prospect.name}
            </h2>
            <span
              style={{
                fontSize: '13px',
                color: 'var(--tw-text-secondary)',
                fontFamily: 'monospace',
              }}
            >
              {prospect.phone}
            </span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <a
              href={getWhatsAppUrl(prospect.phone, prospect.name)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: '#16a34a',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <MessageCircle size={15} color="#ffffff" />
              <span>Chat WhatsApp</span>
            </a>

            <Link
              href={`/agen/script-wa?prospect_id=${prospect.id}`}
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--tw-background)',
                color: 'var(--tw-brand-primary)',
                border: '1px solid var(--tw-brand-primary)',
                fontSize: '12px',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <MessageSquare size={15} />
              <span>Script Chat</span>
            </Link>
          </div>
        </section>

        {/* 2. Konteks Pendaftaran Section */}
        <section
          aria-label="Konteks Pendaftaran"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: 'var(--tw-card-shadow)',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              color: 'var(--tw-text-muted)',
            }}
          >
            Konteks Pendaftaran
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>Paket Diminati</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <PackageIcon size={13} color="var(--tw-text-secondary)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tw-text-primary)' }}>
                  {pkg ? pkg.name : 'Paket Pilihan'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>Jumlah Jamaah</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Users size={13} color="var(--tw-text-secondary)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tw-text-primary)' }}>
                  {prospect.jumlah_jamaah || 1} Orang
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>Jalur Pendaftaran</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)' }}>
                {prospect.entry_method === 'agent_manual' ? 'Input Manual Agen' : 'Formulir Website'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>Tanggal Masuk</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Calendar size={12} color="var(--tw-text-secondary)" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)' }}>
                  {formatDate(prospect.created_at)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Info Komisi Section */}
        {info_komisi && (
          <section
            aria-label="Informasi Komisi"
            style={{
              backgroundColor: 'var(--tw-background)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              boxShadow: 'var(--tw-card-shadow)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  color: 'var(--tw-text-muted)',
                }}
              >
                Informasi Komisi
              </span>

              <span
                style={{
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 700,
                  backgroundColor: isClosing ? 'var(--tw-badge-success-bg)' : 'color-mix(in srgb, var(--tw-brand-primary) 10%, var(--tw-background))',
                  color: isClosing ? 'var(--tw-income)' : 'var(--tw-brand-primary)',
                  border: isClosing ? '1px solid color-mix(in srgb, #22c55e 30%, transparent)' : '1px solid color-mix(in srgb, var(--tw-brand-primary) 25%, transparent)',
                }}
              >
                {isClosing ? 'Komisi Final' : 'Potensi Komisi'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: 'var(--tw-text-primary)',
                  fontFamily: 'var(--tw-font-heading)',
                }}
              >
                {formatRupiah(info_komisi.total_amount)}
              </span>
              {info_komisi.rate_per_jamaah > 0 && (prospect.jumlah_jamaah || 1) > 1 && (
                <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>
                  ({formatRupiah(info_komisi.rate_per_jamaah)} x {prospect.jumlah_jamaah} jamaah)
                </span>
              )}
            </div>

            <p
              style={{
                fontSize: '11px',
                color: 'var(--tw-text-secondary)',
                lineHeight: 1.4,
                margin: 0,
              }}
            >
              {isClosing
                ? 'Pendaftaran jamaah ini telah closing dan komisi telah berhasil dicatat ke saldo Anda.'
                : 'Komisi berstatus potensi. Saldo komisi akan menjadi final setelah admin travel memverifikasi pembayaran jamaah.'}
            </p>
          </section>
        )}

        {/* 4. Pipeline Status & Ubah Status Button */}
        <section
          aria-label="Status Prospek"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: 'var(--tw-card-shadow)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  color: 'var(--tw-text-muted)',
                }}
              >
                Status Tahapan
              </span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tw-text-primary)' }}>
                {statusBadge.label}
              </span>
            </div>

            {!isClosing ? (
              <button
                type="button"
                onClick={handleOpenStatusModal}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(0, 0, 0, 0.1)',
                  backgroundColor: 'var(--tw-background)',
                  color: 'var(--tw-brand-primary)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Ubah Status
              </button>
            ) : (
              <span
                style={{
                  padding: '5px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--tw-badge-success-bg)',
                  border: '1px solid var(--tw-border)',
                  color: 'var(--tw-income)',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Lock size={12} />
                <span>Closing — Status Final</span>
              </span>
            )}
          </div>

          <div
            style={{
              padding: '8px 10px',
              borderRadius: '6px',
              backgroundColor: 'var(--tw-page-bg)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Info size={14} color="var(--tw-text-muted)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'var(--tw-text-secondary)', lineHeight: 1.4 }}>
              {isClosing
                ? 'Status prospek ini sudah Closing dan bersifat final.'
                : 'Status Closing akan ditetapkan oleh admin travel setelah verifikasi pembayaran.'}
            </span>
          </div>
        </section>

        {/* 5. Riwayat Status Timeline */}
        <section
          aria-label="Riwayat Status"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: 'var(--tw-card-shadow)',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              color: 'var(--tw-text-muted)',
            }}
          >
            Riwayat Status
          </span>

          {status_history.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--tw-text-muted)' }}>
              Belum ada perubahan status.
            </span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {status_history.map((hist, idx) => {
                const isAgent = hist.changed_by_type === 'agent';
                const isLast = idx === status_history.length - 1;

                return (
                  <div
                    key={hist.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--tw-brand-primary)',
                        marginTop: '5px',
                        flexShrink: 0,
                      }}
                    />

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1px',
                        flex: 1,
                        paddingBottom: isLast ? 0 : '6px',
                        borderBottom: isLast ? 'none' : '1px solid rgba(0, 0, 0, 0.04)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)' }}>
                          Status: {hist.new_status}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--tw-text-muted)' }}>
                          {formatDateTime(hist.changed_at)}
                        </span>
                      </div>

                      <span style={{ fontSize: '11px', color: 'var(--tw-text-secondary)' }}>
                        {isAgent ? 'Diubah oleh Anda' : 'Diubah oleh Admin Travel'}
                        {hist.lost_reason && ` - Alasan: ${hist.lost_reason}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 6. Catatan Perkembangan Section */}
        <section
          aria-label="Catatan Perkembangan"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: 'var(--tw-card-shadow)',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              color: 'var(--tw-text-muted)',
            }}
          >
            Catatan Prospek ({notes.length})
          </span>

          {/* Form Tambah Catatan */}
          <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {noteError && (
              <span style={{ fontSize: '11px', color: '#dc2626' }}>
                {noteError}
              </span>
            )}
            <textarea
              rows={2}
              required
              placeholder="Tulis catatan perkembangan jamaah..."
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                fontSize: '13px',
                backgroundColor: 'var(--tw-page-bg)',
                color: 'var(--tw-text-primary)',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={noteSubmitting || !newNoteText.trim()}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--tw-brand-primary)',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: noteSubmitting || !newNoteText.trim() ? 'not-allowed' : 'pointer',
                  opacity: noteSubmitting || !newNoteText.trim() ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Send size={12} />
                <span>{noteSubmitting ? 'Mengirim...' : 'Tambah Catatan'}</span>
              </button>
            </div>
          </form>

          {/* List of Notes */}
          {notes.length === 0 ? (
            <div style={{ padding: '8px 0', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--tw-text-muted)' }}>
                Belum ada catatan. Tambahkan catatan untuk memantau follow-up.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
              {notes.map((note) => {
                const isAuthorAgent = note.author_type === 'agent';
                return (
                  <div
                    key={note.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: isAuthorAgent ? 'rgba(0, 0, 0, 0.02)' : '#f8fafc',
                      border: '1px solid rgba(0, 0, 0, 0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                    }}
                  >
                    <p
                      style={{
                        fontSize: '12px',
                        color: 'var(--tw-text-primary)',
                        lineHeight: 1.5,
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {note.note_text}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--tw-text-secondary)' }}>
                        {isAuthorAgent ? 'Catatan Anda' : 'Admin Travel'}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--tw-text-muted)' }}>
                        {formatDateTime(note.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Modal Ubah Status (TIDAK ADA OPSI CLOSING) */}
      {!isClosing && isStatusModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-status-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--tw-background)',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '400px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2
                id="modal-status-title"
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--tw-text-primary)',
                  margin: 0,
                  fontFamily: 'var(--tw-font-heading)',
                }}
              >
                Ubah Status Prospek
              </h2>
              <button
                type="button"
                onClick={handleCloseStatusModal}
                disabled={statusSubmitting}
                aria-label="Tutup modal"
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '6px',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  backgroundColor: 'transparent',
                  color: 'var(--tw-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={15} />
              </button>
            </div>

            {statusError && (
              <div
                style={{
                  padding: '8px 10px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fee2e2',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#991b1b',
                }}
              >
                {statusError}
              </div>
            )}

            <form onSubmit={handleUpdateStatus} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Status Radio Choices */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { key: 'baru', label: 'Baru', desc: 'Calon jamaah baru mendaftar / masuk' },
                  { key: 'dihubungi', label: 'Dihubungi', desc: 'Sudah dihubungi via WhatsApp atau telepon' },
                  { key: 'tertarik', label: 'Tertarik', desc: 'Sedang mempertimbangkan tanggal / paket' },
                  { key: 'tidak_lanjut', label: 'Tidak Lanjut', desc: 'Batal berangkat atau belum berminat' },
                ].map((opt) => {
                  const isChecked = selectedStatus === opt.key;
                  return (
                    <label
                      key={opt.key}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '9px 10px',
                        borderRadius: '6px',
                        border: isChecked ? '1.5px solid var(--tw-brand-primary)' : '1px solid rgba(0, 0, 0, 0.08)',
                        backgroundColor: isChecked
                          ? 'color-mix(in srgb, var(--tw-brand-primary) 5%, var(--tw-background))'
                          : 'var(--tw-background)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="prospect_status"
                        value={opt.key}
                        checked={isChecked}
                        onChange={() => setSelectedStatus(opt.key)}
                        style={{ marginTop: '2px' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tw-text-primary)' }}>
                          {opt.label}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>
                          {opt.desc}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Alasan Tidak Lanjut (Conditional) */}
              {selectedStatus === 'tidak_lanjut' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)' }}>
                    Alasan Tidak Lanjut (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Jadwal tidak cocok, kendala dana"
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid rgba(0, 0, 0, 0.12)',
                      fontSize: '12px',
                      backgroundColor: 'var(--tw-background)',
                      color: 'var(--tw-text-primary)',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              {/* Notice */}
              <div
                style={{
                  padding: '7px 9px',
                  borderRadius: '6px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '11px',
                  color: 'var(--tw-text-muted)',
                  lineHeight: 1.4,
                }}
              >
                Status <strong>Closing</strong> hanya dapat ditetapkan oleh admin travel setelah verifikasi pembayaran.
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <button
                  type="button"
                  onClick={handleCloseStatusModal}
                  disabled={statusSubmitting}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    backgroundColor: 'var(--tw-background)',
                    color: 'var(--tw-text-secondary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={statusSubmitting}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: 'var(--tw-brand-primary)',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: statusSubmitting ? 'not-allowed' : 'pointer',
                    opacity: statusSubmitting ? 0.7 : 1,
                  }}
                >
                  {statusSubmitting ? 'Menyimpan...' : 'Simpan Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
