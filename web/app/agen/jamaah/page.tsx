'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import { AgentTravelSuspendedNotice } from '../../../components/AgentTravelSuspendedNotice';
import styles from './page.module.css';

const PAGE_SIZE = 20;

// Next 24 months as "YYYY-MM" for the planned departure (plus "belum tahu").
const departureOptions = (): { value: string; label: string }[] => {
  const opts = [{ value: '', label: 'Belum tahu' }];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < 24; i++) {
    opts.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
    });
    d.setMonth(d.getMonth() + 1);
  }
  return opts;
};

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
  /** Jamaah ditandai lunas oleh admin (komisi bisa dicairkan). */
  paid_off_at?: string | null;
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
  // Search runs on the server over all of the agent's jamaah (not only the loaded page).
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  // Per-status totals from the server, independent of the active tab and of paging.
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  // Only the latest request may fill the list (typing fast must not show stale results).
  const requestSeq = useRef(0);
  // The travel's subscription is suspended: the portal is read-only, so adding jamaah is not offered.
  const [travelSuspended, setTravelSuspended] = useState<boolean>(false);
  // Paged list: the API returns PAGE_SIZE jamaah at a time; "Muat lebih banyak" appends the next page.
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // Modal Tambah Manual
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    phone: string;
    package_id: string;
    jumlah_jamaah: number;
    departure_plan: string;
    domicile: string;
    consent: boolean;
  }>({
    name: '',
    phone: '',
    package_id: '',
    jumlah_jamaah: 1,
    departure_plan: '',
    domicile: '',
    consent: false,
  });

  const fetchJamaah = async (statusFilter = activeStatus, pageToLoad = 1, search = debouncedSearch) => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    const seq = ++requestSeq.current;
    try {
      if (pageToLoad === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      const params = new URLSearchParams({ page: String(pageToLoad), page_size: String(PAGE_SIZE) });
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const url = `/api/agent/jamaah?${params.toString()}`;

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
      if (seq !== requestSeq.current) return;
      const items: AgentProspectItem[] = Array.isArray(data?.items) ? data.items : [];
      if (data?.status_counts && typeof data.status_counts === 'object') setStatusCounts(data.status_counts);
      setJamaahList((prev) => (pageToLoad === 1 ? items : [...prev, ...items]));
      setTotal(typeof data?.total === 'number' ? data.total : items.length);
      setPage(pageToLoad);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data';
      setError(msg);
    } finally {
      setLoading(false);
      setLoadingMore(false);
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
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchJamaah(activeStatus, 1, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStatus, debouncedSearch]);

  useEffect(() => {
    fetchPackages();
    const token = localStorage.getItem('agent_token');
    if (!token) return;
    fetch('/api/agent/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => setTravelSuspended(Boolean(me?.travel_suspended)))
      .catch(() => {
        // The backend still refuses writes while suspended.
      });
  }, []);

  const handleOpenModal = () => {
    setFormData({
      name: '',
      phone: '',
      package_id: packages.length > 0 ? String(packages[0].id) : '',
      jumlah_jamaah: 1,
      departure_plan: '',
      domicile: '',
      consent: false,
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
    if (!formData.consent) {
      setFormError('Konfirmasi bahwa calon jamaah sudah setuju dihubungi oleh travel.');
      return;
    }
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
        departure_plan?: string;
        domicile?: string;
        consent: boolean;
      } = {
        name: formData.name.trim(),
        phone: normalizedPhone,
        jumlah_jamaah: Number(formData.jumlah_jamaah) || 1,
        consent: formData.consent,
      };
      if (formData.departure_plan && !formData.package_id) payload.departure_plan = formData.departure_plan;
      if (formData.domicile.trim()) payload.domicile = formData.domicile.trim();

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
          bg: 'color-mix(in srgb, var(--tw-status-new) 12%, var(--tw-background))',
          color: 'var(--tw-status-new-text)',
          border: '1px solid color-mix(in srgb, var(--tw-status-new) 30%, transparent)',
        };
      case 'dihubungi':
        return {
          label: 'Dihubungi',
          bg: 'color-mix(in srgb, var(--tw-status-contacted) 12%, var(--tw-background))',
          color: 'var(--tw-status-contacted-text)',
          border: '1px solid color-mix(in srgb, var(--tw-status-contacted) 30%, transparent)',
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
          border: '1px solid color-mix(in srgb, var(--tw-status-closing) 30%, transparent)',
        };
      case 'tidak_lanjut':
        return {
          label: 'Tidak Lanjut',
          bg: 'var(--tw-badge-neutral-bg)',
          color: 'var(--tw-text-muted)',
          border: '1px solid var(--tw-border)',
        };
      default:
        return {
          label: status,
          bg: 'var(--tw-badge-neutral-bg)',
          color: 'var(--tw-text-muted)',
          border: '1px solid var(--tw-border)',
        };
    }
  };

  // The server already applied status and search.
  const filteredJamaah = jamaahList;

  return (
    <MobileContainer>
      {/* Sticky Header */}
      <header
        className={styles.listheader1}
      >
        <button
          type="button"
          onClick={() => router.push('/agen/dashboard')}
          aria-label="Kembali ke Dashboard"
          className={styles.listbutton2}
        >
          <ArrowLeft size={20} />
        </button>

        <div className={styles.listdiv3}>
          <h1
            className={styles.listh14}
          >
            Prospek Jamaah
          </h1>
          <span className={styles.listspan5}>
            Kelola prospek &amp; jamaah referral Anda
          </span>
        </div>

        {!travelSuspended && (
          <button
            type="button"
            onClick={handleOpenModal}
            className={styles.listbutton6}
          >
            <Plus size={15} />
            <span>Tambah</span>
          </button>
        )}
      </header>

      {travelSuspended && <AgentTravelSuspendedNotice />}

      {/* Main Canvas */}
      <div
        className={styles.listdiv7}
      >
        {/* Search Bar */}
        <div
          className={styles.listdiv8}
        >
          <div
            className={styles.listdiv9}
          >
            <Search size={15} />
          </div>
          <input
            type="text"
            placeholder="Cari nama, nomor WA, atau paket..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.listinput10}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className={styles.listbutton11}
              title="Hapus pencarian"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Status Tabs (Horizontal Scroll) */}
        <div
          className={styles.listdiv12}
        >
          {STATUS_OPTIONS.map((tab) => {
            const isActive = activeStatus === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveStatus(tab.key)}
                className={`${styles.listbutton13} ${isActive ? styles.listbutton14 : styles.listbutton15}`}
              >
                <span>{tab.label}</span>
                <span
                  className={`${styles.listspan16} ${isActive ? styles.listspan17 : styles.listspan18}`}
                >
                  {(tab.key === '' ? statusCounts.total : statusCounts[tab.key]) || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        {loading ? (
          <div
            className={styles.listdiv19}
          >
            <div
              className={styles.listdiv20}
            />
            <span className={styles.listspan21}>
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
            className={styles.listdiv22}
          >
            <div className={styles.listdiv23}>
              <AlertCircle size={32} />
            </div>
            <p className={styles.listp24}>
              {error}
            </p>
            <button
              type="button"
              onClick={() => fetchJamaah()}
              className={styles.listbutton25}
            >
              <RefreshCw size={13} />
              <span>Coba Lagi</span>
            </button>
          </div>
        ) : filteredJamaah.length === 0 ? (
          <div
            className={styles.listdiv26}
          >
            <div className={styles.listdiv27}>
              <Users size={36} />
            </div>
            <div className={styles.listdiv28}>
              <h2
                className={styles.listh229}
              >
                {debouncedSearch.trim() ? 'Jamaah Tidak Ditemukan' : 'Belum Ada Jamaah'}
              </h2>
              <p
                className={styles.listp30}
              >
                {debouncedSearch.trim()
                  ? `Tidak ada jamaah yang cocok dengan "${debouncedSearch.trim()}".`
                  : activeStatus
                  ? `Tidak ada jamaah dengan status "${STATUS_OPTIONS.find((s) => s.key === activeStatus)?.label}".`
                  : 'Jamaah yang mendaftar melalui tautan referral Anda atau input manual akan muncul di sini.'}
              </p>
            </div>

            {!travelSuspended && (
              <button
                type="button"
                onClick={handleOpenModal}
                className={styles.listbutton31}
              >
                <Plus size={15} />
                <span>Tambah Jamaah Manual</span>
              </button>
            )}
          </div>
        ) : (
          <div className={styles.listdiv32}>
            {filteredJamaah.map((item) => {
              const badge = getStatusBadge(item.status);
              const isManual = item.entry_method === 'agent_manual';

              return (
                <Link
                  key={item.id}
                  href={`/agen/jamaah/${item.id}`}
                  className={styles.listlink33}
                >
                  {/* Row 1: Nama & Badge Status */}
                  <div
                    className={styles.listdiv34}
                  >
                    <div className={styles.listdiv35}>
                      <span
                        className={styles.listspan36}
                      >
                        {item.name}
                      </span>
                      <span
                        className={styles.listspan37}
                      >
                        {item.phone}
                      </span>
                    </div>

                    <span
                      className={styles.listspan38} style={{
  backgroundColor: badge.bg,
  color: badge.color,
  border: badge.border
}}
                    >
                      {badge.label}
                      {item.status === 'closing' && (item.paid_off_at ? ' · Lunas' : ' · Menunggu lunas')}
                    </span>
                  </div>

                  {/* Row 2: Paket & Jumlah Jamaah */}
                  <div
                    className={styles.listdiv39}
                  >
                    <div
                      className={styles.listdiv40}
                    >
                      <PackageIcon size={14} color="var(--tw-text-muted)" className={styles.noShrink} />
                      <span className={styles.listspan41}>
                        {item.package_name || 'Paket Pilihan'}
                      </span>
                    </div>

                    <div
                      className={styles.listdiv42}
                    >
                      <Users size={13} color="var(--tw-text-muted)" />
                      <span>{item.jumlah_jamaah || 1} Jamaah</span>
                    </div>
                  </div>

                  {/* Row 3: Tanggal Masuk & Entry Method */}
                  <div
                    className={styles.listdiv43}
                  >
                    <div className={styles.listdiv44}>
                      <div className={styles.listdiv45}>
                        <Calendar size={12} />
                        <span>{formatDate(item.created_at)}</span>
                      </div>
                      {isManual && (
                        <span
                          className={styles.listspan46}
                        >
                          Manual
                        </span>
                      )}
                    </div>

                    <div className={styles.listdiv47}>
                      <span>Detail</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                </Link>
              );
            })}
            {jamaahList.length < total && (
              <button
                type="button"
                className={styles.listbutton63}
                onClick={() => fetchJamaah(activeStatus, page + 1)}
                disabled={loadingMore}
              >
                {loadingMore ? 'Memuat...' : `Muat lebih banyak (${jamaahList.length} dari ${total})`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal Tambah Jamaah Manual */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-tambah-title"
          className={styles.listdiv48}
        >
          <div
            className={styles.listdiv49}
          >
            {/* Modal Header */}
            <div
              className={styles.listdiv50}
            >
              <div className={styles.listdiv51}>
                <h2
                  id="modal-tambah-title"
                  className={styles.listh252}
                >
                  Tambah Jamaah Manual
                </h2>
                <span className={styles.listspan53}>
                  Catat calon jamaah yang mendaftar via WhatsApp
                </span>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                disabled={formSubmitting}
                aria-label="Tutup modal"
                className={styles.listbutton54}
              >
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div
                className={styles.listdiv55}
              >
                {formError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleFormSubmit} className={styles.listform56}>
              {/* Nama */}
              <div className={styles.listdiv57}>
                <label className={styles.listlabel58}>
                  Nama Lengkap Jamaah <span className={styles.listspan59}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: H. Ahmad Subagio"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={styles.listinput60}
                />
              </div>

              {/* WhatsApp */}
              <div className={styles.listdiv28}>
                <label className={styles.listlabel58}>
                  Nomor WhatsApp <span className={styles.listspan59}>*</span>
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
                  className={styles.listinput60}
                />
                <span className={styles.listspan61}>
                  Format: 08xx atau 628xx (10-13 digit angka)
                </span>
              </div>

              {/* Paket Pilihan */}
              <div className={styles.listdiv57}>
                <label className={styles.listlabel58}>
                  Pilihan Paket Umroh
                </label>
                <select
                  value={formData.package_id}
                  onChange={(e) => setFormData({ ...formData, package_id: e.target.value })}
                  className={styles.listinput60}
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
              <div className={styles.listdiv57}>
                <label className={styles.listlabel58}>
                  Jumlah Jamaah
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={formData.jumlah_jamaah}
                  onChange={(e) =>
                    setFormData({ ...formData, jumlah_jamaah: Math.min(50, parseInt(e.target.value, 10) || 1) })
                  }
                  className={styles.listinput60}
                />
              </div>

              {/* Rencana Berangkat: only without a package (a package has its own departure date) */}
              {!formData.package_id && (
              <div className={styles.listdiv57}>
                <label className={styles.listlabel58} htmlFor="manual-departure">
                  Rencana Berangkat
                </label>
                <select
                  id="manual-departure"
                  value={formData.departure_plan}
                  onChange={(e) => setFormData({ ...formData, departure_plan: e.target.value })}
                  className={styles.listinput60}
                >
                  {departureOptions().map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              )}

              {/* Domisili */}
              <div className={styles.listdiv57}>
                <label className={styles.listlabel58} htmlFor="manual-domicile">
                  Domisili (Kota)
                </label>
                <input
                  id="manual-domicile"
                  type="text"
                  maxLength={100}
                  placeholder="Contoh: Bandung"
                  value={formData.domicile}
                  onChange={(e) => setFormData({ ...formData, domicile: e.target.value })}
                  className={styles.listinput60}
                />
              </div>

              {/* Persetujuan (UU PDP) */}
              <label className={styles.manualConsent} htmlFor="manual-consent">
                <input
                  id="manual-consent"
                  type="checkbox"
                  checked={formData.consent}
                  onChange={(e) => setFormData({ ...formData, consent: e.target.checked })}
                />
                <span>Calon jamaah sudah setuju nama dan nomor WhatsApp-nya disimpan dan dihubungi oleh travel.</span>
              </label>

              {/* Modal Buttons */}
              <div
                className={styles.listdiv62}
              >
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={formSubmitting}
                  className={styles.listbutton63}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className={`${styles.listbutton64} ${formSubmitting ? styles.listbutton65 : styles.listbutton66}`}
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
