'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  X,
  Copy,
  Check,
  Share2,
  Star,
  MessageSquare,
  HelpCircle,
  Lightbulb,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  Compass,
  Users,
  ExternalLink,
  Edit3,
  Package,
  Loader2,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
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
  const [prospectJumlahJamaah, setProspectJumlahJamaah] = useState<number>(1);

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
    setProspectJumlahJamaah(target.jumlah_jamaah || 1);

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
    setProspectJumlahJamaah(1);
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

    const fetchProspects = async () => {
      try {
        setLoadingProspects(true);
        const res = await fetch('/api/agent/jamaah', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const list: AgentProspectItem[] = Array.isArray(data) ? data : [];
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
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Direct WA handler
  const handleOpenWhatsApp = (text: string) => {
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

  // Replacement values
  const replacements: PlaceholderReplacements = useMemo(
    () => ({
      nama: prospectName.trim(),
      travel: tenantName,
      cs_name: agentName,
      agent_name: agentName,
      referral_link: referralLink,
      paket: prospectPackageName || 'Paket Umroh Pilihan',
      harga: 'mulai 28 Jutaan',
      dp: 'Rp 5.000.000',
      seat: 'sisa 4 seat lagi',
      bulan: 'keberangkatan terdekat',
      tanggal: 'jadwal yang tersedia',
      hotel: 'Hotel Bintang 4 / 5',
      jarak_hotel: 'jalan kaki ke pelataran masjid',
      maskapai: 'Garuda / Saudia Airlines',
      fasilitas_utama: 'hotel dekat pelataran dan maskapai direct',
      durasi: '9 hari',
      rekening: 'rekening resmi travel',
      nama_rekening: tenantName,
    }),
    [prospectName, tenantName, agentName, referralLink, prospectPackageName]
  );

  // Raw datasets
  const stages = useMemo<CycleStage[]>(() => getCycleStages(), []);
  const greetings = useMemo<StandardScriptItem[]>(() => getGreetingScripts(), []);
  const identifications = useMemo<StandardScriptItem[]>(() => getIdentificationScripts(), []);
  const offers = useMemo<StandardScriptItem[]>(() => getOfferScripts(), []);
  const closings = useMemo<StandardScriptItem[]>(() => getClosingScripts(), []);
  const objections = useMemo<ObjectionTGJPItem[]>(() => getObjectionScripts(), []);
  const followups = useMemo<StandardScriptItem[]>(() => getFollowupScripts(), []);

  // Stage Metadata Mapping
  const activeStageInfo = useMemo(() => {
    return stages.find((s) => s.id === activeTab) || null;
  }, [stages, activeTab]);

  // Tab definitions
  const tabs: Array<{ id: TabType; label: string; count: number }> = useMemo(() => {
    const favCount = favoriteKeys.length;
    return [
      { id: 'greeting', label: '1. Sapaan', count: greetings.length },
      { id: 'identification', label: '2. Gali Minat', count: identifications.length },
      { id: 'offer', label: '3. Penawaran', count: offers.length },
      { id: 'closing', label: '4. Closing', count: closings.length },
      { id: 'objection', label: '5. Hadapi Ragu', count: objections.length },
      { id: 'followup', label: '6. Follow-up', count: followups.length },
      { id: 'favorites', label: 'Tersimpan', count: favCount },
    ];
  }, [greetings, identifications, offers, closings, objections, followups, favoriteKeys]);

  // Filtered standard scripts
  const filteredStandardScripts = useMemo(() => {
    let source: StandardScriptItem[] = [];
    if (activeTab === 'greeting') source = greetings;
    else if (activeTab === 'identification') source = identifications;
    else if (activeTab === 'offer') source = offers;
    else if (activeTab === 'closing') source = closings;
    else if (activeTab === 'followup') source = followups;
    else if (activeTab === 'favorites') {
      const allStandard = [...greetings, ...identifications, ...offers, ...closings, ...followups];
      source = allStandard.filter((item) => favoriteKeys.includes(item.id));
    }

    if (!searchQuery.trim()) return source;

    const q = searchQuery.toLowerCase();
    return source.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.script.toLowerCase().includes(q) ||
        (item.use_when && item.use_when.toLowerCase().includes(q)) ||
        (item.tags && item.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [activeTab, searchQuery, greetings, identifications, offers, closings, followups, favoriteKeys]);

  // Filtered objection scripts
  const filteredObjections = useMemo(() => {
    if (activeTab !== 'objection' && activeTab !== 'favorites') return [];

    let source = objections;
    if (activeTab === 'favorites') {
      source = objections.filter((item) => favoriteKeys.includes(item.id));
    }

    if (!searchQuery.trim()) return source;

    const q = searchQuery.toLowerCase();
    return source.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.prospect_examples && item.prospect_examples.some((ex) => ex.toLowerCase().includes(q))) ||
        (item.tgjp.jawab && item.tgjp.jawab.some((j) => j.script.toLowerCase().includes(q)))
    );
  }, [activeTab, searchQuery, objections, favoriteKeys]);

  // Infinite scroll pagination state (8 items per load)
  const PAGE_SIZE = 8;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  // Reset pagination on tab or search query change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, searchQuery]);

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

  return (
    <MobileContainer>
      {/* Sticky Header — konsisten dengan halaman agen lain */}
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
            Script Chat WhatsApp
          </h1>
          <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', lineHeight: 1.3 }}>
            Sapaan · Kualifikasi · Closing · Keberatan
          </span>
        </div>
      </header>

      {/* Main Content Area */}
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
        {/* Personalization Box */}
        <section
          aria-label="Personalisasi Pesan"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxShadow: 'var(--tw-card-shadow)',
          }}
        >
          {/* Header Row: Title & Mode Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} color="var(--tw-brand-primary)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tw-text-primary)' }}>
                Personalisasi Pesan
              </span>
            </div>

            {/* Mode Switcher */}
            <div
              style={{
                display: 'flex',
                backgroundColor: 'var(--tw-page-bg)',
                borderRadius: '6px',
                padding: '2px',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <button
                type="button"
                onClick={() => setPersonalizationMode('prospect')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: personalizationMode === 'prospect' ? '1px solid rgba(0,0,0,0.08)' : '1px solid transparent',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: personalizationMode === 'prospect' ? 'var(--tw-background)' : 'transparent',
                  color: personalizationMode === 'prospect' ? 'var(--tw-brand-primary)' : 'var(--tw-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Users size={11} />
                <span>Dari Prospek ({prospectList.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setPersonalizationMode('manual')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: personalizationMode === 'manual' ? '1px solid rgba(0,0,0,0.08)' : '1px solid transparent',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: personalizationMode === 'manual' ? 'var(--tw-background)' : 'transparent',
                  color: personalizationMode === 'manual' ? 'var(--tw-brand-primary)' : 'var(--tw-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Edit3 size={11} />
                <span>Ketik Manual</span>
              </button>
            </div>
          </div>

          {/* MODE 1: PILIH DARI DATA PROSPEK */}
          {personalizationMode === 'prospect' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label htmlFor="select-prospect" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tw-text-secondary)' }}>
                Pilih Calon Jamaah dari Pipeline:
              </label>

              {loadingProspects ? (
                <div style={{ fontSize: '12px', color: 'var(--tw-text-muted)', padding: '6px 0' }}>
                  Memuat data jamaah...
                </div>
              ) : prospectList.length === 0 ? (
                <div
                  style={{
                    backgroundColor: 'var(--tw-page-bg)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    color: 'var(--tw-text-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <span>Belum ada prospek tercatat di akun Anda.</span>
                  <button
                    type="button"
                    onClick={() => setPersonalizationMode('manual')}
                    style={{
                      alignSelf: 'flex-start',
                      fontSize: '11px',
                      color: 'var(--tw-brand-primary)',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Ketik nama &amp; no WhatsApp manual
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <select
                    id="select-prospect"
                    value={selectedProspectId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) handleSelectProspect(Number(val));
                      else handleClearProspect();
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(0,0,0,0.1)',
                      fontSize: '12px',
                      backgroundColor: 'var(--tw-page-bg)',
                      color: 'var(--tw-text-primary)',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">-- Pilih Calon Jamaah ({prospectList.length} tersedia) --</option>
                    {prospectList.map((p) => {
                      const statusLabel = p.status.charAt(0).toUpperCase() + p.status.slice(1);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.phone}) • {statusLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Selected Prospect Context Capsule */}
              {selectedProspect && (
                <div
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 5%, var(--tw-background))',
                    border: '1px solid color-mix(in srgb, var(--tw-brand-primary) 18%, transparent)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          backgroundColor:
                            selectedProspect.status === 'closing'
                              ? 'var(--tw-badge-success-bg)'
                              : selectedProspect.status === 'tertarik'
                              ? 'color-mix(in srgb, var(--tw-brand-primary) 15%, var(--tw-background))'
                              : 'var(--tw-badge-neutral-bg)',
                          color:
                            selectedProspect.status === 'closing'
                              ? 'var(--tw-badge-success-text)'
                              : selectedProspect.status === 'tertarik'
                              ? 'var(--tw-brand-primary)'
                              : 'var(--tw-badge-neutral-text)',
                        }}
                      >
                        {selectedProspect.status}
                      </span>
                      <strong style={{ fontSize: '13px', color: 'var(--tw-text-primary)' }}>
                        {selectedProspect.name}
                      </strong>
                    </div>

                    <Link
                      href={`/agen/jamaah/${selectedProspect.id}`}
                      style={{
                        fontSize: '11px',
                        color: 'var(--tw-brand-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontWeight: 600,
                      }}
                    >
                      <span>Detail</span>
                      <ExternalLink size={12} />
                    </Link>
                  </div>

                  {/* Context Info Row */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '11px', color: 'var(--tw-text-secondary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Package size={12} color="var(--tw-text-muted)" />
                      <span>{selectedProspect.package_name || 'Paket Umum'}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Users size={12} color="var(--tw-text-muted)" />
                      <span>{selectedProspect.jumlah_jamaah || 1} Jamaah</span>
                    </span>
                    <span>WA: {selectedProspect.phone}</span>
                  </div>

                  {/* Smart Recommendation Banner */}
                  <div
                    style={{
                      backgroundColor: 'var(--tw-background)',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      fontSize: '11px',
                      color: 'var(--tw-text-primary)',
                      borderLeft: '3px solid var(--tw-brand-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <span style={{ lineHeight: 1.4 }}>{getRecommendationTip(selectedProspect.status)}</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab(getRecommendedTab(selectedProspect.status))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--tw-brand-primary)',
                        fontSize: '10px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Buka Tab Saran
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE 2: KETIK MANUAL */}
          {personalizationMode === 'manual' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="input-prospect-name" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tw-text-secondary)' }}>
                  Nama Calon Jamaah
                </label>
                <input
                  id="input-prospect-name"
                  type="text"
                  placeholder="Contoh: Bu Fatimah"
                  value={prospectName}
                  onChange={(e) => handleManualNameChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0,0,0,0.1)',
                    fontSize: '12px',
                    backgroundColor: 'var(--tw-page-bg)',
                    color: 'var(--tw-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="input-prospect-phone" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tw-text-secondary)' }}>
                  No WA Jamaah (Opsional)
                </label>
                <input
                  id="input-prospect-phone"
                  type="tel"
                  placeholder="0812xxxx"
                  value={prospectPhone}
                  onChange={(e) => setProspectPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0,0,0,0.1)',
                    fontSize: '12px',
                    backgroundColor: 'var(--tw-page-bg)',
                    color: 'var(--tw-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          )}

          {/* Quick Context Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '1px dashed rgba(0,0,0,0.08)',
              fontSize: '11px',
              color: 'var(--tw-text-muted)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Building2 size={12} />
                <strong style={{ color: 'var(--tw-text-secondary)' }}>{tenantName}</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <User size={12} />
                <span>{agentName}</span>
              </span>
            </div>

            {prospectName && (
              <span style={{ color: 'var(--tw-brand-primary)', fontWeight: 700 }}>
                Target: {prospectName}
              </span>
            )}
          </div>
        </section>

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
            placeholder="Cari script (mahal, halo, dp, lansia)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 36px 10px 36px',
              borderRadius: '8px',
              border: '1px solid rgba(0,0,0,0.1)',
              backgroundColor: 'var(--tw-background)',
              fontSize: '13px',
              color: 'var(--tw-text-primary)',
              outline: 'none',
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

        {/* Horizontal Navigation Tabs */}
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
          {tabs.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '7px 12px',
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
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: '10px',
                    backgroundColor: isSelected
                      ? 'rgba(255,255,255,0.2)'
                      : 'rgba(0,0,0,0.06)',
                    color: isSelected ? '#FFFFFF' : 'var(--tw-text-muted)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Stage Strategy Insight Box */}
        {activeStageInfo && activeTab !== 'favorites' && (
          <div
            style={{
              backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 6%, var(--tw-background))',
              border: '1px solid color-mix(in srgb, var(--tw-brand-primary) 20%, transparent)',
              borderRadius: '10px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lightbulb size={14} color="var(--tw-brand-primary)" />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--tw-brand-primary)',
                }}
              >
                Panduan Fase: {activeStageInfo.nama}
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--tw-text-secondary)', margin: 0, lineHeight: 1.5 }}>
              <strong>Tujuan:</strong> {activeStageInfo.tujuan}
            </p>
            {activeStageInfo.prinsip && (
              <p
                style={{
                  fontSize: '11px',
                  color: 'var(--tw-text-muted)',
                  margin: 0,
                  lineHeight: 1.4,
                  fontStyle: 'italic',
                }}
              >
                <strong>Prinsip:</strong>{' '}
                {Array.isArray(activeStageInfo.prinsip)
                  ? activeStageInfo.prinsip[0]
                  : activeStageInfo.prinsip}
              </p>
            )}
          </div>
        )}

        {/* Standard Scripts List */}
        {activeTab !== 'objection' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {displayedStandardScripts.map((item) => {
              const personalizedText = replacePlaceholders(item.script, replacements);
              const isFav = favoriteKeys.includes(item.id);
              const isCopied = copiedKey === item.id;

              return (
                <article
                  key={item.id}
                  style={{
                    backgroundColor: 'var(--tw-background)',
                    borderRadius: '12px',
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: 'var(--tw-card-shadow)',
                  }}
                >
                  {/* Card Header: Title & Bookmark */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <h2
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: 'var(--tw-text-primary)',
                          margin: 0,
                          fontFamily: 'var(--tw-font-heading)',
                        }}
                      >
                        {item.title}
                      </h2>
                      {item.use_when && (
                        <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', lineHeight: 1.3 }}>
                          {item.use_when}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleFavorite(item.id)}
                      aria-label={isFav ? 'Hapus dari favorit' : 'Simpan ke favorit'}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '4px',
                        cursor: 'pointer',
                        color: isFav ? 'var(--tw-rating-star)' : 'var(--tw-text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Star size={16} fill={isFav ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  {/* Prospect Example Bubble */}
                  {item.prospect_example && (
                    <div
                      style={{
                        backgroundColor: 'var(--tw-page-bg)',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        fontSize: '11px',
                        color: 'var(--tw-text-secondary)',
                        borderLeft: '3px solid rgba(0,0,0,0.1)',
                      }}
                    >
                      <strong>Pesan Jamaah:</strong> &quot;{item.prospect_example}&quot;
                    </div>
                  )}

                  {/* Script Text Box */}
                  <div
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 3%, var(--tw-background))',
                      border: '1px solid color-mix(in srgb, var(--tw-brand-primary) 12%, transparent)',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      color: 'var(--tw-text-primary)',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                    }}
                  >
                    {personalizedText}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleCopyText(personalizedText, item.id)}
                      style={{
                        padding: '9px 12px',
                        borderRadius: '6px',
                        border: '1px solid rgba(0,0,0,0.1)',
                        backgroundColor: 'var(--tw-background)',
                        color: isCopied ? 'var(--tw-brand-primary)' : 'var(--tw-text-primary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      {isCopied ? <Check size={14} color="var(--tw-brand-primary)" /> : <Copy size={14} />}
                      <span>{isCopied ? 'Tersalin' : 'Salin Pesan'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenWhatsApp(personalizedText)}
                      style={{
                        padding: '9px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: 'var(--tw-brand-primary)',
                        color: '#FFFFFF',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Share2 size={14} />
                      <span>Kirim ke WA</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Objection Scripts List (TGJP Framework Accordion - Default Collapsed) */}
        {(activeTab === 'objection' || (activeTab === 'favorites' && displayedObjections.length > 0)) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeTab === 'objection' && (
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--tw-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '2px 2px',
                }}
              >
                <Compass size={14} color="var(--tw-brand-primary)" />
                <span>Format 4 Langkah TGJP: <strong>Terima, Gali, Jawab, Pastikan</strong></span>
              </div>
            )}

            {displayedObjections.map((obj) => {
              const isFav = favoriteKeys.includes(obj.id);
              // Default collapsed: hanya tampilkan judul dan preview pertanyaan prospek
              const isExpanded = Boolean(expandedObjections[obj.id]);

              return (
                <article
                  key={obj.id}
                  style={{
                    backgroundColor: 'var(--tw-background)',
                    borderRadius: '12px',
                    border: isExpanded ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(0, 0, 0, 0.06)',
                    padding: isExpanded ? '14px' : '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isExpanded ? '12px' : '0px',
                    boxShadow: 'var(--tw-card-shadow)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Objection Header - Klik judul untuk expand / collapse */}
                  <div
                    onClick={() => toggleObjectionExpand(obj.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '8px',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                      <h2
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: isExpanded ? 'var(--tw-brand-primary)' : 'var(--tw-text-primary)',
                          margin: 0,
                          fontFamily: 'var(--tw-font-heading)',
                          transition: 'color 0.15s ease',
                        }}
                      >
                        {obj.title}
                      </h2>
                      {obj.prospect_examples && obj.prospect_examples.length > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--tw-text-muted)', lineHeight: 1.3 }}>
                          Sering muncul: &quot;{obj.prospect_examples[0]}&quot;
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(obj.id);
                        }}
                        aria-label={isFav ? 'Hapus favorit' : 'Simpan favorit'}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '4px',
                          cursor: 'pointer',
                          color: isFav ? 'var(--tw-rating-star)' : 'var(--tw-text-muted)',
                        }}
                      >
                        <Star size={15} fill={isFav ? 'currentColor' : 'none'} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleObjectionExpand(obj.id);
                        }}
                        aria-label={isExpanded ? 'Tutup detail objection' : 'Buka detail objection'}
                        style={{
                          background: isExpanded ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '5px',
                          cursor: 'pointer',
                          color: isExpanded ? 'var(--tw-brand-primary)' : 'var(--tw-text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* TGJP 4 Steps Accordion Content */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Step 1: TERIMA */}
                      <div
                        style={{
                          backgroundColor: 'var(--tw-page-bg)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          borderLeft: '3px solid var(--tw-brand-primary)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tw-brand-primary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          1. Terima — Empati &amp; Validasi
                        </span>
                        {obj.tgjp.terima.map((item, idx) => {
                          const text = replacePlaceholders(item, replacements);
                          const key = `${obj.id}_terima_${idx}`;
                          const isCopied = copiedKey === key;
                          return (
                            <div
                              key={key}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                fontSize: '12px',
                                color: 'var(--tw-text-primary)',
                              }}
                            >
                              <span style={{ flex: 1, lineHeight: 1.5 }}>{text}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyText(text, key)}
                                style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: isCopied ? 'var(--tw-brand-primary)' : 'var(--tw-text-muted)', flexShrink: 0 }}
                                title="Salin"
                              >
                                {isCopied ? <Check size={13} color="var(--tw-brand-primary)" /> : <Copy size={13} />}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Step 2: GALI */}
                      <div
                        style={{
                          backgroundColor: 'var(--tw-page-bg)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          borderLeft: '3px solid var(--tw-rating-star)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tw-rating-star)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          2. Gali — Temukan Akar Masalah
                        </span>
                        {obj.tgjp.gali.map((item, idx) => {
                          const text = replacePlaceholders(item, replacements);
                          const key = `${obj.id}_gali_${idx}`;
                          const isCopied = copiedKey === key;
                          return (
                            <div
                              key={key}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                fontSize: '12px',
                                color: 'var(--tw-text-primary)',
                              }}
                            >
                              <span style={{ flex: 1, lineHeight: 1.5 }}>{text}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyText(text, key)}
                                style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: isCopied ? 'var(--tw-brand-primary)' : 'var(--tw-text-muted)', flexShrink: 0 }}
                                title="Salin"
                              >
                                {isCopied ? <Check size={13} color="var(--tw-brand-primary)" /> : <Copy size={13} />}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Step 3: JAWAB */}
                      <div
                        style={{
                          backgroundColor: 'var(--tw-page-bg)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          borderLeft: '3px solid var(--tw-brand-secondary)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tw-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          3. Jawab — Pilih Solusi yang Pas
                        </span>
                        {obj.tgjp.jawab.map((jItem, idx) => {
                          const text = replacePlaceholders(jItem.script, replacements);
                          const key = `${obj.id}_jawab_${idx}`;
                          const isCopied = copiedKey === key;
                          return (
                            <div
                              key={key}
                              style={{
                                backgroundColor: 'var(--tw-background)',
                                borderRadius: '6px',
                                padding: '8px 10px',
                                border: '1px solid rgba(0,0,0,0.06)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tw-text-muted)', textTransform: 'uppercase' }}>
                                  {jItem.reason.replace(/_/g, ' ')}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(text, key)}
                                  style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: isCopied ? 'var(--tw-brand-primary)' : 'var(--tw-text-muted)' }}
                                  title="Salin jawaban ini"
                                >
                                  {isCopied ? <Check size={12} color="var(--tw-brand-primary)" /> : <Copy size={12} />}
                                </button>
                              </div>
                              <span style={{ fontSize: '12px', color: 'var(--tw-text-primary)', lineHeight: 1.5 }}>
                                {text}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Step 4: PASTIKAN */}
                      <div
                        style={{
                          backgroundColor: 'var(--tw-page-bg)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          borderLeft: '3px solid var(--tw-brand-primary)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tw-brand-primary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          4. Pastikan — Konfirmasi &amp; Arahkan Kembali
                        </span>
                        {obj.tgjp.pastikan.map((item, idx) => {
                          const text = replacePlaceholders(item, replacements);
                          const key = `${obj.id}_pastikan_${idx}`;
                          const isCopied = copiedKey === key;
                          return (
                            <div
                              key={key}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                fontSize: '12px',
                                color: 'var(--tw-text-primary)',
                              }}
                            >
                              <span style={{ flex: 1, lineHeight: 1.5 }}>{text}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyText(text, key)}
                                style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: isCopied ? 'var(--tw-brand-primary)' : 'var(--tw-text-muted)', flexShrink: 0 }}
                                title="Salin"
                              >
                                {isCopied ? <Check size={13} color="var(--tw-brand-primary)" /> : <Copy size={13} />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                <span>Memuat script berikutnya ({currentlyDisplayedCount} dari {totalActiveItemsCount})...</span>
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
                Menampilkan seluruh {totalActiveItemsCount} script
              </div>
            ) : null}
          </div>
        )}

        {/* Empty State */}
        {filteredStandardScripts.length === 0 && filteredObjections.length === 0 && (
          <div
            style={{
              backgroundColor: 'var(--tw-background)',
              borderRadius: '12px',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              padding: '48px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <MessageSquare size={32} color="var(--tw-text-muted)" />
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tw-text-primary)', fontFamily: 'var(--tw-font-heading)' }}>
              Tidak Ada Script Ditemukan
            </span>
            <span style={{ fontSize: '13px', color: 'var(--tw-text-muted)', maxWidth: '260px', lineHeight: 1.5 }}>
              {activeTab === 'favorites'
                ? 'Belum ada script yang Anda tandai bintang. Klik ikon bintang pada kartu script untuk menyimpannya di sini.'
                : `Tidak ditemukan script yang cocok dengan kata kunci "${searchQuery}".`}
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
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
                Hapus Pencarian
              </button>
            )}
          </div>
        )}
      </div>

      <AgentBottomNavbar />
    </MobileContainer>
  );
}

export default function ScriptWAPage() {
  return (
    <Suspense
      fallback={
        <MobileContainer>
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--tw-text-muted)', fontSize: '14px' }}>
            Memuat Script WhatsApp...
          </div>
        </MobileContainer>
      }
    >
      <ScriptWAContent />
    </Suspense>
  );
}
