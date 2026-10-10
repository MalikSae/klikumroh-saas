'use client';

import React, { useState, useEffect, useRef } from 'react';
import { capitalizeName } from '@/lib/personName';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, Plus, RefreshCw, AlertCircle, X, Search, MessageCircle } from 'lucide-react';
import { CustomDropdown } from '../../../components/CustomDropdown';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentPage } from '../../../components/agent/AgentPage';
import { AgentPageHeader } from '../../../components/agent/AgentPageHeader';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import { AgentTravelSuspendedNotice } from '../../../components/AgentTravelSuspendedNotice';
import { CityField } from '../../../components/CityField';
import styles from './page.module.css';
import './Jamaah.css';
import { logHabit } from '../../../lib/agentHabits';
import { jakartaDateLabel, jakartaDayKey, jakartaMonthOptions } from '../../../lib/jakartaTime';
import { appendUniqueById } from '../../../lib/appendUnique';
import { readJsonSafe, apiErrorMessage } from '../../../lib/safeJson';

const PAGE_SIZE = 20;

// Next 24 months as "YYYY-MM" for the planned departure (plus "belum tahu"), starting at the WIB month:
// the backend rejects months before it.
const departureOptions = (): { value: string; label: string }[] => [{ value: '', label: 'Belum tahu' }, ...jakartaMonthOptions(24)];

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

const STATUS_LABEL: Record<string, string> = {
  baru: 'Baru',
  dihubungi: 'Dihubungi',
  tertarik: 'Tertarik',
  closing: 'Closing',
  tidak_lanjut: 'Tidak Lanjut',
};

