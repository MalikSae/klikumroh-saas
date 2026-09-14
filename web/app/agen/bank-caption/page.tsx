'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Search,
  X,
  Copy,
  Check,
  Share2,
  Star,
  Quote,
  Sparkles,
  Package,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import {
  getAllCopies,
  getCopywritingCategories,
  replaceCopyPlaceholders,
  assembleFullCaption,
  type CopyItem,
  type CopyPlaceholderReplacements,
} from '../../../lib/copywritingData';

const FAVORITES_STORAGE_KEY = 'klikumroh_agent_caption_favorites';

interface TenantPackage {
  id: number;
  name: string;
  price?: number;
  hotel_info?: string;
  flight_info?: string;
}


export default function BankCaptionPage() {
  const router = useRouter();

  // Branding & Auth
  const [tenantName, setTenantName] = useState<string>('Travel Umroh');
  const [agentName, setAgentName] = useState<string>('Mitra Agen');
  const [referralLink, setReferralLink] = useState<string>('');

  // Packages & Personalization
  const [packages, setPackages] = useState<TenantPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [includeReferralLink, setIncludeReferralLink] = useState<boolean>(true);
  const [showPersonalization, setShowPersonalization] = useState<boolean>(false);

  // Filters & State
  const [activeGoal, setActiveGoal] = useState<string>('attraction'); // 'attraction', 'education', etc. or 'favorites'
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedPart, setCopiedPart] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [expandedParts, setExpandedParts] = useState<Record<string, boolean>>({});

  const allCopies = useMemo(() => getAllCopies(), []);
  const categories = useMemo(() => getCopywritingCategories(), []);

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch {
      // Soft fail
    }
  }, []);

  // Fetch agent profile & packages
  useEffect(() => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/agent/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          localStorage.removeItem('agent_token');
          router.push('/agen/login');
          return;
        }
        if (res.ok) {
          const data = await res.json();
          const ag = data.agent || data;
          if (ag.name) setAgentName(ag.name);
          if (data.tenant_name) setTenantName(data.tenant_name);

          // Build referral link
          if (ag.referral_code) {
            const host = window.location.host;
            const protocol = window.location.protocol;
            setReferralLink(`${protocol}//${host}/ref/${ag.referral_code}`);
          }
        }
      } catch {
        // Soft fail
      }
    };

    const fetchPublicPackages = async () => {
      try {
        const res = await fetch('/api/public/packages');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setPackages(data);
            if (data.length > 0) {
              setSelectedPackageId(String(data[0].id));
            }
          }
        }
      } catch {
        // Soft fail
      }
    };

    fetchProfile();
    fetchPublicPackages();
  }, [router]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      let updated: string[];
      if (prev.includes(id)) {
        updated = prev.filter((item) => item !== id);
      } else {
        updated = [...prev, id];
      }
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Soft fail
      }
      return updated;
    });
  };

  // Selected package details
  const selectedPackage = useMemo(() => {
    return packages.find((p) => String(p.id) === selectedPackageId) || null;
  }, [packages, selectedPackageId]);

  // Replacements builder
  const replacements: CopyPlaceholderReplacements = useMemo(() => {
    const formattedPrice = selectedPackage?.price
      ? new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 0,
        }).format(selectedPackage.price)
      : 'Rp 28.500.000';

    return {
      travel: tenantName || 'Travel Umroh',
      nama: agentName || 'Bapak/Ibu',
      paket: selectedPackage?.name || 'Paket Umroh Reguler',
      harga: formattedPrice,
      hotel: selectedPackage?.hotel_info || 'Hotel Bintang 4 Dekat Masjid',
      maskapai: selectedPackage?.flight_info || 'Saudia Airlines Direct',
      link: includeReferralLink ? referralLink : '',
      bulan: 'Syawal',
      tahun: String(new Date().getFullYear()),
    };
  }, [tenantName, agentName, selectedPackage, includeReferralLink, referralLink]);

  // Filtered copies
  const filteredCopies = useMemo(() => {
    return allCopies.filter((copy) => {
      // Favorites tab
      if (activeGoal === 'favorites') {
        if (!favorites.includes(copy.id)) return false;
      } else if (activeGoal) {
        if (copy.goal !== activeGoal) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = copy.title?.toLowerCase().includes(q);
        const hookMatch = copy.hook?.toLowerCase().includes(q);
        const bodyMatch = copy.body?.toLowerCase().includes(q);
        const ctaMatch = copy.cta?.toLowerCase().includes(q);
        const tagsMatch = copy.tags?.some((t) => t.toLowerCase().includes(q));
        return titleMatch || hookMatch || bodyMatch || ctaMatch || tagsMatch;
      }

      return true;
    });
  }, [allCopies, activeGoal, searchQuery, favorites]);

  // Infinite scroll pagination state (8 items per load)
  const PAGE_SIZE = 8;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  // Reset pagination on category or search query change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeGoal, searchQuery]);

  // Paginated copies
  const displayedCopies = useMemo(() => {
    return filteredCopies.slice(0, visibleCount);
  }, [filteredCopies, visibleCount]);

  const totalActiveItemsCount = filteredCopies.length;
  const currentlyDisplayedCount = displayedCopies.length;
  const hasMore = currentlyDisplayedCount < totalActiveItemsCount;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => {
      if (prev >= totalActiveItemsCount) return prev;
      return Math.min(prev + PAGE_SIZE, totalActiveItemsCount);
    });
  }, [totalActiveItemsCount]);

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

  // Copy handler
  const handleCopyFull = async (copy: CopyItem) => {
    const text = assembleFullCaption(copy, replacements);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(copy.id);
      setCopiedPart(null);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyPart = async (text: string, copyId: string, partName: string) => {
    const replaced = replaceCopyPlaceholders(text, replacements);
    try {
      await navigator.clipboard.writeText(replaced);
      setCopiedId(copyId);
      setCopiedPart(partName);
      setTimeout(() => {
        setCopiedId(null);
        setCopiedPart(null);
      }, 2000);
    } catch {
      // Fallback
    }
  };

  // WhatsApp share
  const handleShareWA = (copy: CopyItem) => {
    const text = assembleFullCaption(copy, replacements);
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const toggleExpandParts = (id: string) => {
    setExpandedParts((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getGoalBadge = (goal: string) => {
    switch (goal) {
      case 'attraction':
        return {
          label: 'Attraction',
          bg: 'color-mix(in srgb, #3b82f6 12%, var(--tw-background))',
          color: '#1d4ed8',
          border: '1px solid color-mix(in srgb, #3b82f6 28%, transparent)',
        };
      case 'education':
        return {
          label: 'Edukasi',
          bg: 'color-mix(in srgb, var(--tw-rating-star) 12%, var(--tw-background))',
          color: '#b45309',
          border: '1px solid color-mix(in srgb, var(--tw-rating-star) 28%, transparent)',
        };
      case 'desire':
        return {
          label: 'Kerinduan',
          bg: 'color-mix(in srgb, #ec4899 12%, var(--tw-background))',
          color: '#be185d',
          border: '1px solid color-mix(in srgb, #ec4899 28%, transparent)',
        };
      case 'trust':
        return {
          label: 'Kepercayaan',
          bg: 'color-mix(in srgb, #6366f1 12%, var(--tw-background))',
          color: '#4338ca',
          border: '1px solid color-mix(in srgb, #6366f1 28%, transparent)',
        };
      case 'offer':
        return {
          label: 'Penawaran',
          bg: 'color-mix(in srgb, var(--tw-brand-primary) 12%, var(--tw-background))',
          color: 'var(--tw-brand-primary)',
          border: '1px solid color-mix(in srgb, var(--tw-brand-primary) 28%, transparent)',
        };
      default:
        return {
          label: goal,
          bg: 'var(--tw-badge-neutral-bg)',
          color: 'var(--tw-text-muted)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
        };
    }
  };

  return (
    <MobileContainer>
      {/* Sticky App Header — Consistent with /agen/jamaah & /agen/script-wa */}
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
            Bank Caption
          </h1>
          <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', lineHeight: 1.3 }}>
            152 materi posting medsos &amp; status WA
          </span>
        </div>

        {/* Shortcut to favorites */}
        <button
          type="button"
          onClick={() => setActiveGoal(activeGoal === 'favorites' ? 'attraction' : 'favorites')}
          aria-label="Filter Favorit"
          style={{
            padding: '7px 11px',
            borderRadius: '6px',
            border:
              activeGoal === 'favorites'
                ? '1px solid var(--tw-rating-star)'
                : '1px solid rgba(0, 0, 0, 0.08)',
            backgroundColor:
              activeGoal === 'favorites'
                ? 'color-mix(in srgb, var(--tw-rating-star) 14%, var(--tw-background))'
                : 'var(--tw-background)',
            color: activeGoal === 'favorites' ? 'var(--tw-rating-star)' : 'var(--tw-text-secondary)',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            flexShrink: 0,
          }}
        >
          <Star
            size={14}
            fill={activeGoal === 'favorites' ? 'currentColor' : 'none'}
            color="var(--tw-rating-star)"
          />
          <span>{favorites.length}</span>
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
        {/* Personalization Toggle & Package Selector Card */}
        <div
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: 'var(--tw-card-shadow)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
            onClick={() => setShowPersonalization(!showPersonalization)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                <Sparkles size={13} color="var(--tw-brand-primary)" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tw-text-primary)' }}>
                  Data Otomatis Caption
                </span>
                <span style={{ fontSize: '10px', color: 'var(--tw-text-muted)' }}>
                  {selectedPackage?.name || 'Paket Pilihan'} • {tenantName}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--tw-text-muted)' }}>
              <span style={{ fontSize: '11px' }}>{showPersonalization ? 'Tutup' : 'Atur'}</span>
              {showPersonalization ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </div>

          {showPersonalization && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(0, 0, 0, 0.04)',
              }}
            >
              {/* Package selector */}
              {packages.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tw-text-secondary)' }}>
                    Pilih Paket Umroh untuk Auto-Fill (Harga &amp; Fasilitas)
                  </label>
                  <select
                    value={selectedPackageId}
                    onChange={(e) => setSelectedPackageId(e.target.value)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid rgba(0, 0, 0, 0.1)',
                      backgroundColor: 'var(--tw-background)',
                      color: 'var(--tw-text-primary)',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  >
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.price ? new Intl.NumberFormat('id-ID').format(pkg.price) : '-'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Toggle Referral Link */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: 'var(--tw-text-primary)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={includeReferralLink}
                  onChange={(e) => setIncludeReferralLink(e.target.checked)}
                  style={{ accentColor: 'var(--tw-brand-primary)' }}
                />
                <span>Sertakan link pendaftaran referral saya di akhir caption</span>
              </label>
            </div>
          )}
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
            placeholder="Cari tema: orang tua, promo, hotel, ka'bah..."
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

        {/* Funnel Stage Tabs (Horizontal Scroll) */}
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
          {categories.map((cat) => {
            const isActive = activeGoal === cat.key;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveGoal(cat.key)}
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
                <span>{cat.shortName}</span>
                <span
                  style={{
                    fontSize: '10px',
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.06)',
                    color: isActive ? '#FFFFFF' : 'var(--tw-text-muted)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                  }}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>


        {/* Caption Cards List */}
        {filteredCopies.length === 0 ? (
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
              <Quote size={36} />
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
                Tidak Ditemukan Caption
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
                {activeGoal === 'favorites'
                  ? 'Belum ada caption yang ditandai bintang. Tekan ikon bintang pada caption untuk menyimpannya di sini.'
                  : 'Coba ubah kata kunci pencarian atau ganti filter kategori di atas.'}
              </p>
            </div>

            {(searchQuery || activeGoal !== 'attraction') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveGoal('attraction');
                }}
                style={{
                  marginTop: '4px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--tw-brand-primary)',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {displayedCopies.map((copy) => {
              const goalBadge = getGoalBadge(copy.goal);
              const isFav = favorites.includes(copy.id);
              const isJustCopied = copiedId === copy.id && !copiedPart;
              const isPartsExpanded = Boolean(expandedParts[copy.id]);

              return (
                <article
                  key={copy.id}
                  style={{
                    backgroundColor: 'var(--tw-background)',
                    borderRadius: '12px',
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    padding: '14px 15px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: 'var(--tw-card-shadow)',
                  }}
                >
                  {/* Card Header: Badges & Favorite Toggle */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: goalBadge.bg,
                          color: goalBadge.color,
                          border: goalBadge.border,
                        }}
                      >
                        {goalBadge.label}
                      </span>

                      {copy.format && (
                        <span
                          style={{
                            padding: '3px 7px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 600,
                            backgroundColor: 'rgba(0, 0, 0, 0.04)',
                            color: 'var(--tw-text-muted)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {copy.format}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleFavorite(copy.id)}
                      aria-label={isFav ? 'Hapus dari favorit' : 'Tambah ke favorit'}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '4px',
                        cursor: 'pointer',
                        color: isFav ? 'var(--tw-rating-star)' : 'var(--tw-text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Star size={18} fill={isFav ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  {/* Title & Tags */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h3
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: 'var(--tw-text-primary)',
                        margin: 0,
                        fontFamily: 'var(--tw-font-heading)',
                        lineHeight: 1.3,
                      }}
                    >
                      {copy.title}
                    </h3>

                    {copy.tags && copy.tags.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        {copy.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: '10px',
                              color: 'var(--tw-text-muted)',
                              backgroundColor: 'rgba(0, 0, 0, 0.03)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Hook Box */}
                  <div
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 6%, var(--tw-background))',
                      borderRadius: '8px',
                      borderLeft: '3px solid var(--tw-brand-primary)',
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tw-brand-primary)', textTransform: 'uppercase' }}>
                      Hook / Pembuka
                    </span>
                    <p
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--tw-text-primary)',
                        margin: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      &ldquo;{replaceCopyPlaceholders(copy.hook, replacements)}&rdquo;
                    </p>
                  </div>

                  {/* Body Text */}
                  <div style={{ fontSize: '13px', color: 'var(--tw-text-secondary)', lineHeight: 1.5 }}>
                    {replaceCopyPlaceholders(copy.body, replacements)}
                  </div>

                  {/* CTA Text */}
                  <div
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.02)',
                      borderRadius: '6px',
                      padding: '7px 9px',
                      fontSize: '12px',
                      color: 'var(--tw-text-primary)',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '6px',
                    }}
                  >
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tw-text-muted)', textTransform: 'uppercase', flexShrink: 0 }}>
                      CTA:
                    </span>
                    <span>{replaceCopyPlaceholders(copy.cta, replacements)}</span>
                  </div>

                  {/* Expandable Partial Copy Section */}
                  {isPartsExpanded && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '10px',
                        backgroundColor: 'rgba(0, 0, 0, 0.02)',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--tw-text-muted)' }}>Salin Bagian Tertentu:</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleCopyPart(copy.hook, copy.id, 'hook')}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '5px',
                            border: '1px solid rgba(0, 0, 0, 0.08)',
                            backgroundColor: 'var(--tw-background)',
                            color: 'var(--tw-text-primary)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                          }}
                        >
                          {copiedId === copy.id && copiedPart === 'hook' ? <Check size={12} color="var(--tw-income)" /> : <Copy size={12} />}
                          <span>Hook Saja</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyPart(copy.cta, copy.id, 'cta')}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '5px',
                            border: '1px solid rgba(0, 0, 0, 0.08)',
                            backgroundColor: 'var(--tw-background)',
                            color: 'var(--tw-text-primary)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                          }}
                        >
                          {copiedId === copy.id && copiedPart === 'cta' ? <Check size={12} color="var(--tw-income)" /> : <Copy size={12} />}
                          <span>CTA Saja</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Card Bottom Actions */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      paddingTop: '8px',
                      borderTop: '1px solid rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    {/* Salin Lengkap Button */}
                    <button
                      type="button"
                      onClick={() => handleCopyFull(copy)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: isJustCopied
                          ? 'var(--tw-badge-success-bg)'
                          : 'var(--tw-brand-primary)',
                        color: isJustCopied ? 'var(--tw-income)' : '#FFFFFF',
                        border: isJustCopied
                          ? '1px solid color-mix(in srgb, #22c55e 30%, transparent)'
                          : 'none',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isJustCopied ? <Check size={14} /> : <Copy size={14} />}
                      <span>{isJustCopied ? 'Tersalin!' : 'Salin Lengkap'}</span>
                    </button>

                    {/* Share to WA */}
                    <button
                      type="button"
                      onClick={() => handleShareWA(copy)}
                      aria-label="Bagikan ke WhatsApp"
                      title="Bagikan ke WhatsApp"
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--tw-background)',
                        border: '1px solid rgba(0, 0, 0, 0.08)',
                        color: 'var(--tw-text-primary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        flexShrink: 0,
                      }}
                    >
                      <Share2 size={14} color="var(--tw-brand-primary)" />
                      <span>Share WA</span>
                    </button>

                    {/* Toggle Partial Copy Accordion */}
                    <button
                      type="button"
                      onClick={() => toggleExpandParts(copy.id)}
                      aria-label="Opsi salin parsial"
                      title="Salin bagian"
                      style={{
                        padding: '8px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--tw-background)',
                        border: '1px solid rgba(0, 0, 0, 0.08)',
                        color: 'var(--tw-text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isPartsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Infinite Scroll Sentinel & Load Indicator */}
        {totalActiveItemsCount > 0 && (
          <div
            ref={sentinelRef}
            style={{
              marginTop: '12px',
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
                <span>Memuat caption berikutnya ({currentlyDisplayedCount} dari {totalActiveItemsCount})...</span>
              </button>
            ) : totalActiveItemsCount > PAGE_SIZE ? (
              <div
                style={{
                  padding: '12px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color: 'var(--tw-text-muted)',
                }}
              >
                Menampilkan seluruh {totalActiveItemsCount} materi caption
              </div>
            ) : null}
          </div>
        )}
      </div>

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
