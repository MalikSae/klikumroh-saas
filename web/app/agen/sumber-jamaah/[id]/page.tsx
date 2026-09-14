'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  CheckCircle2,
  Circle,
  MessageSquare,
} from 'lucide-react';
import { MobileContainer } from '../../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../../components/AgentBottomNavbar';
import sumberDataRaw from '../../../../data/sumber-jamaah.json';

interface SumberJamaahItem {
  id: number;
  kategori: string;
  sumber: string;
  kenapa_dicoba: string;
  cara_mulai: string;
  contoh: string;
}

const STORAGE_KEY = 'klikumroh_agent_sumber_completed';

export default function SumberJamaahDetailPage() {
  const router = useRouter();
  const params = useParams();

  const id = Number(params?.id);
  const item = (sumberDataRaw as SumberJamaahItem[]).find((s) => s.id === id);

  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  useEffect(() => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    // Auth check
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

    // Load completed state for this item
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setIsCompleted(parsed.includes(id));
      }
    } catch {
      // Ignore
    }
  }, [id, router]);

  const toggleCompleted = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed: number[] = saved ? JSON.parse(saved) : [];
      const updated = parsed.includes(id)
        ? parsed.filter((itemVal) => itemVal !== id)
        : [...parsed, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setIsCompleted(updated.includes(id));
    } catch {
      // Ignore
    }
  };

  const handleCopy = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const totalItems = (sumberDataRaw as SumberJamaahItem[]).length;
  const prevId = id > 1 ? id - 1 : null;
  const nextId = id < totalItems ? id + 1 : null;

  // Not found state
  if (!item) {
    return (
      <MobileContainer>
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
              borderRadius: '8px',
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <span
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--tw-text-primary)',
              fontFamily: 'var(--tw-font-heading)',
            }}
          >
            Sumber Jamaah
          </span>
        </header>
        <div
          style={{
            backgroundColor: 'var(--tw-page-bg)',
            minHeight: 'calc(100vh - 62px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            textAlign: 'center',
            padding: '24px 16px',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tw-text-primary)', margin: 0 }}>
            Sumber Tidak Ditemukan
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--tw-text-muted)', margin: 0 }}>
            Data sumber yang Anda cari tidak tersedia.
          </p>
          <Link
            href="/agen/sumber-jamaah"
            style={{
              marginTop: '4px',
              padding: '9px 20px',
              borderRadius: '6px',
              backgroundColor: 'var(--tw-brand-primary)',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Kembali ke Daftar
          </Link>
        </div>
        <AgentBottomNavbar />
      </MobileContainer>
    );
  }

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
          <span
            style={{
              fontSize: '11px',
              color: 'var(--tw-text-muted)',
              fontWeight: 600,
              display: 'block',
              lineHeight: 1.2,
            }}
          >
            99 Sumber Jamaah #{String(item.id).padStart(2, '0')} · {item.kategori}
          </span>
          <h1
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--tw-text-primary)',
              margin: 0,
              fontFamily: 'var(--tw-font-heading)',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.sumber}
          </h1>
        </div>

        {/* Toggle Selesai — compact, in header */}
        <button
          type="button"
          onClick={toggleCompleted}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 10px',
            borderRadius: '6px',
            border: isCompleted
              ? '1px solid var(--tw-brand-primary)'
              : '1px solid rgba(0,0,0,0.1)',
            backgroundColor: isCompleted
              ? 'color-mix(in srgb, var(--tw-brand-primary) 10%, var(--tw-background))'
              : 'var(--tw-background)',
            color: isCompleted ? 'var(--tw-brand-primary)' : 'var(--tw-text-muted)',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {isCompleted ? (
            <>
              <CheckCircle2 size={14} color="var(--tw-brand-primary)" />
              <span>Dicoba</span>
            </>
          ) : (
            <>
              <Circle size={14} />
              <span>Tandai</span>
            </>
          )}
        </button>
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
        {/* Detail Card */}
        <div
          style={{
            backgroundColor: 'var(--tw-background)',
            borderRadius: '12px',
            border: isCompleted
              ? '1px solid color-mix(in srgb, var(--tw-brand-primary) 30%, transparent)'
              : '1px solid rgba(0,0,0,0.06)',
            padding: '18px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Card Top */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--tw-brand-primary)',
                  backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 10%, var(--tw-background))',
                  padding: '2px 7px',
                  borderRadius: '4px',
                }}
              >
                #{String(item.id).padStart(2, '0')}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--tw-text-muted)', fontWeight: 600 }}>
                {item.kategori}
              </span>
            </div>
            <h2
              style={{
                fontSize: '20px',
                fontWeight: 800,
                color: 'var(--tw-text-primary)',
                margin: 0,
                fontFamily: 'var(--tw-font-heading)',
                lineHeight: 1.25,
              }}
            >
              {item.sumber}
            </h2>
          </div>

          {/* Kenapa Layak Dicoba */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--tw-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Kenapa Layak Dicoba?
            </span>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--tw-text-secondary)',
                margin: 0,
                lineHeight: 1.65,
              }}
            >
              {item.kenapa_dicoba}
            </p>
          </div>

          {/* Langkah Pendekatan */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--tw-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Langkah Pendekatan
            </span>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--tw-text-primary)',
                margin: 0,
                lineHeight: 1.65,
                backgroundColor: 'var(--tw-page-bg)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              {item.cara_mulai}
            </p>
          </div>

          {/* Contoh Obrolan */}
          <div
            style={{
              backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 5%, var(--tw-background))',
              borderRadius: '10px',
              border: '1px solid color-mix(in srgb, var(--tw-brand-primary) 18%, transparent)',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageSquare size={14} color="var(--tw-brand-primary)" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tw-brand-primary)' }}>
                  Contoh Pembuka Obrolan
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(item.contoh)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--tw-brand-primary)',
                  backgroundColor: 'var(--tw-background)',
                  color: 'var(--tw-brand-primary)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title="Salin kalimat pembuka obrolan"
              >
                {isCopied ? (
                  <>
                    <Check size={13} color="var(--tw-brand-primary)" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>Salin</span>
                  </>
                )}
              </button>
            </div>

            <p
              style={{
                fontSize: '14px',
                color: 'var(--tw-text-primary)',
                margin: 0,
                lineHeight: 1.65,
                fontStyle: 'italic',
                fontWeight: 500,
              }}
            >
              &ldquo;{item.contoh}&rdquo;
            </p>
          </div>
        </div>

        {/* Prev / Next Pager */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          {prevId ? (
            <Link
              href={`/agen/sumber-jamaah/${prevId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'var(--tw-background)',
                border: '1px solid rgba(0,0,0,0.08)',
                color: 'var(--tw-text-primary)',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <ChevronLeft size={16} />
              <span>Sebelumnya</span>
            </Link>
          ) : (
            <div />
          )}

          <Link
            href="/agen/sumber-jamaah"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--tw-text-muted)',
              textDecoration: 'none',
            }}
          >
            Daftar Sumber
          </Link>

          {nextId ? (
            <Link
              href={`/agen/sumber-jamaah/${nextId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'var(--tw-background)',
                border: '1px solid rgba(0,0,0,0.08)',
                color: 'var(--tw-text-primary)',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <span>Berikutnya</span>
              <ChevronRight size={16} />
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
