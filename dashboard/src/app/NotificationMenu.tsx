// Notification bell of the header: unread dot, latest 20 notifications, mark read, open the linked page.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, Handshake, ReceiptText, UserPlus, Wallet, type LucideIcon } from 'lucide-react';
import { API_BASE, getStoredToken } from '../services/api';
import { playNotificationSound } from '../utils/notificationSound';
import { IconButton, fmtAgo } from '../ui';

interface Item {
  id: number;
  type?: string;
  title: string;
  body: string;
  link_url?: string | null;
  read_at?: string | null;
  created_at: string;
}

const PREFIX = '/api/dashboard/notifications';

/** Icon per notification type, so the list can be scanned without reading every title. */
const iconFor = (type = ''): LucideIcon =>
  type.startsWith('prospect') ? UserPlus : type.startsWith('agent') ? Handshake : type.startsWith('payout') ? Wallet : type.startsWith('subscription') || type.startsWith('payment') ? ReceiptText : Bell;
const LAST_SEEN_KEY = 'klikumroh_last_notification_id';

export const NotificationMenu: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}${PREFIX}?limit=20`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const list: Item[] = data.notifications || [];
      setItems(list);
      setUnread(data.unread_count || 0);
      // Sound only for a notification that arrived after the last one this browser session has seen.
      const latest = list[0]?.id;
      const seen = Number(sessionStorage.getItem(LAST_SEEN_KEY) || 0);
      if (latest && seen && latest > seen) playNotificationSound();
      if (latest) sessionStorage.setItem(LAST_SEEN_KEY, String(Math.max(latest, seen)));
    } catch {
      /* the bell simply stays as it is */
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const call = (path: string) => {
    const token = getStoredToken();
    return token ? fetch(`${API_BASE}${PREFIX}${path}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve();
  };

  const openItem = async (it: Item) => {
    if (!it.read_at) {
      await call(`/${it.id}/read`).catch(() => {});
      setItems((prev) => prev.map((n) => (n.id === it.id ? { ...n, read_at: new Date().toISOString() } : n)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (it.link_url) navigate(it.link_url);
  };

  const markAll = async () => {
    await call('/read-all').catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnread(0);
  };

  return (
    <div className="ap-pop" ref={ref}>
      <IconButton label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'} dot={unread > 0} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Bell className="ku-icon" />
      </IconButton>
      {open && (
        <div className="ap-pop__panel ap-notif" role="dialog" aria-label="Notifikasi">
          <div className="ap-notif__head">
            <span className="ap-notif__heading">
              Notifikasi
              {unread > 0 && <span className="ap-notif__count">{unread} baru</span>}
            </span>
            {unread > 0 && (
              <button type="button" className="ap-link" onClick={markAll}>Tandai semua dibaca</button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="ap-notif__empty">
              <BellOff className="ku-icon" aria-hidden="true" />
              Belum ada notifikasi.
            </div>
          ) : (
            <ul className="ap-notif__list">
              {items.map((it) => {
                const Icon = iconFor(it.type);
                return (
                  <li key={it.id}>
                    <button type="button" className={`ap-notif__item${it.read_at ? '' : ' ap-notif__item--unread'}`} onClick={() => openItem(it)}>
                      <Icon className="ku-icon--sm ap-notif__icon" aria-hidden="true" />
                      <span className="ap-notif__text">
                        <span className="ap-notif__top">
                          <span className="ap-notif__title">{it.title}</span>
                          <span className="ap-notif__when">{fmtAgo(it.created_at)}</span>
                        </span>
                        <span className="ap-notif__body">{it.body}</span>
                      </span>
                      {!it.read_at && <span className="ap-notif__dot" aria-label="Belum dibaca" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
