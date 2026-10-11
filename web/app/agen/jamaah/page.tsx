'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plus } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { StatusLabel } from '../../../components/agent/StatusLabel';
import { prospectStatusText, prospectStatusTone } from '../../../lib/prospectStatus';
import { AgentPage } from '../../../components/agent/AgentPage';
import { AgentPageHeader } from '../../../components/agent/AgentPageHeader';
import { AgentButton } from '../../../components/agent/AgentButton';
import { AgentStateEmpty, AgentStateError, AgentStateLoading } from '../../../components/agent/AgentState';
import { AgentList, AgentListRow } from '../../../components/agent/AgentList';
import { AgentSearch } from '../../../components/agent/AgentSearch';
import { AgentChips } from '../../../components/agent/AgentChips';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import { AgentTravelSuspendedNotice } from '../../../components/AgentTravelSuspendedNotice';
import './Jamaah.css';
import { jakartaDateLabel, jakartaDayKey, jakartaTimeLabel } from '../../../lib/jakartaTime';
import { appendUniqueById } from '../../../lib/appendUnique';

const PAGE_SIZE = 20;

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
    const token = localStorage.getItem('agent_token');
    if (!token) return;
    fetch('/api/agent/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => setTravelSuspended(Boolean(me?.travel_suspended)))
      .catch(() => {
        // The backend still refuses writes while suspended.
      });
  }, []);

  // The add form is a page of its own.
  const handleOpenModal = () => router.push('/agen/jamaah/baru');

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
        {/* Search and the add action share one row; the add action is hidden while the travel is suspended. */}
        <div className="jm-searchbar">
          <AgentSearch value={searchQuery} onChange={setSearchQuery} placeholder="Cari jamaah" label="Cari nama, nomor WA, atau paket" />
          {!travelSuspended && (
            <AgentButton variant="primary" className="jm-searchbar__add" onClick={handleOpenModal}>
              <Plus size={16} aria-hidden="true" />
              <span>Tambah</span>
            </AgentButton>
          )}
        </div>

        {/* Status filter: scrolls sideways; the right edge fades to show there is more. */}
        <AgentChips
          label="Filter status"
          value={activeStatus}
          items={STATUS_OPTIONS.map((tab) => ({
            key: tab.key,
            label: tab.label,
            count: (tab.key === '' ? statusCounts.total : statusCounts[tab.key]) || 0,
          }))}
          onChange={(key) => {
            if (key !== activeStatus) beginLoad(1);
            setActiveStatus(key);
          }}
        />

        {/* Content Body */}
        {loading ? (
                    <AgentStateLoading text="Memuat data jamaah..." />
        ) : error ? (
                    <AgentStateError
            text={error}
            onRetry={() => {
              beginLoad(1);
              fetchJamaah();
            }}
          />
        ) : filteredJamaah.length === 0 ? (
                    <AgentStateEmpty
            panel
            icon={<Users size={32} aria-hidden="true" />}
            title={debouncedSearch.trim() ? 'Jamaah Tidak Ditemukan' : 'Belum Ada Jamaah'}
            text={
              debouncedSearch.trim()
                ? `Tidak ada jamaah yang cocok dengan "${debouncedSearch.trim()}".`
                : activeStatus
                ? `Tidak ada jamaah dengan status "${STATUS_OPTIONS.find((s) => s.key === activeStatus)?.label}".`
                : 'Jamaah yang mendaftar melalui tautan referral Anda atau input manual akan muncul di sini.'
            }
            action={
              travelSuspended
                ? undefined
                : { label: 'Tambah Jamaah Manual', onClick: handleOpenModal, variant: 'primary', icon: <Plus size={16} aria-hidden="true" /> }
            }
          />
        ) : (
          <>
            <AgentList>
              {filteredJamaah.map((item) => {
                const isManual = item.entry_method === 'agent_manual';
                const statusText = prospectStatusText(item.status, item.paid_off_at);
                const meta = [isManual ? 'Manual' : '', `${item.jumlah_jamaah || 1} jamaah`, item.package_name]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <AgentListRow
                    key={item.id}
                    href={`/agen/jamaah/${item.id}`}
                    title={item.name}
                    aside={
                      <span className="jm-when">
                        <span className="jm-when__date">{formatDate(item.created_at)}</span>
                        <span className="jm-when__time">{jakartaTimeLabel(item.created_at)}</span>
                      </span>
                    }
                    meta={
                      <>
                        <StatusLabel tone={prospectStatusTone(item.status)}>{statusText}</StatusLabel>
                        <span>{meta}</span>
                      </>
                    }
                  />
                );
              })}
            </AgentList>
            {jamaahList.length < total && (
              <AgentButton
                size="lg"
                block
                onClick={() => {
                  beginLoad(page + 1);
                  fetchJamaah(activeStatus, page + 1);
                }}
                disabled={loadingMore}
              >
                {loadingMore ? 'Memuat...' : `Muat lebih banyak (${jamaahList.length} dari ${total})`}
              </AgentButton>
            )}
          </>
        )}
      </AgentPage>

      {/* Modal Tambah Jamaah Manual */}
      <AgentBottomNavbar />
    </MobileContainer>
  );
}
