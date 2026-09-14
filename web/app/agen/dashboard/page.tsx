'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Wallet,
  Copy,
  Check,
  MousePointerClick,
  Share2,
  Trophy,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Eye,
  EyeOff,
  ShieldCheck,
  MessageSquareShare,
  Users,
  Quote,
  Images,
  Target,
  Gift,
  Bell,
  History,
  User,
} from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { Button } from '../../../components/Button';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import { initAudioUnlock, playNotificationSound } from '../../../lib/notificationSound';

interface AgentFunnelSummary {
  baru: number;
  diproses: number;
  closing: number;
}

interface LeaderboardPreview {
  rank_saya: number;
  total_agen: number;
}

export interface AgentTargetView {
  id: number;
  title?: string | null;
  metric_type: 'closing_pax' | 'mitra_baru_count';
  metric_label: string;
  metric_value: number;
  progress_value: number;
  achieved: boolean;
  reward_description?: string | null;
  period_start: string;
  period_end: string;
  period_label: string;
}

interface AgentDashboardSummary {
  name: string;
  saldo_siap_cair: number;
  saldo_tertunda: number;
  jamaah_tertunda_count: number;
  targets: AgentTargetView[];
  minimum_payout_amount: number | null;
  referral_link: string;
  funnel_ringkasan: AgentFunnelSummary;
  leaderboard_preview: LeaderboardPreview;
  photo_url?: string | null;
  total_clicks?: number;
}

