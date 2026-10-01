// Phone layout (<= 768px): bottom tab bar with Beranda, Prospek, Agen and "Lainnya", which opens a sheet
// with every other menu. Same routes as the sidebar (nav.ts), only arranged like a mobile app.
import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, LayoutGrid, LogOut, UserRound, X } from 'lucide-react';
import { clearAuthSession } from '../services/api';
import { NAV_GROUPS, SETTINGS_ITEM, itemActive, type BadgeKey, type NavItem } from './nav';

const TAB_IDS = ['home', 'prospects', 'agents'];
const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
const TABS = TAB_IDS.map((id) => ALL_ITEMS.find((i) => i.id === id)).filter(Boolean) as NavItem[];

export const MobileNav: React.FC<{ badges: Record<BadgeKey, number>; siteUrl: string | null }> = ({ badges, siteUrl }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const onTab = TABS.some((t) => itemActive(t, pathname));
  const count = (item: NavItem) => (item.badge ? badges[item.badge] : 0);
  // "Lainnya" carries the alerts of the menus inside it (e.g. pending payouts).
  const moreCount = [...ALL_ITEMS, SETTINGS_ITEM].filter((i) => !TAB_IDS.includes(i.id)).reduce((n, i) => n + count(i), 0);

  return (
    <>
      <nav className="ap-tabbar" aria-label="Navigasi utama">
        {TABS.map((item) => {
          const Icon = item.icon;
          const n = count(item);
          return (
            <NavLink key={item.id} to={item.to} end={item.to === '/'} className={`ap-tabbar__item${itemActive(item, pathname) ? ' ap-tabbar__item--on' : ''}`}>
              <span className="ap-tabbar__icon">
                <Icon className="ku-icon" aria-hidden="true" />
                {n > 0 && <span className="ap-tabbar__badge" aria-label={`${n} perlu tindakan`}>{n > 99 ? '99+' : n}</span>}
              </span>
              {item.label}
            </NavLink>
          );
        })}
        <button type="button" className={`ap-tabbar__item${!onTab || open ? ' ap-tabbar__item--on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <span className="ap-tabbar__icon">
            <LayoutGrid className="ku-icon" aria-hidden="true" />
            {moreCount > 0 && <span className="ap-tabbar__badge" aria-label={`${moreCount} perlu tindakan`}>{moreCount > 99 ? '99+' : moreCount}</span>}
          </span>
          Lainnya
        </button>
      </nav>

      {open && (
        <>
          <div className="ku-overlay ap-sheet__overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="ap-sheet" role="dialog" aria-modal="true" aria-label="Menu lainnya">
            <div className="ap-sheet__grip" aria-hidden="true" />
            <div className="ap-sheet__head">
              <span className="ap-sheet__title">Menu</span>
              <button type="button" className="ap-sheet__close" aria-label="Tutup" onClick={() => setOpen(false)}>
                <X className="ku-icon--sm" aria-hidden="true" />
              </button>
            </div>
            <div className="ap-sheet__body">
              {NAV_GROUPS.map((g, gi) => {
                const items = g.items.filter((i) => !TAB_IDS.includes(i.id));
                if (items.length === 0) return null;
                return (
                  <div key={g.label ?? gi} className="ap-sheet__group">
                    {g.label && <div className="ap-sheet__label">{g.label}</div>}
                    {items.map((item) => (
                      <SheetLink key={item.id} item={item} active={itemActive(item, pathname)} count={count(item)} />
                    ))}
                  </div>
                );
              })}
              <div className="ap-sheet__group">
                <div className="ap-sheet__label">AKUN</div>
                <SheetLink item={SETTINGS_ITEM} active={itemActive(SETTINGS_ITEM, pathname)} count={count(SETTINGS_ITEM)} />
                <button type="button" className={`ap-sheet__item${pathname === '/account' ? ' ap-sheet__item--on' : ''}`} onClick={() => navigate('/account')}>
                  <UserRound className="ku-icon" aria-hidden="true" /> Akun saya
                </button>
                {siteUrl && (
                  <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="ap-sheet__item">
                    <ExternalLink className="ku-icon" aria-hidden="true" /> Lihat website
                  </a>
                )}
                <button
                  type="button"
                  className="ap-sheet__item"
                  onClick={() => {
                    clearAuthSession();
                    window.location.href = '/';
                  }}
                >
                  <LogOut className="ku-icon" aria-hidden="true" /> Keluar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

const SheetLink: React.FC<{ item: NavItem; active: boolean; count: number }> = ({ item, active, count }) => {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} className={`ap-sheet__item${active ? ' ap-sheet__item--on' : ''}`}>
      <Icon className="ku-icon" aria-hidden="true" />
      {item.label}
      {count > 0 && <span className="ap-badge" aria-label={`${count} perlu tindakan`}>{count}</span>}
    </NavLink>
  );
};
