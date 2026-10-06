'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, X, Copy, Check, Share2, Star, ChevronDown, Loader2, MoreHorizontal, AlertCircle } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import './BankCaption.css';
import { logHabit } from '../../../lib/agentHabits';
import { copyToClipboard } from '../../../lib/clipboard';
import {
  getAllCopies,
  getCopywritingCategories,
  assembleFullCaption,
  type CopyItem,
  type CopyPlaceholderReplacements,
} from '../../../lib/copywritingData';
import { packageFacts, shownCaptions, shownCaptionCounts, type PackageLike } from '../../../lib/placeholderFill';

const FAVORITES_STORAGE_KEY = 'klikumroh_agent_caption_favorites';

type TenantPackage = PackageLike;


export default function BankCaptionPage() {
  const router = useRouter();

  // Branding & Auth
  const [tenantName, setTenantName] = useState<string>('Travel Umroh');
  const [agentName, setAgentName] = useState<string>('Mitra Agen');
  const [referralLink, setReferralLink] = useState<string>('');
  const [ppiuNumber, setPpiuNumber] = useState<string>('');
  const [tenantAddress, setTenantAddress] = useState<string>('');

  // Packages & Personalization
  const [packages, setPackages] = useState<TenantPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [includeReferralLink, setIncludeReferralLink] = useState<boolean>(true);

  // Filters & State
  const [activeGoal, setActiveGoal] = useState<string>('attraction'); // 'attraction', 'education', etc. or 'favorites'
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedPart, setCopiedPart] = useState<string | null>(null);
  // Caption whose copy the browser refused (in-app browsers): show how to copy by hand.
  const [copyFailedId, setCopyFailedId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  const allCopies = useMemo(() => getAllCopies(), []);
  const categories = useMemo(() => getCopywritingCategories(), []);

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the browser after hydration; not available on the server render
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

    // Travel license number and address for the trust captions (only when the travel filled them in).
    const fetchTenantInfo = async () => {
      try {
        const res = await fetch('/api/public/tenant-info');
        if (res.ok) {
          const info = await res.json();
          if (typeof info.ppiu_number === 'string') setPpiuNumber(info.ppiu_number.trim());
          if (typeof info.address === 'string') setTenantAddress(info.address.trim());
        }
      } catch {
        // Soft fail: captions needing these values stay hidden
      }
    };

    fetchProfile();
    fetchPublicPackages();
    fetchTenantInfo();
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

  // Replacements builder: real data only. A caption whose opening needs a missing value is hidden,
  // other sentences with a missing value are dropped (lib/placeholderFill).
  const replacements: CopyPlaceholderReplacements = useMemo(
    () => ({
      ...packageFacts(selectedPackage),
      travel: tenantName,
      agent_name: agentName,
      nomor_izin: ppiuNumber,
      alamat: tenantAddress,
      link: includeReferralLink ? referralLink : '',
    }),
    [tenantName, agentName, ppiuNumber, tenantAddress, selectedPackage, includeReferralLink, referralLink]
  );

  // Every caption that can be shown for the selected package and matches the search. The list of the
  // active category and the numbers on the chips both come from this one list, so they always agree.
  const shown = useMemo(() => shownCaptions(allCopies, replacements, searchQuery), [allCopies, replacements, searchQuery]);
  const shownCounts = useMemo(() => shownCaptionCounts(shown, favorites), [shown, favorites]);

  // Copies of the active category (or the saved ones)
  const filteredCopies = useMemo(() => {
    if (activeGoal === 'favorites') return shown.filter(({ copy }) => favorites.includes(copy.id));
    return shown.filter(({ copy }) => copy.goal === activeGoal);
  }, [shown, activeGoal, favorites]);

  // Infinite scroll pagination state (8 items per load)
  const PAGE_SIZE = 8;
  // The visible count belongs to one category + search; a new one starts again at PAGE_SIZE (same as Script chat).
  const pageKey = `${activeGoal}|${searchQuery}`;
  const [paging, setPaging] = useState({ key: pageKey, count: PAGE_SIZE });
  const visibleCount = paging.key === pageKey ? paging.count : PAGE_SIZE;

  // Paginated copies
  const displayedCopies = useMemo(() => {
    return filteredCopies.slice(0, visibleCount);
  }, [filteredCopies, visibleCount]);

  const totalActiveItemsCount = filteredCopies.length;
  const currentlyDisplayedCount = displayedCopies.length;
  const hasMore = currentlyDisplayedCount < totalActiveItemsCount;

  const loadMore = useCallback(() => {
    setPaging({ key: pageKey, count: Math.min(visibleCount + PAGE_SIZE, totalActiveItemsCount) });
  }, [pageKey, visibleCount, totalActiveItemsCount]);

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
    if (text === null) return;
    // copyToClipboard falls back to execCommand for in-app browsers; the habit counts only a real copy.
    if (!(await copyToClipboard(text))) {
      setCopyFailedId(copy.id);
      return;
    }
    setCopyFailedId(null);
    logHabit('caption');
    setCopiedId(copy.id);
    setCopiedPart(null);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyPart = async (text: string, copyId: string, partName: string) => {
    if (!text) return;
    if (!(await copyToClipboard(text))) {
      setCopyFailedId(copyId);
      return;
    }
    setCopyFailedId(null);
    logHabit('caption');
    setCopiedId(copyId);
    setCopiedPart(partName);
    setTimeout(() => {
      setCopiedId(null);
      setCopiedPart(null);
    }, 2000);
  };

  // WhatsApp share
  const handleShareWA = (copy: CopyItem) => {
    const text = assembleFullCaption(copy, replacements);
    if (text === null) return;
    logHabit('caption');
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  // "Salin sebagian" menu open for one card at a time.
  const [partsOpenId, setPartsOpenId] = useState<string | null>(null);
  // Package / link settings sheet.
  const [sheetOpen, setSheetOpen] = useState<boolean>(false);
  const formatPrice = (v?: number) => (v ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v) : '');

  const chips = [
    ...categories.map((c) => ({ id: c.key, label: c.shortName, count: shownCounts.byGoal[c.key] || 0 })),
    { id: 'favorites', label: 'Tersimpan', count: shownCounts.favorites },
  ];

  return (
    <MobileContainer>
      {/* Drill-down page (opened from the home menu): back button, no bottom tab bar. */}
      <header className="bc-header">
        <button type="button" onClick={() => router.back()} aria-label="Kembali" className="bc-icon-btn bc-icon-btn--lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="bc-header__title">Bank caption</h1>
      </header>

      <div className="bc-page">
        {/* Package and link used in the captions: one row, opens a sheet. */}
        <button type="button" className="bc-target" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          <span className="bc-target__text">
            <span className="bc-target__label">Paket di caption</span>
            <span className="bc-target__name">{selectedPackage?.name || 'Pilih paket'}</span>
            <span className="bc-target__meta">{includeReferralLink ? 'Link pendaftaran Anda ikut di akhir caption' : 'Tanpa link pendaftaran'}</span>
          </span>
          <ChevronDown size={20} className="bc-target__chev" aria-hidden="true" />
        </button>

        {/* Search */}
        <div className="bc-search">
          <Search size={18} className="bc-search__icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="Cari caption"
            placeholder="Cari tema: orang tua, promo, hotel"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="tw-field bc-search__input"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="bc-search__clear" aria-label="Hapus pencarian">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Category chips (brand fill for the active one) */}
        <div className="bc-chips" role="tablist" aria-label="Kategori caption">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={activeGoal === c.id}
              onClick={() => setActiveGoal(c.id)}
              className={`bc-chip${activeGoal === c.id ? ' bc-chip--active' : ''}`}
            >
              {c.label}
              <span className="bc-chip__count">{c.count}</span>
            </button>
          ))}
        </div>

        {/* Caption cards */}
        <div className="bc-list">
          {displayedCopies.map(({ copy, parts }) => {
            const isFav = favorites.includes(copy.id);
            const fullCopied = copiedId === copy.id && !copiedPart;
            const partsOpen = partsOpenId === copy.id;
            const meta = [...(copy.tags || []).map((t) => `#${t}`), copy.format ? copy.format.charAt(0).toUpperCase() + copy.format.slice(1) : '']
              .filter(Boolean)
              .join(' · ');
            return (
              <article key={copy.id} className="bc-card">
                <div className="bc-card__head">
                  <div className="bc-card__titles">
                    <h2 className="bc-card__title">{copy.title}</h2>
                    {meta && <p className="bc-muted">{meta}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPartsOpenId(partsOpen ? null : copy.id)}
                    aria-expanded={partsOpen}
                    aria-label="Salin sebagian"
                    className={`bc-icon-btn${partsOpen ? ' bc-icon-btn--on' : ''}`}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(copy.id)}
                    aria-label={isFav ? 'Hapus dari tersimpan' : 'Simpan caption'}
                    aria-pressed={isFav}
                    className={`bc-icon-btn${isFav ? ' bc-icon-btn--fav' : ''}`}
                  >
                    <Star size={18} fill={isFav ? 'currentColor' : 'none'} />
                  </button>
                </div>

                {partsOpen && (
                  <div className="bc-parts" role="group" aria-label="Salin sebagian">
                    <span className="bc-muted">Salin:</span>
                    {([
                      ['hook', 'Pembuka', parts.hook],
                      ['body', 'Isi', parts.body],
                      ['cta', 'Ajakan', parts.cta],
                    ] as const).filter(([, , text]) => Boolean(text)).map(([key, label, text]) => (
                      <button key={key} type="button" className="bc-part" onClick={() => handleCopyPart(text, copy.id, key)}>
                        {copiedId === copy.id && copiedPart === key ? <Check size={14} aria-hidden="true" /> : null}
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {/* The caption as it will be copied: opener in bold, then body and call to action. */}
                <div className="bc-text">
                  <strong>{parts.hook}</strong>
                  {parts.body && `\n\n${parts.body}`}
                  {parts.cta && `\n\n${parts.cta}`}
                  {/* The link block is long; the preview only notes it (the copied text includes it in full). */}
                  {replacements.link && <span className="bc-text__link">{'\n\n+ link pendaftaran Anda'}</span>}
                </div>

                <div className="bc-card__actions">
                  <button type="button" onClick={() => handleCopyFull(copy)} className={`bc-btn${fullCopied ? ' bc-btn--done' : ''}`}>
                    {fullCopied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                    <span>{fullCopied ? 'Tersalin' : 'Salin'}</span>
                  </button>
                  <button type="button" onClick={() => handleShareWA(copy)} className="bc-btn bc-btn--primary">
                    <Share2 size={16} aria-hidden="true" />
                    <span>Kirim ke WA</span>
                  </button>
                </div>
                {copyFailedId === copy.id && (
                  <p className="bc-copy-failed" role="alert">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>Browser ini menolak menyalin otomatis. Pakai &quot;Kirim ke WA&quot;, atau tekan lama teks caption di atas untuk menyalin manual.</span>
                  </p>
                )}
              </article>
            );
          })}
        </div>

        {/* Load more */}
        {totalActiveItemsCount > 0 && (
          <div ref={sentinelRef} className="bc-more">
            {hasMore ? (
              <button type="button" onClick={loadMore} className="bc-btn">
                <Loader2 size={16} className="bc-spin" aria-hidden="true" />
                <span>
                  Memuat caption ({currentlyDisplayedCount} dari {totalActiveItemsCount})
                </span>
              </button>
            ) : totalActiveItemsCount > PAGE_SIZE ? (
              <p className="bc-muted">Semua {totalActiveItemsCount} caption sudah tampil</p>
            ) : null}
          </div>
        )}

        {/* Empty */}
        {totalActiveItemsCount === 0 && (
          <div className="bc-empty">
            <Star size={28} aria-hidden="true" />
            <h2 className="bc-card__title">{activeGoal === 'favorites' && !searchQuery && favorites.length === 0 ? 'Belum ada caption tersimpan' : 'Tidak ada caption'}</h2>
            <p className="bc-muted">
              {searchQuery.trim()
                ? `Tidak ada caption yang cocok dengan "${searchQuery}".`
                : activeGoal === 'favorites' && favorites.length === 0
                ? 'Ketuk ikon bintang di kartu caption untuk menyimpannya di sini.'
                : 'Data paket yang dipilih belum cukup untuk caption di sini. Coba pilih paket lain.'}
            </p>
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="bc-btn">
                Hapus pencarian
              </button>
            )}
          </div>
        )}
      </div>

      {/* Package and link sheet */}
      {sheetOpen && (
        <div className="bc-sheet" role="presentation" onClick={() => setSheetOpen(false)}>
          <div className="bc-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="bc-sheet-title" onClick={(e) => e.stopPropagation()}>
            <span className="bc-sheet__grip" aria-hidden="true" />
            <div className="bc-sheet__head">
              <h2 id="bc-sheet-title" className="bc-card__title">
                Paket di caption
              </h2>
              <button type="button" className="bc-icon-btn" onClick={() => setSheetOpen(false)} aria-label="Tutup">
                <X size={20} />
              </button>
            </div>
            <p className="bc-muted">Nama paket, harga, hotel, dan maskapai di caption diambil dari paket ini.</p>
            {packages.length === 0 ? (
              <p className="bc-muted">Belum ada paket yang tayang.</p>
            ) : (
              <ul className="bc-picks">
                {packages.map((pkg) => (
                  <li key={pkg.id}>
                    <button
                      type="button"
                      className={`bc-pick${String(pkg.id) === selectedPackageId ? ' bc-pick--on' : ''}`}
                      onClick={() => setSelectedPackageId(String(pkg.id))}
                    >
                      {/* Check on the left of the name; every row keeps the slot so names stay aligned. */}
                      <span className="bc-pick__check" aria-hidden="true">
                        {String(pkg.id) === selectedPackageId && <Check size={18} />}
                      </span>
                      <span className="bc-pick__name">{pkg.name}</span>
                      {pkg.price ? <span className="bc-muted">{formatPrice(pkg.price)}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="bc-switch">
              <input type="checkbox" checked={includeReferralLink} onChange={(e) => setIncludeReferralLink(e.target.checked)} />
              <span>Sertakan link pendaftaran saya di akhir caption</span>
            </label>
            <button type="button" className="bc-btn bc-btn--primary" onClick={() => setSheetOpen(false)}>
              Selesai
            </button>
          </div>
        </div>
      )}
    </MobileContainer>
  );
}