export default function AgenDashboardPage() {
  const router = useRouter();

  const [summary, setSummary] = useState<AgentDashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const initDashboard = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Check agent status via /api/agent/me
      const meRes = await fetch('/api/agent/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (meRes.status === 401) {
        localStorage.removeItem('agent_token');
        router.push('/agen/login');
        return;
      }

      if (!meRes.ok) {
        throw new Error('Gagal memverifikasi status akun');
      }

      const meJson = await meRes.json();
      const agentData = meJson.agent || meJson.data?.agent || meJson;
      const status = agentData.status;

      // If status is not 'active', redirect to /agen/status
      if (status !== 'active') {
        router.push('/agen/status');
        return;
      }

      // Extract tenant info if present
      const tenantData = meJson.tenant || meJson.data?.tenant;
      const tName = meJson.tenant_name || agentData?.tenant_name || tenantData?.name;
      if (tName) {
        try {
          localStorage.setItem('klikumroh_agent_tenant_name', tName);
        } catch {}
      }
      if (agentData?.name) {
        try {
          localStorage.setItem('klikumroh_agent_name', agentData.name);
        } catch {}
      }

      // 2. Fetch dashboard summary
      const sumRes = await fetch('/api/agent/dashboard-summary', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (sumRes.status === 403) {
        // Not active
        router.push('/agen/status');
        return;
      }

      if (!sumRes.ok) {
        throw new Error('Gagal memuat ringkasan dasbor agen');
      }

      const sumJson = await sumRes.json();
      const summaryData = sumJson.data || sumJson;
      setSummary({
        ...summaryData,
        photo_url: summaryData.photo_url ?? agentData?.photo_url ?? null,
      });

      // 3. Fetch unread notifications count
      try {
        const notifRes = await fetch('/api/agent/notifications?limit=1', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (notifRes.ok) {
          const notifJson = await notifRes.json();
          setUnreadCount(notifJson.unread_count || 0);
        }
      } catch {
        // Silently continue
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memuat dasbor');
    } finally {
      setLoading(false);
    }
  };

  const pollAgentNotifications = async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) return;

    try {
      const notifRes = await fetch('/api/agent/notifications?limit=5', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (notifRes.ok) {
        const notifJson = await notifRes.json();
        const unread = notifJson.unread_count || 0;
        const notifs = notifJson.notifications || [];
        const latestId = notifs.length > 0 ? notifs[0].id : null;

        setUnreadCount(unread);

        const savedIdStr = sessionStorage.getItem('klikumroh_agent_last_notif_id');
        const savedId = savedIdStr ? parseInt(savedIdStr, 10) : null;

        if (savedId !== null && latestId !== null && latestId > savedId) {
          sessionStorage.setItem('klikumroh_agent_last_notif_id', String(latestId));
          playNotificationSound();
        } else if (savedId === null && latestId !== null) {
          sessionStorage.setItem('klikumroh_agent_last_notif_id', String(latestId));
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    initDashboard();
    const cleanupAudio = initAudioUnlock();

    // Polling setiap 30 detik untuk efisiensi server dan responsif saat tab aktif
    const timer = setInterval(pollAgentNotifications, 30000);

    const handleVis = () => {
      if (document.visibilityState === 'visible') {
        pollAgentNotifications();
      }
    };
    const handleFocus = () => {
      pollAgentNotifications();
    };

    document.addEventListener('visibilitychange', handleVis);
    window.addEventListener('focus', handleFocus);

    return () => {
      cleanupAudio();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVis);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const formatRupiah = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return 'Rp 0';
    return 'Rp ' + Math.floor(val).toLocaleString('id-ID');
  };

  const handleCopyLink = () => {
    if (!summary?.referral_link) return;
    navigator.clipboard.writeText(summary.referral_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getWhatsAppShareUrl = (): string => {
    if (!summary?.referral_link) return '#';
    const text = `Assalamu'alaikum, info pendaftaran paket umroh resmi dan terpercaya bisa cek langsung di link berikut:\n${summary.referral_link}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const getReferralCode = (): string => {
    if (!summary?.referral_link) return '';
    const parts = summary.referral_link.split('/ref/');
    return parts.length > 1 ? parts[1].toUpperCase() : '';
  };

  if (loading) {
    return (
      <MobileContainer>
        {/* Sticky Header Portal Agen (konsisten, tidak flash nama travel) */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            backgroundColor: 'var(--tw-background)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 800,
              color: 'var(--tw-text-primary)',
              margin: 0,
              fontFamily: 'var(--tw-font-heading)',
            }}
          >
            Portal Agen
          </h1>

          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              backgroundColor: 'var(--tw-background)',
              color: 'var(--tw-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bell size={16} />
          </div>
        </header>

        <div
          style={{
            backgroundColor: 'var(--tw-page-bg)',
            minHeight: 'calc(100vh - 62px)',
            padding: '80px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3px solid rgba(0, 0, 0, 0.08)',
              borderTopColor: 'var(--tw-brand-primary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ fontSize: '13px', color: 'var(--tw-text-muted)' }}>
            Memuat beranda agen Anda...
          </span>
          <style jsx>{`
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </div>

        <AgentBottomNavbar />
      </MobileContainer>
    );
  }

  if (error || !summary) {
    return (
      <MobileContainer>
        {/* Sticky Header Portal Agen */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            backgroundColor: 'var(--tw-background)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 800,
              color: 'var(--tw-text-primary)',
              margin: 0,
              fontFamily: 'var(--tw-font-heading)',
            }}
          >
            Portal Agen
          </h1>
        </header>
        <div
          style={{
            backgroundColor: 'var(--tw-page-bg)',
            minHeight: 'calc(100vh - 62px)',
            padding: '60px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div style={{ color: 'var(--tw-brand-primary)' }}>
            <AlertCircle size={36} />
          </div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--tw-text-primary)' }}>
            Gagal Memuat Dasbor
          </h2>
          <p style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--tw-text-secondary)', margin: 0 }}>
            {error}
          </p>
          <Button variant="primary" style={{ borderRadius: '8px' }} onClick={() => initDashboard()}>
            <RefreshCw size={14} />
            <span>Coba Lagi</span>
          </Button>
        </div>
        <AgentBottomNavbar />
      </MobileContainer>
    );
  }

  const minPayout = summary.minimum_payout_amount ?? 0;
  const isBelowMinimum = summary.saldo_siap_cair < minPayout;

  const quickMenus = [
    {
      id: 'script-wa',
      title: 'Script WA',
      desc: 'Template chat follow-up, closing, & sapaan calon...',
      icon: <MessageSquareShare size={20} color="var(--tw-brand-primary)" />,
      iconBg: 'color-mix(in srgb, var(--tw-brand-primary) 14%, var(--tw-background))',
    },
    {
      id: 'sumber-jamaah',
      title: 'Sumber Jamaah',
      desc: 'Panduan menjaring prospek majelis taklim &...',
      icon: <Users size={20} color="var(--tw-rating-star)" />,
      iconBg: 'color-mix(in srgb, var(--tw-rating-star) 16%, var(--tw-background))',
    },
    {
      id: 'bank-caption',
      title: 'Bank Caption',
      desc: 'Copy-paste caption siap pakai Instagram & TikTok',
      icon: <Quote size={20} color="var(--tw-brand-primary)" />,
      iconBg: 'color-mix(in srgb, var(--tw-brand-primary) 14%, var(--tw-background))',
    },
    {
      id: 'bank-konten',
      title: 'Bank Konten',
      desc: 'Flyer brosur cetak & video reels resolusi tinggi',
      icon: <Images size={20} color="color-mix(in srgb, var(--tw-brand-secondary) 80%, var(--tw-brand-primary))" />,
      iconBg: 'color-mix(in srgb, var(--tw-brand-secondary) 10%, var(--tw-background))',
    },
  ];

  const target = summary.target_bulanan;
  const targetPct = target && target.target_jamaah > 0
    ? Math.min(100, Math.max(0, Math.round((target.progress_jamaah / target.target_jamaah) * 100)))
    : 0;
  const remainingTarget = target ? Math.max(0, target.target_jamaah - target.progress_jamaah) : 0;
  const targets = summary.targets || [];

  return (
    <MobileContainer>
      {/* 1. Sleek App Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backgroundColor: 'var(--tw-background)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h1
          style={{
            fontSize: '18px',
            fontWeight: 800,
            color: 'var(--tw-text-primary)',
            margin: 0,
            fontFamily: 'var(--tw-font-heading)',
          }}
        >
          Portal Agen
        </h1>

        <button
          type="button"
          aria-label="Notifikasi"
          onClick={() => router.push('/agen/notifikasi')}
          style={{
            position: 'relative',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            backgroundColor: 'var(--tw-background)',
            color: 'var(--tw-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '7px',
                right: '7px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--tw-brand-primary)',
              }}
            />
          )}
        </button>
      </header>

      {/* Main Canvas */}
      <div
        style={{
          backgroundColor: 'var(--tw-page-bg)',
          minHeight: 'calc(100vh - 62px)',
          padding: '16px 16px calc(76px + env(safe-area-inset-bottom)) 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Profil Singkat Agen & Badge Mitra Resmi (di atas Card Komisi) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <Link
            href="/agen/profil"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              textDecoration: 'none',
              color: 'inherit',
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 12%, var(--tw-background))',
                color: 'var(--tw-brand-primary)',
                border: '2px solid var(--tw-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {summary.photo_url ? (
                <img
                  src={summary.photo_url}
                  alt={summary.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '50%',
                  }}
                />
              ) : (
                <User size={24} />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--tw-text-muted)',
                  lineHeight: 1.2,
                  fontWeight: 500,
                }}
              >
                Assalamu&apos;alaikum,
              </span>
              <span
                style={{
                  fontSize: '17px',
                  fontWeight: 700,
                  color: 'var(--tw-text-primary)',
                  lineHeight: 1.3,
                  fontFamily: 'var(--tw-font-heading)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {summary.name}
              </span>
            </div>
          </Link>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              borderRadius: '6px',
              backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 10%, var(--tw-background))',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--tw-brand-primary)',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={13} color="var(--tw-brand-primary)" />
            <span>Mitra Resmi</span>
          </div>
        </div>

        {/* JTBD 1: Premium Fintech Wallet Card */}
        <section
          aria-label="Kartu Saldo Komisi"
          style={{
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: 'var(--tw-brand-primary)',
            backgroundImage: 'linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 50%, rgba(0, 0, 0, 0.08) 100%)',
            borderRadius: '20px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            color: 'var(--tw-background)',
          }}
        >
          {/* Subtle concentric rings decoration for fintech authenticity */}
          <div
            style={{
              position: 'absolute',
              right: '-30px',
              top: '-30px',
              width: '160px',
              height: '160px',
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: '-10px',
              top: '-10px',
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              pointerEvents: 'none',
            }}
          />

          {/* Top Row: Label & Eye Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Wallet size={15} color="var(--tw-background)" style={{ opacity: 0.95 }} />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.6px',
                  textTransform: 'uppercase',
                  color: 'color-mix(in srgb, var(--tw-background) 92%, transparent)',
                }}
              >
                Komisi Siap Cair
              </span>
              <button
                type="button"
                onClick={() => setShowBalance(!showBalance)}
                aria-label={showBalance ? 'Sembunyikan saldo' : 'Tampilkan saldo'}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'color-mix(in srgb, var(--tw-background) 90%, transparent)',
                }}
              >
                {showBalance ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>

            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'color-mix(in srgb, var(--tw-background) 88%, transparent)',
                letterSpacing: '0.2px',
              }}
            >
              Dompet Mitra
            </span>
          </div>

          {/* Balance Display */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <span
              style={{
                fontSize: '32px',
                fontWeight: 800,
                color: 'var(--tw-background)',
                letterSpacing: showBalance ? '-0.5px' : '2px',
                lineHeight: 1,
                fontFamily: 'var(--tw-font-heading)',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
              }}
            >
              {showBalance ? formatRupiah(summary.saldo_siap_cair) : '••••••••'}
            </span>
          </div>

          {/* Pending Balance Frosted Glass Capsule */}
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              backgroundColor: 'rgba(255, 255, 255, 0.16)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              borderRadius: '8px',
              padding: '7px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--tw-background)',
                }}
              />
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--tw-background)',
                  fontWeight: 500,
                }}
              >
                Potensi Komisi:{' '}
                <strong>{showBalance ? formatRupiah(summary.saldo_tertunda) : '••••••••'}</strong>
                {' '}({summary.jamaah_tertunda_count} jamaah)
              </span>
            </div>
          </div>

          {/* Action Buttons: Tarik Saldo & Riwayat Komisi */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              position: 'relative',
              zIndex: 1,
              paddingTop: '2px',
            }}
          >
            <button
              type="button"
              disabled={isBelowMinimum}
              onClick={() => {
                if (!isBelowMinimum) {
                  router.push('/agen/tarik-saldo');
                }
              }}
              style={{
                padding: '11px 12px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                border: 'none',
                backgroundColor: 'var(--tw-background)',
                color: 'var(--tw-brand-primary)',
                cursor: isBelowMinimum ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'transform 0.1s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <TrendingUp size={15} color="var(--tw-brand-primary)" />
              <span>Tarik Saldo</span>
            </button>

            <button
              type="button"
              onClick={() => router.push('/agen/riwayat-komisi')}
              style={{
                padding: '11px 12px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                border: '1px solid rgba(255, 255, 255, 0.35)',
                backgroundColor: 'rgba(255, 255, 255, 0.16)',
                backdropFilter: 'blur(6px)',
                color: 'var(--tw-background)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'background-color 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <History size={15} color="var(--tw-background)" />
              <span>Riwayat Komisi</span>
            </button>
          </div>
        </section>

        {/* Target Habit Banner (Jika Ada Target) */}
        {target && (
          <section
            aria-label="Target Bulanan"
            style={{
              backgroundColor: 'var(--tw-background)',
              borderRadius: '16px',
              padding: '14px 16px',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Target size={15} color="var(--tw-brand-primary)" />
                <span
        {/* Target & Reward Section (Jika Ada Target Aktif) */}
        {targets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {targets.map((t) => {
              const targetPct = t.metric_value > 0
                ? Math.min(100, Math.max(0, Math.round((t.progress_value / t.metric_value) * 100)))
                : 0;
              const remaining = Math.max(0, t.metric_value - t.progress_value);
              const unit = t.metric_type === 'closing_pax' ? 'jamaah' : 'mitra';
              const targetTitle = t.title ? `${t.title} (${t.period_label})` : `${t.metric_label} (${t.period_label})`;

              return (
                <section
                  key={t.id}
                  aria-label={t.title || t.metric_label}
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--tw-text-primary)',
                    backgroundColor: 'var(--tw-background)',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  Target Closing ({target.period_label})
                </span>
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--tw-brand-primary)',
                }}
              >
                {target.progress_jamaah} / {target.target_jamaah} ({targetPct}%)
              </span>
            </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Target size={15} color="var(--tw-brand-primary)" />
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--tw-text-primary)',
                        }}
                      >
                        {targetTitle}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--tw-brand-primary)',
                      }}
                    >
                      {t.progress_value} / {t.metric_value} ({targetPct}%)
                    </span>
                  </div>

            {/* Clean Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '7px',
                borderRadius: '4px',
                backgroundColor: 'color-mix(in srgb, var(--tw-border) 60%, var(--tw-background))',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${targetPct}%`,
                  height: '100%',
                  borderRadius: '4px',
                  backgroundColor: 'var(--tw-brand-primary)',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
                  {/* Clean Progress Bar */}
                  <div
                    style={{
                      width: '100%',
                      height: '7px',
                      borderRadius: '4px',
                      backgroundColor: 'color-mix(in srgb, var(--tw-border) 60%, var(--tw-background))',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${targetPct}%`,
                        height: '100%',
                        borderRadius: '4px',
                        backgroundColor: 'var(--tw-brand-primary)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>

            <span
              style={{
                fontSize: '11px',
                color: 'var(--tw-text-muted)',
                lineHeight: 1.3,
              }}
            >
              {target.progress_jamaah >= target.target_jamaah
                ? 'Target bulan ini tercapai! Terus pertahankan ritme promosi.'
                : `${remainingTarget} jamaah lagi untuk mencapai target reward.`}
            </span>
          </section>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--tw-text-muted)',
                        lineHeight: 1.3,
                      }}
                    >
                      {t.achieved
                        ? 'Target tercapai! Terus pertahankan ritme promosi.'
                        : `${remaining} ${unit} lagi untuk mencapai target reward.`}
                    </span>
                    {t.achieved && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 12%, var(--tw-background))',
                          color: 'var(--tw-brand-primary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Tercapai
                      </span>
                    )}
                  </div>

                  {/* Reward Box (jika ada deskripsi reward) */}
                  {t.reward_description && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 6%, var(--tw-background))',
                        border: '1px dashed color-mix(in srgb, var(--tw-brand-primary) 25%, transparent)',
                      }}
                    >
                      <Gift size={14} color="var(--tw-brand-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div style={{ fontSize: '11px', color: 'var(--tw-text-primary)', lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 700 }}>Hadiah: </span>
                        {t.reward_description}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {/* JTBD 2: Tautan Afiliasi (Sleek Card Sesuai Referensi) */}
        <section
          aria-label="Tautan Afiliasi Anda"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '18px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.6px',
                  textTransform: 'uppercase',
                  color: 'var(--tw-text-muted)',
                }}
              >
                Tautan Afiliasi Anda
              </span>
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--tw-text-primary)',
                  margin: 0,
                  fontFamily: 'var(--tw-font-heading)',
                }}
              >
                Mulai Syiar dan dapatkan komisi
              </h2>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '20px',
                backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 10%, var(--tw-background))',
                border: '1px solid color-mix(in srgb, var(--tw-brand-primary) 22%, transparent)',
                color: 'var(--tw-brand-primary)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap',
              }}
              title="Jumlah klik pada tautan afiliasi Anda"
            >
              <MousePointerClick size={13} color="var(--tw-brand-primary)" />
              <span>{summary?.total_clicks ?? 0} Klik</span>
            </div>
          </div>

          {/* Capsule Code / Link display */}
          <div
            style={{
              backgroundColor: 'var(--tw-page-bg)',
              borderRadius: '10px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                color: 'var(--tw-text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontFamily: 'monospace',
              }}
            >
              {summary.referral_link}
            </span>

            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--tw-brand-primary)',
                backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 12%, var(--tw-background))',
                padding: '3px 7px',
                borderRadius: '5px',
                flexShrink: 0,
              }}
            >
              {getReferralCode() || 'MITRA'}
            </span>
          </div>

          {/* Dual Action Buttons (Salin & Share ke WA) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                backgroundColor: 'var(--tw-background)',
                color: copied ? 'var(--tw-brand-primary)' : 'var(--tw-text-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {copied ? <Check size={14} color="var(--tw-brand-primary)" /> : <Copy size={14} />}
              <span>{copied ? 'Tersalin' : 'Salin Tautan'}</span>
            </button>

            <a
              href={getWhatsAppShareUrl()}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1.2,
                padding: '9px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--tw-brand-primary)',
                color: 'var(--tw-background)',
                fontSize: '12px',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Share2 size={14} />
              <span>Share ke WA</span>
            </a>
          </div>

          <span
            style={{
              fontSize: '11px',
              color: 'var(--tw-text-muted)',
              lineHeight: 1.3,
            }}
          >
            Komisi otomatis tercatat di sistem setiap calon jamaah mendaftar via link ini.
          </span>
        </section>

        {/* JTBD 3: Alat & Materi Promosi (Grid 2x2 Sesuai Referensi) */}
        <section
          aria-label="Alat dan Materi Promosi"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 2px',
            }}
          >
            <h2
              style={{
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--tw-text-primary)',
                margin: 0,
                fontFamily: 'var(--tw-font-heading)',
              }}
            >
              Alat & Materi Promosi
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
            }}
          >
            {quickMenus.map((item) => (
              <Link
                key={item.id}
                href={
                  item.id === 'script-wa'
                    ? '/agen/script-wa'
                    : item.id === 'sumber-jamaah'
                    ? '/agen/sumber-jamaah'
                    : item.id === 'bank-caption'
                    ? '/agen/bank-caption'
                    : '#'
                }
                style={{
                  backgroundColor: 'var(--tw-background)',
                  borderRadius: '18px',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  padding: '16px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  textDecoration: 'none',
                  minHeight: '130px',
                  transition: 'transform 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '14px',
                    backgroundColor: item.iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'var(--tw-text-primary)',
                      lineHeight: 1.3,
                      fontFamily: 'var(--tw-font-heading)',
                    }}
                  >
                    {item.title}
                  </span>
                  <p
                    style={{
                      fontSize: '11px',
                      color: 'var(--tw-text-secondary)',
                      lineHeight: 1.4,
                      margin: 0,
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* JTBD 4: Performa Jamaah (Fluid Stat Row - Tanpa Kotak Bertingkat) */}
        <section
          aria-label="Performa Jamaah"
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '18px',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.6px',
                  textTransform: 'uppercase',
                  color: 'var(--tw-text-muted)',
                }}
              >
                Pipeline Jamaah
              </span>
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--tw-text-primary)',
                  margin: 0,
                  fontFamily: 'var(--tw-font-heading)',
                }}
              >
                Daftar Jamaah Saya
              </h2>
            </div>

            <Link
              href="/agen/prospek"
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--tw-brand-primary)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <span>Lihat Detail</span>
              <ChevronRight size={14} />
            </Link>
          </div>

          {/* 3 Metric Columns with Soft Subtle Wash (Clean & Elevated) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
            }}
          >
            {/* Baru */}
            <div
              style={{
                backgroundColor: 'var(--tw-page-bg)',
                borderRadius: '12px',
                padding: '12px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: 'var(--tw-text-primary)',
                  lineHeight: 1.1,
                  fontFamily: 'var(--tw-font-heading)',
                }}
              >
                {summary.funnel_ringkasan.baru}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--tw-text-muted)',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--tw-text-secondary)',
                  }}
                >
                  Baru
                </span>
              </div>
            </div>

            {/* Diproses */}
            <div
              style={{
                backgroundColor: 'var(--tw-page-bg)',
                borderRadius: '12px',
                padding: '12px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: 'var(--tw-text-primary)',
                  lineHeight: 1.1,
                  fontFamily: 'var(--tw-font-heading)',
                }}
              >
                {summary.funnel_ringkasan.diproses}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--tw-rating-star)',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--tw-text-secondary)',
                  }}
                >
                  Diproses
                </span>
              </div>
            </div>

            {/* Closing */}
            <div
              style={{
                backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 8%, var(--tw-page-bg))',
                borderRadius: '12px',
                padding: '12px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: 'var(--tw-brand-primary)',
                  lineHeight: 1.1,
                  fontFamily: 'var(--tw-font-heading)',
                }}
              >
                {summary.funnel_ringkasan.closing}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--tw-brand-primary)',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--tw-brand-primary)',
                  }}
                >
                  Closing
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* JTBD 5: Teaser Leaderboard (Hall of Fame) */}
        <section aria-label="Teaser Leaderboard">
          <Link
            href="/agen/leaderboard"
            style={{
              textDecoration: 'none',
              backgroundColor: 'var(--tw-background)',
              borderRadius: '18px',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'transform 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '12px',
                  backgroundColor: 'color-mix(in srgb, var(--tw-rating-star) 15%, var(--tw-background))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Trophy size={18} color="var(--tw-rating-star)" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--tw-text-primary)',
                    lineHeight: 1.2,
                    fontFamily: 'var(--tw-font-heading)',
                  }}
                >
                  Peringkat #{summary.leaderboard_preview.rank_saya} dari {summary.leaderboard_preview.total_agen} Mitra
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--tw-text-muted)',
                    lineHeight: 1.3,
                  }}
                >
                  Lihat ranking & perolehan poin bulan ini
                </span>
              </div>
            </div>

            <div style={{ color: 'var(--tw-text-muted)', display: 'flex', alignItems: 'center' }}>
              <ChevronRight size={16} />
            </div>
          </Link>
        </section>
      </div>

      {/* Navigasi Bawah Agen */}
      <AgentBottomNavbar />
    </MobileContainer>
  );
}