// wa.me needs the number in international form without "+": 0812... -> 62812...
const whatsAppUrl = (phone: string, name: string, travelName: string) => {
  const clean = phone.replace(/\D/g, '').replace(/^0/, '62');
  const greeting = `Assalamu'alaikum ${name}, perkenalkan saya mitra resmi ${travelName || 'travel kami'}. Terkait rencana ibadah umroh Bapak/Ibu, apakah ada informasi yang ingin ditanyakan?`;
  return `https://wa.me/${clean}?text=${encodeURIComponent(greeting)}`;
};

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
  // Travel name for the WhatsApp greeting.
  const [travelName, setTravelName] = useState<string>('');
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

      // 403 ErrAgentNotActive: the agent was deactivated or is not approved; the status page explains it
      // (same as Beranda, Riwayat, Tarik saldo and Leaderboard).
      if (res.status === 403) {
        router.push('/agen/status');
        return;
      }

      if (!res.ok) {
        throw new Error('Gagal memuat daftar jamaah');
      }

      const data = await res.json();
      if (seq !== requestSeq.current) return;
      const items: AgentProspectItem[] = Array.isArray(data?.items) ? data.items : [];
      if (data?.status_counts && typeof data.status_counts === 'object') setStatusCounts(data.status_counts);
      // Offset paging can repeat a row after new jamaah arrive between loads: append only rows not shown yet.
      setJamaahList((prev) => (pageToLoad === 1 ? appendUniqueById([], items) : appendUniqueById(prev, items)));
      setTotal(typeof data?.total === 'number' ? data.total : items.length);
      setPage(pageToLoad);
    } catch (err: unknown) {
      // A superseded request (newer tab or search started) must not show its error over the newer one.
      if (seq !== requestSeq.current) return;
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data';
      setError(msg);
    } finally {
      // Only the latest request ends the loading state; otherwise the old tab's rows show under the new chip.
      if (seq === requestSeq.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  // Raised by whatever starts a load, so the effect that runs fetchJamaah sets no state synchronously.
  const beginLoad = (pageToLoad: number) => {
    if (pageToLoad === 1) setLoading(true);
    else setLoadingMore(true);
    setError(null);
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
    const timer = setTimeout(() => {
      if (searchQuery !== debouncedSearch) beginLoad(1);
      setDebouncedSearch(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set when the response lands
    fetchJamaah(activeStatus, 1, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStatus, debouncedSearch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set when the response lands
    fetchPackages();
    fetch('/api/public/tenant-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.name) setTravelName(json.name);
      })
      .catch(() => {});
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
      package_id: '', // Package is optional: start with none picked.
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

      // A gateway error page is not JSON: show a friendly message, never the parser's.
      const body = await readJsonSafe<{ id?: number; error?: string }>(res);
      if (!res.ok) {
        throw new Error(apiErrorMessage(res.status, body, 'Gagal menambahkan jamaah'));
      }

      setIsModalOpen(false);
      if (body?.id) {
        router.push(`/agen/jamaah/${body.id}`);
      } else {
        // Saved, but the reply could not be read: show the refreshed list instead of a broken detail URL.
        beginLoad(1);
        fetchJamaah(activeStatus, 1, debouncedSearch);
      }
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
      // Calendar date in WIB (the travel's time), not the device zone.
      const sameYear = jakartaDayKey(dateStr).slice(0, 4) === jakartaDayKey(new Date()).slice(0, 4);
      return jakartaDateLabel(dateStr, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }) || dateStr;
    } catch {
      return dateStr;
    }
  };

  // The server already applied status and search.
  const filteredJamaah = jamaahList;

  return (
    <MobileContainer>
      {/* Tab page (bottom navbar): no back button */}
      <AgentPageHeader title="Jamaah" />

      {travelSuspended && <AgentTravelSuspendedNotice />}

      <AgentPage withTabBar>
        {!travelSuspended && (
          <div className="ag-shell-toolbar">
            <button type="button" onClick={handleOpenModal} className="jm-add">
              <Plus size={16} aria-hidden="true" />
              <span>Tambah</span>
            </button>
          </div>
        )}
        <div className="jm-search">
          <Search size={18} className="jm-search__icon" aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari nama, nomor WA, atau paket"
            aria-label="Cari jamaah"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="tw-field jm-search__input"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="jm-search__clear" aria-label="Hapus pencarian">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Status filter: scrolls sideways; the right edge fades to show there is more. */}
        <div className="jm-chips" role="tablist" aria-label="Filter status">
          {STATUS_OPTIONS.map((tab) => {
            const isActive = activeStatus === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  if (tab.key !== activeStatus) beginLoad(1);
                  setActiveStatus(tab.key);
                }}
                className={`jm-chip${isActive ? ' jm-chip--active' : ''}`}
              >
                {tab.label}
                <span className="jm-chip__count">{(tab.key === '' ? statusCounts.total : statusCounts[tab.key]) || 0}</span>
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
              onClick={() => {
                beginLoad(1);
                fetchJamaah();
              }}
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
          <>
            <ul className="jm-list">
              {filteredJamaah.map((item) => {
                const isManual = item.entry_method === 'agent_manual';
                const statusText =
                  (STATUS_LABEL[item.status] || item.status) +
                  (item.status === 'closing' ? (item.paid_off_at ? ' · Lunas' : ' · Belum lunas') : '');
                const meta = [`${item.jumlah_jamaah || 1} jamaah`, item.package_name, isManual ? 'Manual' : '']
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={item.id} className="jm-row">
                    <Link href={`/agen/jamaah/${item.id}`} className="jm-row__main">
                      <span className="jm-row__top">
                        <span className="jm-row__name">{item.name}</span>
                        <span className="jm-row__date">{formatDate(item.created_at)}</span>
                      </span>
                      <span className="jm-row__meta">
                        <span className={`jm-status jm-status--${item.status}`}>{statusText}</span>
                        <span className="jm-row__info">{meta}</span>
                      </span>
                    </Link>
                    {item.phone && (
                      <a
                        href={whatsAppUrl(item.phone, item.name, travelName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="jm-wa"
                        onClick={() => logHabit('contact')}
                        aria-label={`Chat WhatsApp ${item.name}`}
                      >
                        <MessageCircle size={20} aria-hidden="true" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
            {jamaahList.length < total && (
              <button
                type="button"
                className="jm-more"
                onClick={() => {
                  beginLoad(page + 1);
                  fetchJamaah(activeStatus, page + 1);
                }}
                disabled={loadingMore}
              >
                {loadingMore ? 'Memuat...' : `Muat lebih banyak (${jamaahList.length} dari ${total})`}
              </button>
            )}
          </>
        )}
      </AgentPage>

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
                  onChange={(e) => setFormData({ ...formData, name: capitalizeName(e.target.value) })}
                  autoCapitalize="words"
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
                <CustomDropdown
                  value={formData.package_id}
                  placeholder="Pilih Paket (Opsional)"
                  options={[{ value: '', label: 'Pilih Paket (Opsional)' }, ...packages.map((pkg) => ({ value: String(pkg.id), label: pkg.name }))]}
                  onChange={(e) => setFormData({ ...formData, package_id: String(e.target.value) })}
                />
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
                <CustomDropdown
                  id="manual-departure"
                  value={formData.departure_plan}
                  options={departureOptions().map((o) => ({ value: o.value, label: o.label }))}
                  onChange={(e) => setFormData({ ...formData, departure_plan: String(e.target.value) })}
                />
              </div>
              )}

              {/* Domisili */}
              <CityField
                id="manual-domicile"
                label="Domisili (Kota)"
                placeholder="Contoh: Bandung"
                value={formData.domicile}
                onChange={(v) => setFormData({ ...formData, domicile: v })}
                className={styles.listdiv57}
                labelClassName={styles.listlabel58}
                inputClassName={styles.listinput60}
              />

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
