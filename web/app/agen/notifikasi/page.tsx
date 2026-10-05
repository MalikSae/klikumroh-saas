'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Bell, BellOff, CheckCheck, ChevronRight } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import { jakartaDateLabel } from '../../../lib/jakartaTime';

interface NotificationItem {
  id: number;
  tenant_id?: number | null;
  recipient_type: string;
  recipient_id: number;
  type: string;
  title: string;
  body: string;
  link_url?: string | null;
  read_at?: string | null;
  created_at: string;
}

const formatRelativeTime = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSec < 60) return 'Baru saja';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} menit lalu`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Kemarin';
    if (diffDays < 7) return `${diffDays} hari lalu`;

    return jakartaDateLabel(d, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

const POLL_FAILED_NOTICE = 'Gagal memperbarui notifikasi. Daftar di bawah mungkin belum terbaru.';
const MARK_READ_FAILED_NOTICE = 'Gagal menandai notifikasi sebagai dibaca. Coba lagi.';

export default function AgenNotifikasiPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  // Only the first load shows the loading state; background polls (interval/focus/visibility) update the
  // list in place so it never blanks out and the scroll position stays put.
  const [loading, setLoading] = useState<boolean>(true);
  // Full error panel: only when the first load failed and there is no list to show yet.
  const [error, setError] = useState<string | null>(null);
  // Small non-blocking notice: a background poll or a mark-as-read failed; the existing list stays.
  const [notice, setNotice] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const inFlightRef = useRef(false);
  // Items marked read locally whose read state the server has not reported yet. A poll that started
  // before the PATCH landed would otherwise flip them back to unread.
  const pendingReadRef = useRef<Map<number, string>>(new Map());

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }
    // focus + visibilitychange fire together; skip a poll while one is still running.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const res = await fetch('/api/agent/notifications?limit=50', {
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
        throw new Error('Gagal memuat notifikasi');
      }

      const data = await res.json();
      const pending = pendingReadRef.current;
      let unread: number = data.unread_count || 0;
      const list: NotificationItem[] = (data.notifications || []).map((n: NotificationItem) => {
        const localReadAt = pending.get(n.id);
        if (localReadAt === undefined) return n;
        if (n.read_at) {
          pending.delete(n.id); // server confirmed
          return n;
        }
        unread -= 1;
        return { ...n, read_at: localReadAt };
      });
      setNotifications(list);
      setUnreadCount(Math.max(0, unread));
      setError(null);
      setNotice((prev) => (prev === POLL_FAILED_NOTICE ? null : prev));
      hasLoadedRef.current = true;
    } catch (err: unknown) {
      const message = (err instanceof Error && err.message) || 'Terjadi kesalahan';
      if (hasLoadedRef.current) {
        setNotice(POLL_FAILED_NOTICE);
      } else {
        setError(message);
      }
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 5000);
    const handleVis = () => {
      if (document.visibilityState === 'visible') fetchNotifications();
    };
    document.addEventListener('visibilitychange', handleVis);
    window.addEventListener('focus', fetchNotifications);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVis);
      window.removeEventListener('focus', fetchNotifications);
    };
  }, [fetchNotifications]);

  const handleMarkAsRead = async (item: NotificationItem) => {
    if (!item.read_at) {
      const token = localStorage.getItem('agent_token');
      if (token) {
        // Optimistic: mark read now, roll back if the server refuses or the request fails.
        const nowStr = new Date().toISOString();
        pendingReadRef.current.set(item.id, nowStr);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, read_at: nowStr } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));

        let ok = false;
        try {
          const res = await fetch(`/api/agent/notifications/${item.id}/read`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          ok = res.ok;
        } catch {
          ok = false;
        }

        if (!ok) {
          pendingReadRef.current.delete(item.id);
          setNotifications((prev) =>
            prev.map((n) => (n.id === item.id && n.read_at === nowStr ? { ...n, read_at: null } : n))
          );
          setUnreadCount((prev) => prev + 1);
          setNotice(MARK_READ_FAILED_NOTICE);
        } else {
          setNotice((prev) => (prev === MARK_READ_FAILED_NOTICE ? null : prev));
        }
      }
    }

    if (item.link_url) {
      router.push(item.link_url);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    const token = localStorage.getItem('agent_token');
    if (!token) return;

    try {
      const res = await fetch('/api/agent/notifications/read-all', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const nowStr = new Date().toISOString();
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, read_at: n.read_at || nowStr }))
        );
        setUnreadCount(0);
      }
    } catch {
      // ignore
    }
  };

  return (
    <MobileContainer>
      {/* Sticky Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backgroundColor: 'var(--tw-background)',
          borderBottom: '1px solid var(--tw-hairline)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <h1
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--tw-text-primary)',
              margin: 0,
              fontFamily: 'var(--tw-font-heading)',
            }}
          >
            Notifikasi
          </h1>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px 8px',
              cursor: 'pointer',
              color: 'var(--tw-brand-primary)',
              fontSize: '12px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '6px',
            }}
          >
            <CheckCheck size={15} />
            <span>Tandai Semua Dibaca</span>
          </button>
        )}
      </header>

      {/* Main Content */}
      <div
        style={{
          backgroundColor: 'var(--tw-page-bg)',
          minHeight: 'calc(100vh - 62px)',
          padding: '16px 16px calc(80px + env(safe-area-inset-bottom)) 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {notice && !loading && !error && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              fontSize: '13px',
              lineHeight: 1.5,
              color: 'var(--tw-text-secondary)',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{notice}</span>
          </div>
        )}
        {loading ? (
          <div
            style={{
              padding: '48px 16px',
              textAlign: 'center',
              color: 'var(--tw-text-muted)',
              fontSize: '14px',
            }}
          >
            Memuat notifikasi...
          </div>
        ) : error ? (
          <div
            style={{
              padding: '40px 16px',
              textAlign: 'center',
              color: 'var(--tw-text-secondary)',
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        ) : notifications.length === 0 ? (
          <div
            style={{
              backgroundColor: 'var(--tw-background)',
              borderRadius: '12px',
              border: '1px solid var(--tw-hairline)',
              padding: '48px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'color-mix(in srgb, var(--tw-brand-primary) 10%, var(--tw-background))',
                color: 'var(--tw-brand-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BellOff size={24} />
            </div>
            <h3
              style={{
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--tw-text-primary)',
                margin: 0,
                fontFamily: 'var(--tw-font-heading)',
              }}
            >
              Belum Ada Notifikasi
            </h3>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--tw-text-muted)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Pemberitahuan pendaftaran, komisi, dan pencairan dana Anda akan muncul di sini.
            </p>
          </div>
        ) : (
          notifications.map((item) => {
            const isUnread = !item.read_at;
            return (
              <div
                key={item.id}
                onClick={() => handleMarkAsRead(item)}
                role="button"
                tabIndex={0}
                style={{
                  backgroundColor: 'var(--tw-background)',
                  borderRadius: '12px',
                  border: isUnread
                    ? '1px solid color-mix(in srgb, var(--tw-brand-primary) 30%, transparent)'
                    : '1px solid var(--tw-hairline)',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    backgroundColor: isUnread
                      ? 'color-mix(in srgb, var(--tw-brand-primary) 12%, var(--tw-background))'
                      : 'var(--tw-surface-tint)',
                    color: isUnread ? 'var(--tw-brand-primary)' : 'var(--tw-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Bell size={18} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      marginBottom: '4px',
                    }}
                  >
                    <h4
                      style={{
                        fontSize: '14px',
                        fontWeight: isUnread ? 700 : 600,
                        color: 'var(--tw-text-primary)',
                        margin: 0,
                        fontFamily: 'var(--tw-font-heading)',
                        lineHeight: 1.3,
                      }}
                    >
                      {item.title}
                    </h4>
                    {isUnread && (
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--tw-brand-primary)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>

                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--tw-text-secondary)',
                      margin: '0 0 6px 0',
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.body}
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--tw-text-muted)',
                      }}
                    >
                      {formatRelativeTime(item.created_at)}
                    </span>
                    {item.link_url && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '11px',
                          color: 'var(--tw-brand-primary)',
                          fontWeight: 600,
                        }}
                      >
                        Lihat <ChevronRight size={12} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
