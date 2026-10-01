import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, BellOff } from 'lucide-react';
import { API_BASE, getStoredToken } from '../services/api';
import { initAudioUnlock, playNotificationSound } from '../utils/notificationSound';
import './NotificationDropdown.css';

export interface NotificationItem {
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

export interface NotificationDropdownProps {
  apiPrefix?: string; // Default: '/api/dashboard/notifications'
  tokenGetter?: () => string | null;
  className?: string;
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

    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return '';
  }
};

const LAST_NOTIF_KEY = 'klikumroh_last_notif_id';

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  apiPrefix = '/api/dashboard/notifications',
  tokenGetter = getStoredToken,
  className = '',
}) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [isRinging, setIsRinging] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const prevLatestIdRef = useRef<number | null>(null);

  // Initialize Web Audio Autoplay Unlock
  useEffect(() => {
    const cleanup = initAudioUnlock();
    return cleanup;
  }, []);

  const fetchNotifications = useCallback(async () => {
    const token = tokenGetter();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}${apiPrefix}?limit=20`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const items: NotificationItem[] = data.notifications || [];
        const unread: number = data.unread_count || 0;

        setNotifications(items);
        setUnreadCount(unread);

        const currentLatestId = items.length > 0 ? items[0].id : null;

        // Baca lastSeenId dari sessionStorage agar konsisten lintas reload
        const savedIdStr = sessionStorage.getItem(LAST_NOTIF_KEY);
        const savedId = savedIdStr ? parseInt(savedIdStr, 10) : null;

        if (savedId !== null && currentLatestId !== null && currentLatestId > savedId) {
          // Ada notifikasi baru masuk (bahkan jika user baru saja reload halaman)!
          sessionStorage.setItem(LAST_NOTIF_KEY, String(currentLatestId));
          prevLatestIdRef.current = currentLatestId;
          playNotificationSound();
          setIsRinging(true);
          setTimeout(() => setIsRinging(false), 1200);
        } else if (savedId === null) {
          // Buka sesi pertama kali: simpan ID awal tanpa membunyikan suara
          if (currentLatestId !== null) {
            sessionStorage.setItem(LAST_NOTIF_KEY, String(currentLatestId));
          }
          prevLatestIdRef.current = currentLatestId;
        } else if (
          currentLatestId !== null &&
          prevLatestIdRef.current !== null &&
          currentLatestId > prevLatestIdRef.current
        ) {
          sessionStorage.setItem(LAST_NOTIF_KEY, String(currentLatestId));
          prevLatestIdRef.current = currentLatestId;
          playNotificationSound();
          setIsRinging(true);
          setTimeout(() => setIsRinging(false), 1200);
        }
      }
    } catch {
      // Silently ignore network glitches in background polling
    }
  }, [apiPrefix, tokenGetter]);

  useEffect(() => {
    fetchNotifications();

    // Polling setiap 5 detik agar notifikasi terasa real-time
    const timer = setInterval(fetchNotifications, 5000);

    // Ambil data instan begitu user beralih tab kembali ke dashboard
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
      }
    };
    const handleFocus = () => {
      fetchNotifications();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (item: NotificationItem) => {
    if (!item.read_at) {
      const token = tokenGetter();
      if (token) {
        try {
          await fetch(`${API_BASE}${apiPrefix}/${item.id}/read`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const nowStr = new Date().toISOString();
          setNotifications((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, read_at: nowStr } : n))
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch {
          // ignore
        }
      }
    }

    setIsOpen(false);
    if (item.link_url) {
      navigate(item.link_url);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    const token = tokenGetter();
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}${apiPrefix}/read-all`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const nowStr = new Date().toISOString();
        setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || nowStr })));
        setUnreadCount(0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`db-notif-dropdown ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className={`db-notif-dropdown__trigger ${isOpen ? 'db-notif-dropdown__trigger--active' : ''} ${isRinging ? 'db-notif-dropdown__trigger--ring' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifikasi (${unreadCount} belum dibaca)`}
        aria-expanded={isOpen}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="db-notif-dropdown__badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="db-notif-dropdown__backdrop"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="db-notif-dropdown__popover">
            <div className="db-notif-dropdown__header">
              <h3 className="db-notif-dropdown__title">Notifikasi</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="db-notif-dropdown__mark-all-btn"
                  onClick={handleMarkAllRead}
                  disabled={loading}
                >
                  <CheckCheck size={14} />
                  <span>Tandai dibaca</span>
                </button>
              )}
            </div>

            <div className="db-notif-dropdown__list">
              {notifications.length === 0 ? (
                <div className="db-notif-dropdown__empty">
                  <BellOff size={28} />
                  <p className="db-notif-dropdown__empty-text">Belum ada notifikasi</p>
                </div>
              ) : (
                notifications.map((item) => {
                  const isUnread = !item.read_at;
                  return (
                    <div
                      key={item.id}
                      className={`db-notif-dropdown__item ${isUnread ? 'db-notif-dropdown__item--unread' : ''}`}
                      onClick={() => handleMarkAsRead(item)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="db-notif-dropdown__item-content">
                        <h4 className="db-notif-dropdown__item-title">{item.title}</h4>
                        <p className="db-notif-dropdown__item-body">{item.body}</p>
                        <span className="db-notif-dropdown__item-time">
                          {formatRelativeTime(item.created_at)}
                        </span>
                      </div>
                      {isUnread && <span className="db-notif-dropdown__unread-dot" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

