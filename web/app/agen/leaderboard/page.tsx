'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw, Users, ArrowLeft, Trophy, Medal, Loader2 } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';

interface LeaderboardEntry {
  rank: number;
  name: string;
  total_jamaah_closing: number;
  is_me: boolean;
}

export default function AgenLeaderboardPage() {
  const router = useRouter();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Infinite scroll pagination state (10 items per load)
  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const fetchLeaderboard = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/agent/leaderboard', {
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
        throw new Error('Gagal memuat data leaderboard');
      }

      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setLeaderboard(list);
      setVisibleCount(PAGE_SIZE);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myEntry = leaderboard.find((item) => item.is_me);

  // Paginated leaderboard items
  const displayedLeaderboard = useMemo(() => {
    return leaderboard.slice(0, visibleCount);
  }, [leaderboard, visibleCount]);

  const totalItemsCount = leaderboard.length;
  const hasMore = displayedLeaderboard.length < totalItemsCount;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => {
      if (prev >= totalItemsCount) return prev;
      return Math.min(prev + PAGE_SIZE, totalItemsCount);
    });
  }, [totalItemsCount]);

  // Infinite scroll sentinel observer
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 1. IntersectionObserver
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0] && entries[0].isIntersecting) {
          loadMore();
        }
      },
      { root: null, rootMargin: '300px', threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // 2. Window scroll event listener failsafe
  useEffect(() => {
    if (!hasMore) return;

    const handleScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );

      if (scrollY + windowHeight >= documentHeight - 350) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    const timer = setTimeout(handleScroll, 150);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
    };
  }, [hasMore, loadMore]);

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
            Leaderboard
          </h1>
          <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', lineHeight: 1.3 }}>
            Peringkat closing mitra agen aktif
          </span>
        </div>

        {myEntry && (
          <div
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 10%, var(--tw-background))',
              color: 'var(--tw-brand-primary)',
              fontSize: '11px',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Peringkat #{myEntry.rank}
          </div>
        )}
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
        {/* Highlight Banner Posisi Saya (jika terdaftar) - Solid Brand Color */}
        {!loading && !error && myEntry && (
          <div
            style={{
              backgroundColor: 'var(--tw-brand-primary)',
              borderRadius: '12px',
              border: 'none',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              boxShadow: '0 4px 16px color-mix(in srgb, var(--tw-brand-primary) 28%, transparent)',
              color: '#FFFFFF',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Subtle background decoration */}
            <div
              style={{
                position: 'absolute',
                right: '-20px',
                top: '-20px',
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: '40px',
                bottom: '-30px',
                width: '70px',
                height: '70px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                pointerEvents: 'none',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 1 }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.18)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Trophy size={22} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.85)', fontWeight: 600 }}>
                  Posisi Anda Saat Ini
                </span>
                <span
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: '#FFFFFF',
                    fontFamily: 'var(--tw-font-heading)',
                    lineHeight: 1.2,
                  }}
                >
                  Peringkat #{myEntry.rank}
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px', position: 'relative', zIndex: 1 }}>
              <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.85)', fontWeight: 600 }}>
                Total Closing
              </span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.2 }}>
                {myEntry.total_jamaah_closing}{' '}
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.85)' }}>
                  Jamaah
                </span>
              </span>
            </div>
          </div>
        )}

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
              Memuat peringkat agen...
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
              onClick={() => fetchLeaderboard()}
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
        ) : leaderboard.length === 0 ? (
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
            <h2
              style={{
                fontSize: '15px',
                fontWeight: 700,
                margin: 0,
                color: 'var(--tw-text-primary)',
                fontFamily: 'var(--tw-font-heading)',
              }}
            >
              Belum Ada Data Peringkat
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
              Daftar peringkat akan terisi otomatis seiring verifikasi jamaah closing di sistem.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {displayedLeaderboard.map((item) => {
              const isMe = item.is_me;
              const isFirst = item.rank === 1;
              const isSecond = item.rank === 2;
              const isThird = item.rank === 3;

              // Rank badge styling
              let rankBg = 'rgba(0, 0, 0, 0.04)';
              let rankColor = 'var(--tw-text-secondary)';
              let rankBorder = '1px solid transparent';

              if (isFirst) {
                rankBg = 'color-mix(in srgb, #f59e0b 16%, var(--tw-background))';
                rankColor = '#b45309';
                rankBorder = '1px solid color-mix(in srgb, #f59e0b 35%, transparent)';
              } else if (isSecond) {
                rankBg = 'color-mix(in srgb, #64748b 14%, var(--tw-background))';
                rankColor = '#475569';
                rankBorder = '1px solid color-mix(in srgb, #64748b 30%, transparent)';
              } else if (isThird) {
                rankBg = 'color-mix(in srgb, #d97706 14%, var(--tw-background))';
                rankColor = '#b45309';
                rankBorder = '1px solid color-mix(in srgb, #d97706 30%, transparent)';
              }

              return (
                <div
                  key={item.rank}
                  style={{
                    backgroundColor: isMe
                      ? 'color-mix(in srgb, var(--tw-brand-primary) 6%, var(--tw-background))'
                      : 'var(--tw-background)',
                    borderRadius: '10px',
                    border: isMe
                      ? '1.5px solid color-mix(in srgb, var(--tw-brand-primary) 30%, transparent)'
                      : '1px solid rgba(0, 0, 0, 0.06)',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    boxShadow: 'var(--tw-card-shadow)',
                  }}
                >
                  {/* Left Column: Nomor Urut & Nama */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      overflow: 'hidden',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        backgroundColor: rankBg,
                        color: rankColor,
                        border: rankBorder,
                        fontSize: '13px',
                        fontWeight: isFirst || isSecond || isThird ? 800 : 600,
                        fontFamily: 'var(--tw-font-heading)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {item.rank}
                    </span>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        overflow: 'hidden',
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: isMe ? 700 : 600,
                          color: 'var(--tw-text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.name}
                      </span>
                      {isMe && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'var(--tw-brand-primary)',
                            backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 12%, var(--tw-background))',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            flexShrink: 0,
                          }}
                        >
                          Anda
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Angka Jamaah Closing */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '4px',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: 'var(--tw-text-primary)',
                        fontFamily: 'var(--tw-font-heading)',
                      }}
                    >
                      {item.total_jamaah_closing}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--tw-text-muted)',
                      }}
                    >
                      jamaah
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Infinite Scroll Sentinel & Load Indicator */}
        {!loading && !error && totalItemsCount > 0 && (
          <div
            ref={sentinelRef}
            style={{
              marginTop: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              paddingBottom: '16px',
            }}
          >
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                style={{
                  padding: '10px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  color: 'var(--tw-brand-primary)',
                  backgroundColor: 'var(--tw-background)',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                }}
              >
                <Loader2 size={15} color="var(--tw-brand-primary)" style={{ animation: 'spin 1s linear infinite' }} />
                <span>Memuat peringkat berikutnya ({displayedLeaderboard.length} dari {totalItemsCount})...</span>
              </button>
            ) : totalItemsCount > PAGE_SIZE ? (
              <div
                style={{
                  padding: '12px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color: 'var(--tw-text-muted)',
                }}
              >
                Menampilkan seluruh {totalItemsCount} mitra agen
              </div>
            ) : null}
          </div>
        )}
      </div>

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
