'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  Plus,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Calendar,
  Package as PackageIcon,
  X,
  Search,
  ArrowLeft,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';

interface AgentProspectItem {
  id: number;
  tenant_id: number;
  package_id?: number | null;
  package_name?: string;
  agent_id: number;
  name: string;
  phone: string;
  jumlah_jamaah: number;
  status: string;
  source_channel?: string;
  entry_method: string;
  created_at: string;
  updated_at: string;
}

interface TenantPackage {
  id: number;
  name: string;
  price?: number;
  status: string;
}

const STATUS_OPTIONS = [
  { key: '', label: 'Semua' },
  { key: 'baru', label: 'Baru' },
  { key: 'dihubungi', label: 'Dihubungi' },
  { key: 'tertarik', label: 'Tertarik' },
  { key: 'closing', label: 'Closing' },
  { key: 'tidak_lanjut', label: 'Tidak Lanjut' },
];

export default function AgenJamaahListPage() {
  const router = useRouter();

  const [jamaahList, setJamaahList] = useState<AgentProspectItem[]>([]);
  const [packages, setPackages] = useState<TenantPackage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal Tambah Manual
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    phone: string;
    package_id: string;
    jumlah_jamaah: number;
  }>({
    name: '',
    phone: '',
    package_id: '',
    jumlah_jamaah: 1,
  });

  const fetchJamaah = async (statusFilter = activeStatus) => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let url = '/api/agent/jamaah';
      if (statusFilter) {
        url += `?status=${encodeURIComponent(statusFilter)}`;
      }

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        localStorage.removeItem('agent_token');
        router.push('/agen/login');
        return;
      }

      if (!res.ok) {
        throw new Error('Gagal memuat daftar jamaah');
      }

      const data = await res.json();
      setJamaahList(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchPackages = async () => {
    try {
      const res = await fetch('/api/public/packages');
      if (res.ok) {
        const data = await res.json();
        setPackages(Array.isArray(data) ? data : []);
      }
    } catch {
      // Soft fail
    }
  };

  useEffect(() => {
    fetchJamaah(activeStatus);
    fetchPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStatus]);

  const handleOpenModal = () => {
    setFormData({
      name: '',
      phone: '',
      package_id: packages.length > 0 ? String(packages[0].id) : '',
      jumlah_jamaah: 1,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (!formSubmitting) {
      setIsModalOpen(false);
      setFormError(null);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    if (!formData.name.trim()) {
      setFormError('Nama lengkap jamaah wajib diisi');
      return;
    }
    if (!formData.phone.trim()) {
      setFormError('Nomor WhatsApp jamaah wajib diisi');
      return;
    }

    // Validasi format nomor HP / WhatsApp Indonesia
    const rawPhone = formData.phone.trim();
    const cleanDigits = rawPhone.replace(/\D/g, '');
    const isIndoMobile = /^(?:08\d{8,11}|628\d{8,11})$/.test(cleanDigits);

    if (!isIndoMobile) {
      setFormError('Format nomor WhatsApp tidak valid. Masukkan nomor HP aktif (contoh: 081234567890, min. 10 digit).');
      return;
    }

    try {
      setFormSubmitting(true);
      setFormError(null);

      const normalizedPhone = cleanDigits.startsWith('62') ? '0' + cleanDigits.slice(2) : cleanDigits;

      const payload: {
        name: string;
        phone: string;
        package_id?: number;
        jumlah_jamaah?: number;
      } = {
        name: formData.name.trim(),
        phone: normalizedPhone,
        jumlah_jamaah: Number(formData.jumlah_jamaah) || 1,
      };

      if (formData.package_id) {
        payload.package_id = Number(formData.package_id);
      }

      const res = await fetch('/api/agent/jamaah', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Gagal menambahkan jamaah');
      }

      const created = await res.json();
      setIsModalOpen(false);
      router.push(`/agen/jamaah/${created.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      setFormError(msg);
    } finally {
      setFormSubmitting(false);
    }
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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { '': jamaahList.length };
    jamaahList.forEach((item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  }, [jamaahList]);

  const filteredJamaah = jamaahList.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.phone.includes(query) ||
      (item.package_name && item.package_name.toLowerCase().includes(query))
    );
  });

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
            Prospek Jamaah
          </h1>
          <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', lineHeight: 1.3 }}>
            Kelola prospek &amp; jamaah referral Anda
          </span>
        </div>

        <button
          type="button"
          onClick={handleOpenModal}
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
            gap: '4px',
            flexShrink: 0,
          }}
        >
          <Plus size={15} />
          <span>Tambah</span>
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
        {/* Search Bar */}
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
            placeholder="Cari nama jamaah atau nomor WA..."
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

        {/* Filter Status Tabs (Horizontal Scroll) */}
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
          {STATUS_OPTIONS.map((tab) => {
            const isActive = activeStatus === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveStatus(tab.key)}
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
                  {statusCounts[tab.key] || 0}
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
              Memuat data jamaah...
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
              onClick={() => fetchJamaah()}
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
        ) : filteredJamaah.length === 0 ? (
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
              <Users size={36} />
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
                Belum Ada Jamaah
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
                {activeStatus
                  ? `Tidak ada jamaah dengan status "${STATUS_OPTIONS.find((s) => s.key === activeStatus)?.label}".`
                  : 'Jamaah yang mendaftar melalui tautan referral Anda atau input manual akan muncul di sini.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenModal}
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
              <Plus size={15} />
              <span>Tambah Jamaah Manual</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredJamaah.map((item) => {
              const badge = getStatusBadge(item.status);
              const isManual = item.entry_method === 'agent_manual';

              return (
                <Link
                  key={item.id}
                  href={`/agen/jamaah/${item.id}`}
                  style={{
                    backgroundColor: 'var(--tw-background)',
                    borderRadius: '12px',
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    padding: '14px 15px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    textDecoration: 'none',
                    color: 'inherit',
                    boxShadow: 'var(--tw-card-shadow)',
                  }}
                >
                  {/* Row 1: Nama & Badge Status */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: '15px',
                          fontWeight: 700,
                          color: 'var(--tw-text-primary)',
                          lineHeight: 1.3,
                          fontFamily: 'var(--tw-font-heading)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.name}
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          color: 'var(--tw-text-secondary)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {item.phone}
                      </span>
                    </div>

                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: badge.border,
                        flexShrink: 0,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Row 2: Paket & Jumlah Jamaah */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      paddingTop: '6px',
                      borderTop: '1px solid rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        color: 'var(--tw-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <PackageIcon size={14} color="var(--tw-text-muted)" style={{ flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.package_name || 'Paket Pilihan'}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--tw-text-primary)',
                        flexShrink: 0,
                      }}
                    >
                      <Users size={13} color="var(--tw-text-muted)" />
                      <span>{item.jumlah_jamaah || 1} Jamaah</span>
                    </div>
                  </div>

                  {/* Row 3: Tanggal Masuk & Entry Method */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: 'var(--tw-text-muted)',
                      paddingTop: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        <span>{formatDate(item.created_at)}</span>
                      </div>
                      {isManual && (
                        <span
                          style={{
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(0, 0, 0, 0.04)',
                            fontSize: '10px',
                            fontWeight: 600,
                            color: 'var(--tw-text-secondary)',
                          }}
                        >
                          Manual
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--tw-text-muted)' }}>
                      <span>Detail</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Tambah Jamaah Manual */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-tambah-title"
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
              maxWidth: '420px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <h2
                  id="modal-tambah-title"
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: 'var(--tw-text-primary)',
                    margin: 0,
                    fontFamily: 'var(--tw-font-heading)',
                  }}
                >
                  Tambah Jamaah Manual
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--tw-text-muted)' }}>
                  Catat calon jamaah yang mendaftar via WhatsApp
                </span>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                disabled={formSubmitting}
                aria-label="Tutup modal"
                style={{
                  width: '32px',
                  height: '32px',
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
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fee2e2',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#991b1b',
                  lineHeight: 1.4,
                }}
              >
                {formError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Nama */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)' }}>
                  Nama Lengkap Jamaah <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: H. Ahmad Subagio"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.12)',
                    fontSize: '13px',
                    backgroundColor: 'var(--tw-background)',
                    color: 'var(--tw-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              {/* WhatsApp */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)' }}>
                  Nomor WhatsApp <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Contoh: 081234567890"
                  value={formData.phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d+]/g, '');
                    setFormData({ ...formData, phone: val });
                  }}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.12)',
                    fontSize: '13px',
                    backgroundColor: 'var(--tw-background)',
                    color: 'var(--tw-text-primary)',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>
                  Format: 08xx atau 628xx (10-13 digit angka)
                </span>
              </div>

              {/* Paket Pilihan */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)' }}>
                  Pilihan Paket Umroh
                </label>
                <select
                  value={formData.package_id}
                  onChange={(e) => setFormData({ ...formData, package_id: e.target.value })}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.12)',
                    fontSize: '13px',
                    backgroundColor: 'var(--tw-background)',
                    color: 'var(--tw-text-primary)',
                    outline: 'none',
                  }}
                >
                  <option value="">Pilih Paket (Opsional)</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Jumlah Jamaah */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tw-text-primary)' }}>
                  Jumlah Jamaah
                </label>
                <input
                  type="number"
                  min={1}
                  value={formData.jumlah_jamaah}
                  onChange={(e) => setFormData({ ...formData, jumlah_jamaah: parseInt(e.target.value, 10) || 1 })}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.12)',
                    fontSize: '13px',
                    backgroundColor: 'var(--tw-background)',
                    color: 'var(--tw-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Modal Buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '8px',
                }}
              >
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={formSubmitting}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: '6px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    backgroundColor: 'var(--tw-background)',
                    color: 'var(--tw-text-secondary)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: 'var(--tw-brand-primary)',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: formSubmitting ? 'not-allowed' : 'pointer',
                    opacity: formSubmitting ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  {formSubmitting ? <span>Menyimpan...</span> : <span>Simpan Jamaah</span>}
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
