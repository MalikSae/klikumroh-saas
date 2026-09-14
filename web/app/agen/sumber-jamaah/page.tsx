'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Search,
  X,
  Users,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import sumberDataRaw from '../../../data/sumber-jamaah.json';

interface SumberJamaahItem {
  id: number;
  kategori: string;
  sumber: string;
  kenapa_dicoba: string;
  cara_mulai: string;
  contoh: string;
}

const STORAGE_KEY = 'klikumroh_agent_sumber_completed';

export default function SumberJamaahPage() {
  const router = useRouter();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Keluarga & Relasi Pribadi');

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

    // Load completed list from localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setCompletedIds(parsed);
      }
    } catch {
      // Ignore parse error
    }
  }, [router]);

  // Toggle checklist status
  const toggleCompleted = (id: number) => {
    setCompletedIds((prev) => {
      const isCompleted = prev.includes(id);
      const updated = isCompleted ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore quota error
      }
      return updated;
    });
  };

  // Get all unique categories with counts
  const categoriesWithCounts = useMemo(() => {
    const map = new Map<string, number>();
    (sumberDataRaw as SumberJamaahItem[]).forEach((item) => {
      map.set(item.kategori, (map.get(item.kategori) || 0) + 1);
    });
    return Array.from(map.entries()).map(([kategori, count]) => ({ kategori, count }));
  }, []);

  // Filtered items
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return (sumberDataRaw as SumberJamaahItem[]).filter((item) => {
      const matchesCategory =
        !selectedCategory || selectedCategory === 'Semua' || item.kategori === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        item.sumber.toLowerCase().includes(q) ||
        item.kategori.toLowerCase().includes(q) ||
        item.kenapa_dicoba.toLowerCase().includes(q) ||
        item.cara_mulai.toLowerCase().includes(q) ||
        item.contoh.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, selectedCategory]);

  const totalItems = (sumberDataRaw as SumberJamaahItem[]).length;
  const completedCount = completedIds.length;
  const progressPercent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

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
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--tw-text-primary)',
              margin: 0,
              fontFamily: 'var(--tw-font-heading)',
              lineHeight: 1.2,
            }}
          >
            99 Sumber Jamaah
          </h1>
          <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', lineHeight: 1.3 }}>
            Bingung mau cari jamaah dari mana? Pilih salah satu.
          </span>
        </div>

        {/* Progress indicator in header */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '3px',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 800,
              color: 'var(--tw-brand-primary)',
              fontFamily: 'var(--tw-font-heading)',
            }}
          >
            {progressPercent}%
          </span>
          <div
            style={{
              width: '48px',
              height: '4px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                backgroundColor: 'var(--tw-brand-primary)',
                borderRadius: '9999px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
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
        {/* Progress Card */}
        <div
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            padding: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <TrendingUp size={20} color="var(--tw-brand-primary)" style={{ flexShrink: 0 }} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tw-text-primary)' }}>
                Progres Eksplorasi
              </span>
              <span style={{ fontSize: '12px', color: 'var(--tw-text-muted)' }}>
                <strong style={{ color: 'var(--tw-text-primary)' }}>{completedCount}</strong> / {totalItems}
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(0,0,0,0.06)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  backgroundColor: 'var(--tw-brand-primary)',
                  borderRadius: '9999px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          <span
            style={{
              fontSize: '14px',
              fontWeight: 800,
              color: progressPercent === 100 ? 'var(--tw-brand-primary)' : 'var(--tw-text-secondary)',
              fontFamily: 'var(--tw-font-heading)',
              flexShrink: 0,
            }}
          >
            {progressPercent}%
          </span>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
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
            placeholder="Cari ide relasi, contoh obrolan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 36px 10px 36px',
              borderRadius: '8px',
              border: '1px solid rgba(0,0,0,0.1)',
              backgroundColor: 'var(--tw-background)',
              color: 'var(--tw-text-primary)',
              fontSize: '13px',
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

        {/* Category Filter Chips */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '2px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {categoriesWithCounts.map(({ kategori, count }) => {
            const isSelected = selectedCategory === kategori;
            return (
              <button
                key={kategori}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? '' : kategori)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: isSelected
                    ? '1px solid var(--tw-brand-primary)'
                    : '1px solid rgba(0,0,0,0.08)',
                  backgroundColor: isSelected ? 'var(--tw-brand-primary)' : 'var(--tw-background)',
                  color: isSelected ? '#FFFFFF' : 'var(--tw-text-secondary)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{kategori}</span>
                <span
                  style={{
                    fontSize: '10px',
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                    color: isSelected ? '#FFFFFF' : 'var(--tw-text-muted)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Result count + reset */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
          <span style={{ fontSize: '12px', color: 'var(--tw-text-muted)' }}>
            {filteredItems.length} dari {totalItems} sumber
          </span>
          {(searchQuery || selectedCategory !== 'Keluarga & Relasi Pribadi') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('Keluarga & Relasi Pribadi');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--tw-brand-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Reset Filter
            </button>
          )}
        </div>

        {/* Empty State */}
        {filteredItems.length === 0 && (
          <div
            style={{
              backgroundColor: 'var(--tw-background)',
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.06)',
              padding: '40px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <Users size={32} color="var(--tw-text-muted)" />
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tw-text-primary)', fontFamily: 'var(--tw-font-heading)' }}>
              Tidak Ada Sumber yang Cocok
            </span>
            <span style={{ fontSize: '13px', color: 'var(--tw-text-muted)', maxWidth: '260px', lineHeight: 1.5 }}>
              Coba kata kunci lain atau reset filter kategori.
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('Keluarga & Relasi Pribadi');
              }}
              style={{
                marginTop: '4px',
                padding: '8px 20px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'var(--tw-brand-primary)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Tampilkan Semua Sumber
            </button>
          </div>
        )}

        {/* List */}
        {filteredItems.length > 0 && (
          <div
            style={{
              backgroundColor: 'var(--tw-background)',
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}
          >
            {filteredItems.map((item, idx) => {
              const isCompleted = completedIds.includes(item.id);
              return (
                <Link
                  key={item.id}
                  href={`/agen/sumber-jamaah/${item.id}`}
                  style={{
                    padding: '13px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    textDecoration: 'none',
                    borderBottom:
                      idx < filteredItems.length - 1
                        ? '1px solid rgba(0,0,0,0.05)'
                        : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: isCompleted ? 'var(--tw-brand-primary)' : 'var(--tw-text-muted)',
                        fontFamily: 'monospace',
                        backgroundColor: isCompleted
                          ? 'color-mix(in srgb, var(--tw-brand-primary) 12%, var(--tw-background))'
                          : 'var(--tw-page-bg)',
                        padding: '3px 7px',
                        borderRadius: '5px',
                        flexShrink: 0,
                        minWidth: '32px',
                        textAlign: 'center',
                      }}
                    >
                      {String(item.id).padStart(2, '0')}
                    </span>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--tw-text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.sumber}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)' }}>
                        {item.kategori}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {isCompleted && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: 'var(--tw-brand-primary)',
                          backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 10%, var(--tw-background))',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        Selesai
                      </span>
                    )}
                    <ChevronRight size={16} color="var(--tw-text-muted)" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
