'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X, ChevronRight, ChevronDown, CheckCircle2, Users } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentPage } from '../../../components/agent/AgentPage';
import { AgentPageHeader } from '../../../components/agent/AgentPageHeader';
import './SumberJamaah.css';
import { fetchSumberDone } from '../../../lib/agentHabits';
import sumberDataRaw from '../../../data/sumber-jamaah.json';

interface SumberJamaahItem {
  id: number;
  kategori: string;
  sumber: string;
  kenapa_dicoba: string;
  cara_mulai: string;
  contoh: string;
}


export default function SumberJamaahPage() {
  const router = useRouter();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Categories shown open (the first one starts open); every category is a collapsible group.
  const [openCategories, setOpenCategories] = useState<string[]>(['Keluarga & Relasi Pribadi']);
  const toggleCategory = (kategori: string) =>
    setOpenCategories((prev) => (prev.includes(kategori) ? prev.filter((k) => k !== kategori) : [...prev, kategori]));

  // Completed checklist tracker (stored in localStorage)
  const [completedIds, setCompletedIds] = useState<number[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    // Auth check only — no branding needed for sticky-header pages
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/agent/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          localStorage.removeItem('agent_token');
          router.push('/agen/login');
        }
      } catch {
        // Soft fail
      }
    };
    checkAuth();

    // Tried sources come from the server (an old browser-only list is moved up once).
    fetchSumberDone().then((ids) => {
      if (ids) setCompletedIds(ids);
    });
  }, [router]);

  // Get all unique categories with counts
  const categoriesWithCounts = useMemo(() => {
    const map = new Map<string, number>();
    (sumberDataRaw as SumberJamaahItem[]).forEach((item) => {
      map.set(item.kategori, (map.get(item.kategori) || 0) + 1);
    });
    return Array.from(map.entries()).map(([kategori, count]) => ({ kategori, count }));
  }, []);

  // Search results across all categories (shown as one flat list while searching).
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return (sumberDataRaw as SumberJamaahItem[]).filter((item) => {
      if (!q) return true;
      return (
        item.sumber.toLowerCase().includes(q) ||
        item.kategori.toLowerCase().includes(q) ||
        item.kenapa_dicoba.toLowerCase().includes(q) ||
        item.cara_mulai.toLowerCase().includes(q) ||
        item.contoh.toLowerCase().includes(q)
      );
    });
  }, [searchQuery]);

  const totalItems = (sumberDataRaw as SumberJamaahItem[]).length;
  const completedCount = completedIds.length;
  const progressPercent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  const isSearching = searchQuery.trim() !== '';
  const allItems = sumberDataRaw as SumberJamaahItem[];

  const renderRow = (item: SumberJamaahItem, showCategory: boolean) => {
    const done = completedIds.includes(item.id);
    return (
      <li key={item.id}>
        <Link href={`/agen/sumber-jamaah/${item.id}`} className="sj-row">
          <span className={`sj-row__num${done ? ' sj-row__num--done' : ''}`}>
            {done ? <CheckCircle2 size={20} aria-label="Sudah dicoba" /> : item.id}
          </span>
          <span className="sj-row__text">
            <span className="sj-row__title">{item.sumber}</span>
            {showCategory && <span className="sj-muted">{item.kategori}</span>}
          </span>
          <ChevronRight size={18} className="sj-row__go" aria-hidden="true" />
        </Link>
      </li>
    );
  };

  return (
    <MobileContainer>
      {/* Drill-down page (opened from the home menu): back button, no bottom tab bar. */}
      <AgentPageHeader title="99 sumber jamaah" onBack={() => router.back()} />

      <AgentPage>
        {/* Progress, once */}
        <div className="sj-progress" aria-label={`${completedCount} dari ${totalItems} sumber sudah dicoba`}>
          <p className="sj-progress__text">
            <strong>{completedCount}</strong> dari {totalItems} sumber sudah dicoba
          </p>
          <span className="sj-progress__bar">
            <span className="sj-progress__fill" style={{ width: `${progressPercent}%` }} />
          </span>
        </div>

        {/* Search */}
        <div className="sj-search">
          <Search size={18} className="sj-search__icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="Cari sumber jamaah"
            placeholder="Cari ide relasi, contoh obrolan"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="tw-field sj-search__input"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="sj-search__clear" aria-label="Hapus pencarian">
              <X size={18} />
            </button>
          )}
        </div>

        {isSearching ? (
          filteredItems.length === 0 ? (
            <div className="sj-empty">
              <Users size={28} aria-hidden="true" />
              <p className="sj-muted">Tidak ada sumber yang cocok dengan &quot;{searchQuery.trim()}&quot;.</p>
              <button type="button" className="sj-btn" onClick={() => setSearchQuery('')}>
                Hapus pencarian
              </button>
            </div>
          ) : (
            <>
              <p className="sj-muted">{filteredItems.length} sumber ditemukan</p>
              <ul className="sj-panel">{filteredItems.map((item) => renderRow(item, true))}</ul>
            </>
          )
        ) : (
          /* Every category as a collapsible group with its own progress. */
          <div className="sj-groups">
            {categoriesWithCounts.map(({ kategori, count }) => {
              const items = allItems.filter((i) => i.kategori === kategori);
              const done = items.filter((i) => completedIds.includes(i.id)).length;
              const open = openCategories.includes(kategori);
              return (
                <section key={kategori} className="sj-panel">
                  <button type="button" className="sj-group" onClick={() => toggleCategory(kategori)} aria-expanded={open}>
                    <span className="sj-group__name">{kategori}</span>
                    <span className={`sj-group__count${done === count ? ' sj-group__count--done' : ''}`}>
                      {done}/{count}
                    </span>
                    <ChevronDown size={18} className={`sj-group__chev${open ? ' sj-group__chev--open' : ''}`} aria-hidden="true" />
                  </button>
                  {open && <ul className="sj-list">{items.map((item) => renderRow(item, false))}</ul>}
                </section>
              );
            })}
          </div>
        )}
      </AgentPage>
    </MobileContainer>
  );
}
