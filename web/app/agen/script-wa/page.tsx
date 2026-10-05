'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search, X, Copy, Check, Share2, Star, MessageSquare, Lightbulb, ChevronDown, ChevronUp, Compass, Loader2 } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import './ScriptWA.css';
import { logHabit } from '../../../lib/agentHabits';
import {
  replacePlaceholders,
  getCycleStages,
  getGreetingScripts,
  getIdentificationScripts,
  getOfferScripts,
  getClosingScripts,
  getObjectionScripts,
  getFollowupScripts,
  type StandardScriptItem,
  type ObjectionTGJPItem,
  type CycleStage,
  type PlaceholderReplacements,
} from '../../../lib/scriptData';
import { matchesQuery, packageFacts, type PackageLike } from '../../../lib/placeholderFill';

const FAVORITES_STORAGE_KEY = 'klikumroh_agent_script_favorites';
const PROSPECT_NAME_STORAGE_KEY = 'klikumroh_agent_script_prospect_name';

type TabType = 'greeting' | 'identification' | 'offer' | 'closing' | 'objection' | 'followup' | 'favorites';
type PersonalizationMode = 'prospect' | 'manual';

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

function ScriptWAContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProspectId = searchParams.get('prospect_id');

  // Branding & Auth
  const [agentName, setAgentName] = useState<string>('Mitra Agen');
  const [tenantName, setTenantName] = useState<string>('Travel Umroh');
  const [referralLink, setReferralLink] = useState<string>('');

  // Prospects state
  const [prospectList, setProspectList] = useState<AgentProspectItem[]>([]);
  const [loadingProspects, setLoadingProspects] = useState<boolean>(true);
  const [personalizationMode, setPersonalizationMode] = useState<PersonalizationMode>('prospect');
  const [selectedProspectId, setSelectedProspectId] = useState<number | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<AgentProspectItem | null>(null);

  // Form values for script placeholders
  const [prospectName, setProspectName] = useState<string>('');
  const [prospectPhone, setProspectPhone] = useState<string>('');
  const [prospectPackageName, setProspectPackageName] = useState<string>('');
  // Published packages of this travel: the source of the package facts in the scripts (price, date, seats...).
  const [packages, setPackages] = useState<PackageLike[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('greeting');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [expandedObjections, setExpandedObjections] = useState<Record<string, boolean>>({});

  // Helper: Get smart tab recommendation from prospect status
  const getRecommendedTab = (status: string): TabType => {
    switch (status) {
      case 'baru':
        return 'greeting';
      case 'dihubungi':
        return 'identification';
      case 'tertarik':
        return 'closing';
      case 'closing':
        return 'closing';
      case 'tidak_lanjut':
        return 'followup';
      default:
        return 'greeting';
    }
  };

  // Helper: Get recommendation label
  const getRecommendationTip = (status: string): string => {
    switch (status) {
      case 'baru':
        return 'Status Baru: Awali dengan sapaan hangat dan perkenalkan diri sebagai konsultan umroh resmi agar calon jamaah merasa nyaman.';
      case 'dihubungi':
        return 'Status Dihubungi: Dampingi dan gali kebutuhan ibadah (jadwal, keluarga & budget) sebelum memberikan rekomendasi paket.';
      case 'tertarik':
        return 'Status Tertarik: Berikan kepastian seat dan ajak amankan kuota pendaftaran melalui DP resmi ke rekening travel.';
      case 'closing':
        return 'Status Closing: Dampingi pengumpulan berkas dan konfirmasi pelunasan/administrasi jamaah ke tim travel.';
      case 'tidak_lanjut':
        return 'Status Tidak Lanjut: Gunakan script Follow-up untuk menjaga silaturahmi dan hubungan baik tanpa memaksa.';
      default:
        return 'Pilih script yang paling sesuai dengan percakapan terakhir Anda bersama calon jamaah.';
    }
  };

  // Handler: Select a prospect
  const handleSelectProspect = (id: number, list = prospectList) => {
    const target = list.find((p) => p.id === id);
    if (!target) return;

    setSelectedProspectId(target.id);
    setSelectedProspect(target);
    setProspectName(target.name);
    setProspectPhone(target.phone);
    setProspectPackageName(target.package_name || '');

    // Recommend and switch tab automatically
    const recommended = getRecommendedTab(target.status);
    setActiveTab(recommended);
  };

  // Handler: Clear prospect selection
  const handleClearProspect = () => {
    setSelectedProspectId(null);
    setSelectedProspect(null);
    setProspectName('');
    setProspectPhone('');
    setProspectPackageName('');
  };

  // Load user data and saved state
  useEffect(() => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    // 0. Instant hydration from localStorage
    try {
      const savedTenant = localStorage.getItem('klikumroh_agent_tenant_name');
      if (savedTenant && savedTenant.trim() !== '' && savedTenant.trim() !== 'Travel Umroh') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the browser after hydration; not available on the server render
        setTenantName(savedTenant.trim());
      }
      const savedAgent = localStorage.getItem('klikumroh_agent_name');
      if (savedAgent && savedAgent.trim() !== '' && savedAgent.trim() !== 'Mitra Agen') {
        setAgentName(savedAgent.trim());
      }
    } catch {}

    const updateTenantName = (name: string) => {
      if (name && name.trim() !== '' && name.trim() !== 'Travel Umroh') {
        setTenantName(name.trim());
        try {
          localStorage.setItem('klikumroh_agent_tenant_name', name.trim());
        } catch {}
      }
    };

    const updateAgentName = (name: string) => {
      if (name && name.trim() !== '' && name.trim() !== 'Mitra Agen') {
        setAgentName(name.trim());
        try {
          localStorage.setItem('klikumroh_agent_name', name.trim());
        } catch {}
      }
    };

    const fetchTenantPublicInfo = async () => {
      try {
        const res = await fetch('/api/public/tenant-info');
        if (res.ok) {
          const tInfo = await res.json();
          if (tInfo.name) {
            updateTenantName(tInfo.name);
          }
        }
      } catch {
        // Fallback
      }
    };

    const fetchAgentInfo = async () => {
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
          const agent = data.agent || data.data?.agent || data;
          const tenant = data.tenant || data.data?.tenant || {};
          if (agent.name) updateAgentName(agent.name);

          const resolvedTenantName = data.tenant_name || agent.tenant_name || tenant.name;
          if (resolvedTenantName) {
            updateTenantName(resolvedTenantName);
          }

          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const refLink = agent.referral_code ? `${origin}/ref/${agent.referral_code}` : '';
          setReferralLink(refLink);
        }

        // Secondary fallback to dashboard-summary if tenant_name is still not found
        try {
          const sumRes = await fetch('/api/agent/dashboard-summary', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (sumRes.ok) {
            const sumData = await sumRes.json();
            const sumTenant = sumData.tenant_name || sumData.data?.tenant_name;
            if (sumTenant) {
              updateTenantName(sumTenant);
            }
          }
        } catch {}
      } catch {
        // Fallback to default
      }
    };

    const fetchPackages = async () => {
      try {
        const res = await fetch('/api/public/packages');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setPackages(data as PackageLike[]);
        }
      } catch {
        // Soft fail: scripts that need package facts stay hidden
      }
    };

    const fetchProspects = async () => {
      try {
        setLoadingProspects(true);
        const res = await fetch('/api/agent/jamaah', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // A jamaah whose personal data was removed (UU PDP) has no number: nothing to chat with.
          const list: AgentProspectItem[] = (Array.isArray(data) ? data : []).filter(
            (p: AgentProspectItem) => Boolean(p.phone && p.phone.trim())
          );
          setProspectList(list);

          // If query param ?prospect_id=... is given, auto-select
          if (initialProspectId) {
            const pid = Number(initialProspectId);
            const found = list.find((p) => p.id === pid);
            if (found) {
              setPersonalizationMode('prospect');
              handleSelectProspect(found.id, list);
              return;
            }
          }

          // If no query param but list is empty, default to manual
          if (list.length === 0) {
            setPersonalizationMode('manual');
          }
        }
      } catch {
        // Fallback
      } finally {
        setLoadingProspects(false);
      }
    };

    fetchTenantPublicInfo();
    fetchAgentInfo();
    fetchProspects();
    fetchPackages();

    try {
      const savedFavs = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (savedFavs) {
        const parsed = JSON.parse(savedFavs);
        if (Array.isArray(parsed)) setFavoriteKeys(parsed);
      }
      const savedName = localStorage.getItem(PROSPECT_NAME_STORAGE_KEY);
      if (savedName && !initialProspectId) setProspectName(savedName);
    } catch {
      // Ignore storage error
    }
    // Runs once per prospect from the URL; handleSelectProspect is a plain function recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, initialProspectId]);

  // Persist prospect name in manual mode
  const handleManualNameChange = (val: string) => {
    setProspectName(val);
    try {
      localStorage.setItem(PROSPECT_NAME_STORAGE_KEY, val);
    } catch {
      // Ignore storage error
    }
  };

  // Toggle favorite
  const toggleFavorite = (key: string) => {
    setFavoriteKeys((prev) => {
      const exists = prev.includes(key);
      const next = exists ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  // Toggle objection accordion (default collapsed)
  const toggleObjectionExpand = (id: string) => {
    setExpandedObjections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Copy handler
  const handleCopyText = (text: string, key: string) => {
    // Logged first: the habit counts the intent, even if the browser refuses the clipboard.
    logHabit('contact');
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Direct WA handler
  const handleOpenWhatsApp = (text: string) => {
    logHabit('contact');
    const cleanPhone = prospectPhone.replace(/[^0-9]/g, '');
    let url = '';
    if (cleanPhone) {
      const formatted = cleanPhone.startsWith('0')
        ? `62${cleanPhone.slice(1)}`
        : cleanPhone.startsWith('62')
        ? cleanPhone
        : `62${cleanPhone}`;
      url = `https://wa.me/${formatted}?text=${encodeURIComponent(text)}`;
    } else {
      url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    }
    window.open(url, '_blank');
  };

  // Replacement values: real data only. A script whose opening needs a missing value is hidden, other
  // sentences with a missing value are dropped (lib/placeholderFill). Package facts come from the selected
  // jamaah's package; manual mode has no package, so those scripts are hidden there.
  const prospectPackage = useMemo(() => {
    if (!selectedProspect?.package_id) return null;
    return packages.find((pkg) => pkg.id === selectedProspect.package_id) || null;
  }, [packages, selectedProspect]);

  const replacements: PlaceholderReplacements = useMemo(
    () => ({
      ...packageFacts(prospectPackage),
      // The jamaah's own package name is real data even when the package is no longer published.
      paket: prospectPackage?.name || prospectPackageName.trim(),
      nama: prospectName.trim(),
      travel: tenantName,
      agent_name: agentName,
      referral_link: referralLink,
      jumlah_jamaah: selectedProspect && selectedProspect.jumlah_jamaah > 0 ? String(selectedProspect.jumlah_jamaah) : '',
    }),
    [prospectPackage, prospectPackageName, prospectName, tenantName, agentName, referralLink, selectedProspect]
  );

  // Only the scripts that can be filled for the current jamaah are listed.
  const canShow = useCallback((text: string) => replacePlaceholders(text, replacements) !== null, [replacements]);

  // Raw datasets
  const stages = useMemo<CycleStage[]>(() => getCycleStages(), []);
  const greetings = useMemo<StandardScriptItem[]>(() => getGreetingScripts().filter((item) => canShow(item.script)), [canShow]);
  const identifications = useMemo<StandardScriptItem[]>(() => getIdentificationScripts().filter((item) => canShow(item.script)), [canShow]);
  const offers = useMemo<StandardScriptItem[]>(() => getOfferScripts().filter((item) => canShow(item.script)), [canShow]);
  const closings = useMemo<StandardScriptItem[]>(() => getClosingScripts().filter((item) => canShow(item.script)), [canShow]);
  const objections = useMemo<ObjectionTGJPItem[]>(() => getObjectionScripts(), []);
  const followups = useMemo<StandardScriptItem[]>(() => getFollowupScripts().filter((item) => canShow(item.script)), [canShow]);

  // Stage Metadata Mapping
  const activeStageInfo = useMemo(() => {
    return stages.find((s) => s.id === activeTab) || null;
  }, [stages, activeTab]);

  // Scripts per phase after the search. The tab numbers and the lists both come from these, so a tab
  // count is always the number of scripts that tab shows (hidden scripts and search misses excluded).
  const searched = useMemo(() => {
    const standard = (list: StandardScriptItem[]) =>
      list.filter((item) => matchesQuery(searchQuery, [item.title, item.script, item.use_when, item.tags]));
    return {
      greeting: standard(greetings),
      identification: standard(identifications),
      offer: standard(offers),
      closing: standard(closings),
      followup: standard(followups),
      objection: objections.filter((item) =>
        matchesQuery(searchQuery, [item.title, item.category, item.prospect_examples, (item.tgjp.jawab || []).map((j) => j.script)])
      ),
    };
  }, [searchQuery, greetings, identifications, offers, closings, followups, objections]);

  // Saved scripts that are shown: a saved script hidden for this jamaah (missing data) is not counted.
  const favoriteStandard = useMemo(
    () =>
      [...searched.greeting, ...searched.identification, ...searched.offer, ...searched.closing, ...searched.followup].filter((item) =>
        favoriteKeys.includes(item.id)
      ),
    [searched, favoriteKeys]
  );
  const favoriteObjections = useMemo(() => searched.objection.filter((item) => favoriteKeys.includes(item.id)), [searched, favoriteKeys]);

  // Tab definitions
  const tabs: Array<{ id: TabType; label: string; count: number }> = useMemo(
    () => [
      { id: 'greeting', label: '1. Sapaan', count: searched.greeting.length },
      { id: 'identification', label: '2. Gali Minat', count: searched.identification.length },
      { id: 'offer', label: '3. Penawaran', count: searched.offer.length },
      { id: 'closing', label: '4. Closing', count: searched.closing.length },
      { id: 'objection', label: '5. Hadapi Ragu', count: searched.objection.length },
      { id: 'followup', label: '6. Follow-up', count: searched.followup.length },
      { id: 'favorites', label: 'Tersimpan', count: favoriteStandard.length + favoriteObjections.length },
    ],
    [searched, favoriteStandard, favoriteObjections]
  );

  // Filtered standard scripts
  const filteredStandardScripts = useMemo<StandardScriptItem[]>(() => {
    if (activeTab === 'favorites') return favoriteStandard;
    if (activeTab === 'objection') return [];
    return searched[activeTab];
  }, [activeTab, searched, favoriteStandard]);

  // Filtered objection scripts
  const filteredObjections = useMemo<ObjectionTGJPItem[]>(() => {
    if (activeTab === 'objection') return searched.objection;
    if (activeTab === 'favorites') return favoriteObjections;
    return [];
  }, [activeTab, searched, favoriteObjections]);

  // Infinite scroll pagination state (8 items per load)
  const PAGE_SIZE = 8;
  // Pagination resets on tab or search query change: the count belongs to the filter it was loaded for.
  const pageKey = `${activeTab}|${searchQuery}`;
  const [paging, setPaging] = useState({ key: pageKey, count: PAGE_SIZE });
  const visibleCount = paging.key === pageKey ? paging.count : PAGE_SIZE;

  // Paginated standard scripts
  const displayedStandardScripts = useMemo(() => {
    return filteredStandardScripts.slice(0, visibleCount);
  }, [filteredStandardScripts, visibleCount]);

  // Paginated objection scripts
  const displayedObjections = useMemo(() => {
    return filteredObjections.slice(0, visibleCount);
  }, [filteredObjections, visibleCount]);

  // Total items calculation for current active tab
  const totalActiveItemsCount = useMemo(() => {
    if (activeTab === 'objection') return filteredObjections.length;
    if (activeTab === 'favorites') return filteredStandardScripts.length + filteredObjections.length;
    return filteredStandardScripts.length;
  }, [activeTab, filteredStandardScripts.length, filteredObjections.length]);

  const currentlyDisplayedCount = useMemo(() => {
    if (activeTab === 'objection') return displayedObjections.length;
    if (activeTab === 'favorites') return displayedStandardScripts.length + displayedObjections.length;
    return displayedStandardScripts.length;
  }, [activeTab, displayedStandardScripts.length, displayedObjections.length]);

  const hasMore = currentlyDisplayedCount < totalActiveItemsCount;

  const loadMore = useCallback(() => {
    setPaging((p) => {
      const prev = p.key === pageKey ? p.count : PAGE_SIZE;
      if (prev >= totalActiveItemsCount) return p;
      return { key: pageKey, count: Math.min(prev + PAGE_SIZE, totalActiveItemsCount) };
    });
  }, [totalActiveItemsCount, pageKey]);

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

  // Recipient sheet: pick a jamaah (searchable) or type a name by hand.
  const [sheetOpen, setSheetOpen] = useState<boolean>(false);
  const [sheetQuery, setSheetQuery] = useState<string>('');
  const sheetResults = useMemo(() => {
    const q = sheetQuery.trim().toLowerCase();
    if (!q) return prospectList;
    return prospectList.filter((p) => p.name.toLowerCase().includes(q) || p.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || q));
  }, [prospectList, sheetQuery]);
  const pickProspect = (id: number) => {
    setPersonalizationMode('prospect');
    handleSelectProspect(id);
    setSheetOpen(false);
    setSheetQuery('');
  };

  // One-line tab copy for every script list item.
  const renderCopyButton = (text: string, key: string, label = 'Salin') => {
    const isCopied = copiedKey === key;
    return (
      <button type="button" onClick={() => handleCopyText(text, key)} className={`sw-icon-btn${isCopied ? ' sw-icon-btn--done' : ''}`} aria-label={label}>
        {isCopied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    );
  };

  const TGJP_STEPS = [
    { key: 'terima', label: '1. Terima: empati dan validasi', tone: 'brand' },
    { key: 'gali', label: '2. Gali: temukan akar masalah', tone: 'star' },
    { key: 'jawab', label: '3. Jawab: pilih solusi yang pas', tone: 'muted' },
    { key: 'pastikan', label: '4. Pastikan: konfirmasi dan arahkan kembali', tone: 'brand' },
  ] as const;

  return (
    <MobileContainer>
      {/* Drill-down page (opened from the home menu): back button, no bottom tab bar. */}
      <header className="sw-header">
        <button type="button" onClick={() => router.back()} aria-label="Kembali" className="sw-icon-btn sw-icon-btn--lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="sw-header__title">Script chat</h1>
      </header>

      <div className="sw-page">
        {/* Recipient: one compact row; opens the picker sheet. */}
        <button type="button" className="sw-target" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          <span className="sw-target__text">
            <span className="sw-target__label">Untuk</span>
            <span className="sw-target__name">{prospectName.trim() || 'Pilih calon jamaah'}</span>
            {selectedProspect ? (
              <span className="sw-target__meta">
                <span className={`sw-status sw-status--${selectedProspect.status}`}>{STATUS_LABELS[selectedProspect.status] || selectedProspect.status}</span>
                {' · '}
                {selectedProspect.package_name || 'Belum pilih paket'}
              </span>
            ) : (
              <span className="sw-target__meta">Opsional, untuk menyapa nama di pesan</span>
            )}
          </span>
          <ChevronDown size={20} className="sw-target__chev" aria-hidden="true" />
        </button>

        {selectedProspect && (
          <p className="sw-tip">
            <span>{getRecommendationTip(selectedProspect.status)}</span>{' '}
            <button type="button" className="sw-link" onClick={() => setActiveTab(getRecommendedTab(selectedProspect.status))}>
              Buka script yang disarankan
            </button>
            {' · '}
            <Link href={`/agen/jamaah/${selectedProspect.id}`} className="sw-link">
              Detail jamaah
            </Link>
          </p>
        )}

        {/* Search */}
        <div className="sw-search">
          <Search size={18} className="sw-search__icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="Cari script"
            placeholder="Cari script (mahal, halo, dp, lansia)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="tw-field sw-search__input"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="sw-search__clear" aria-label="Hapus pencarian">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Phase tabs */}
        <div className="sw-chips" role="tablist" aria-label="Fase percakapan">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`sw-chip${activeTab === tab.id ? ' sw-chip--active' : ''}`}
            >
              {tab.label}
              <span className="sw-chip__count">{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Phase goal in one line */}
        {activeStageInfo && activeTab !== 'favorites' && (
          <p className="sw-goal">
            <Lightbulb size={16} className="sw-goal__icon" aria-hidden="true" />
            <span>{activeStageInfo.tujuan}</span>
          </p>
        )}

        {/* Standard scripts */}
        {activeTab !== 'objection' && (
          <div className="sw-list">
            {displayedStandardScripts.map((item) => {
              // The list only holds scripts that can be filled (canShow), so null cannot reach here.
              const personalizedText = replacePlaceholders(item.script, replacements) ?? '';
              const isFav = favoriteKeys.includes(item.id);
              const isCopied = copiedKey === item.id;
              return (
                <article key={item.id} className="sw-card">
                  <div className="sw-card__head">
                    <div className="sw-card__titles">
                      <h2 className="sw-card__title">{item.title}</h2>
                      {item.use_when && <p className="sw-muted">{item.use_when}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(item.id)}
                      aria-label={isFav ? 'Hapus dari tersimpan' : 'Simpan script'}
                      aria-pressed={isFav}
                      className={`sw-icon-btn${isFav ? ' sw-icon-btn--fav' : ''}`}
                    >
                      <Star size={18} fill={isFav ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  {item.prospect_example && (
                    <p className="sw-example">
                      <strong>Pesan jamaah:</strong> &quot;{item.prospect_example}&quot;
                    </p>
                  )}

                  <div className="sw-script">{personalizedText}</div>

                  <div className="sw-card__actions">
                    <button type="button" onClick={() => handleCopyText(personalizedText, item.id)} className={`sw-btn${isCopied ? ' sw-btn--done' : ''}`}>
                      {isCopied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                      <span>{isCopied ? 'Tersalin' : 'Salin pesan'}</span>
                    </button>
                    <button type="button" onClick={() => handleOpenWhatsApp(personalizedText)} className="sw-btn sw-btn--primary">
                      <Share2 size={16} aria-hidden="true" />
                      <span>Kirim ke WA</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Objection scripts: TGJP steps, collapsed by default */}
        {(activeTab === 'objection' || (activeTab === 'favorites' && displayedObjections.length > 0)) && (
          <div className="sw-list">
            {activeTab === 'objection' && (
              <p className="sw-goal">
                <Compass size={16} className="sw-goal__icon" aria-hidden="true" />
                <span>
                  4 langkah TGJP: <strong>Terima, Gali, Jawab, Pastikan</strong>
                </span>
              </p>
            )}

            {displayedObjections.map((obj) => {
              const isFav = favoriteKeys.includes(obj.id);
              const isExpanded = Boolean(expandedObjections[obj.id]);
              return (
                <article key={obj.id} className={`sw-card${isExpanded ? ' sw-card--open' : ''}`}>
                  <div className="sw-card__head">
                    <button type="button" className="sw-card__toggle" onClick={() => toggleObjectionExpand(obj.id)} aria-expanded={isExpanded}>
                      <span className="sw-card__title">{obj.title}</span>
                      {obj.prospect_examples && obj.prospect_examples.length > 0 && (
                        <span className="sw-muted">Sering muncul: &quot;{obj.prospect_examples[0]}&quot;</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(obj.id)}
                      aria-label={isFav ? 'Hapus dari tersimpan' : 'Simpan script'}
                      aria-pressed={isFav}
                      className={`sw-icon-btn${isFav ? ' sw-icon-btn--fav' : ''}`}
                    >
                      <Star size={18} fill={isFav ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleObjectionExpand(obj.id)}
                      aria-label={isExpanded ? 'Tutup langkah' : 'Buka langkah'}
                      className="sw-icon-btn"
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="sw-steps">
                      {TGJP_STEPS.map((step) => (
                        <section key={step.key} className={`sw-step sw-step--${step.tone}`}>
                          <h3 className="sw-step__label">{step.label}</h3>
                          {step.key === 'jawab'
                            ? obj.tgjp.jawab.map((jItem, idx) => {
                                const text = replacePlaceholders(jItem.script, replacements);
                                const key = `${obj.id}_jawab_${idx}`;
                                if (text === null) return null;
                                return (
                                  <div key={key} className="sw-answer">
                                    <div className="sw-answer__head">
                                      <span className="sw-answer__reason">{jItem.reason.replace(/_/g, ' ')}</span>
                                      {renderCopyButton(text, key, 'Salin jawaban ini')}
                                    </div>
                                    <p className="sw-step__text">{text}</p>
                                  </div>
                                );
                              })
                            : obj.tgjp[step.key].map((line, idx) => {
                                const text = replacePlaceholders(line, replacements);
                                const key = `${obj.id}_${step.key}_${idx}`;
                                if (text === null) return null;
                                return (
                                  <div key={key} className="sw-step__row">
                                    <p className="sw-step__text">{text}</p>
                                    {renderCopyButton(text, key)}
                                  </div>
                                );
                              })}
                        </section>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {totalActiveItemsCount > 0 && (
          <div ref={sentinelRef} className="sw-more">
            {hasMore ? (
              <button type="button" onClick={loadMore} className="sw-btn">
                <Loader2 size={16} className="sw-spin" aria-hidden="true" />
                <span>
                  Memuat script ({currentlyDisplayedCount} dari {totalActiveItemsCount})
                </span>
              </button>
            ) : totalActiveItemsCount > PAGE_SIZE ? (
              <p className="sw-muted">Semua {totalActiveItemsCount} script sudah tampil</p>
            ) : null}
          </div>
        )}

        {/* Empty */}
        {filteredStandardScripts.length === 0 && filteredObjections.length === 0 && (
          <div className="sw-empty">
            <MessageSquare size={32} aria-hidden="true" />
            <h2 className="sw-card__title">Tidak ada script</h2>
            <p className="sw-muted">
              {searchQuery.trim()
                ? `Tidak ada script yang cocok dengan "${searchQuery}".`
                : activeTab === 'favorites' && favoriteKeys.length === 0
                ? 'Ketuk ikon bintang di kartu script untuk menyimpannya di sini.'
                : 'Script di sini butuh data calon jamaah dan paketnya. Pilih calon jamaah yang sudah memilih paket.'}
            </p>
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="sw-btn">
                Hapus pencarian
              </button>
            )}
          </div>
        )}
      </div>

      {/* Recipient picker sheet */}
      {sheetOpen && (
        <div className="sw-sheet" role="presentation" onClick={() => setSheetOpen(false)}>
          <div className="sw-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="sw-sheet-title" onClick={(e) => e.stopPropagation()}>
            <span className="sw-sheet__grip" aria-hidden="true" />
            <div className="sw-sheet__head">
              <h2 id="sw-sheet-title" className="sw-card__title">
                Kirim untuk siapa?
              </h2>
              <button type="button" className="sw-icon-btn" onClick={() => setSheetOpen(false)} aria-label="Tutup">
                <X size={20} />
              </button>
            </div>

            <div className="sw-seg" role="tablist" aria-label="Sumber nama">
              <button type="button" role="tab" aria-selected={personalizationMode === 'prospect'} className={`sw-seg__btn${personalizationMode === 'prospect' ? ' sw-seg__btn--on' : ''}`} onClick={() => setPersonalizationMode('prospect')}>
                Dari jamaah ({prospectList.length})
              </button>
              <button type="button" role="tab" aria-selected={personalizationMode === 'manual'} className={`sw-seg__btn${personalizationMode === 'manual' ? ' sw-seg__btn--on' : ''}`} onClick={() => setPersonalizationMode('manual')}>
                Ketik manual
              </button>
            </div>

            {personalizationMode === 'prospect' ? (
              loadingProspects ? (
                <p className="sw-muted">Memuat data jamaah...</p>
              ) : prospectList.length === 0 ? (
                <p className="sw-muted">Belum ada jamaah di akun Anda. Pakai &quot;Ketik manual&quot;.</p>
              ) : (
                <>
                  <div className="sw-search">
                    <Search size={18} className="sw-search__icon" aria-hidden="true" />
                    <input
                      type="search"
                      aria-label="Cari jamaah"
                      placeholder="Cari nama atau nomor WA"
                      value={sheetQuery}
                      onChange={(e) => setSheetQuery(e.target.value)}
                      className="tw-field sw-search__input"
                    />
                  </div>
                  <ul className="sw-picks">
                    {sheetResults.map((p) => (
                      <li key={p.id}>
                        <button type="button" className={`sw-pick${p.id === selectedProspectId ? ' sw-pick--on' : ''}`} onClick={() => pickProspect(p.id)}>
                          <span className="sw-pick__name">{p.name}</span>
                          <span className="sw-pick__meta">
                            <span className={`sw-status sw-status--${p.status}`}>{STATUS_LABELS[p.status] || p.status}</span>
                            {' · '}
                            {p.phone}
                          </span>
                        </button>
                      </li>
                    ))}
                    {sheetResults.length === 0 && <li className="sw-muted">Tidak ada jamaah yang cocok.</li>}
                  </ul>
                  {selectedProspect && (
                    <button
                      type="button"
                      className="sw-link"
                      onClick={() => {
                        handleClearProspect();
                        setSheetOpen(false);
                      }}
                    >
                      Kosongkan pilihan
                    </button>
                  )}
                </>
              )
            ) : (
              <div className="sw-manual">
                <label className="tw-field-label" htmlFor="input-prospect-name">
                  Nama calon jamaah
                </label>
                <input
                  id="input-prospect-name"
                  type="text"
                  placeholder="Bu Fatimah"
                  value={prospectName}
                  onChange={(e) => {
                    handleManualNameChange(e.target.value);
                    if (selectedProspect) {
                      setSelectedProspect(null);
                      setSelectedProspectId(null);
                    }
                  }}
                  className="tw-field"
                />
                <label className="tw-field-label" htmlFor="input-prospect-phone">
                  Nomor WA (opsional)
                </label>
                <input id="input-prospect-phone" type="tel" placeholder="0812xxxx" value={prospectPhone} onChange={(e) => setProspectPhone(e.target.value)} className="tw-field" />
                <button type="button" className="sw-btn sw-btn--primary" onClick={() => setSheetOpen(false)}>
                  Pakai nama ini
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </MobileContainer>
  );
}

const STATUS_LABELS: Record<string, string> = {
  baru: 'Baru',
  dihubungi: 'Dihubungi',
  tertarik: 'Tertarik',
  closing: 'Closing',
  tidak_lanjut: 'Tidak Lanjut',
};

export default function ScriptWAPage() {
  return (
    <Suspense
      fallback={
        <MobileContainer>
          <p className="sw-loading">Memuat script...</p>
        </MobileContainer>
      }
    >
      <ScriptWAContent />
    </Suspense>
  );
}
