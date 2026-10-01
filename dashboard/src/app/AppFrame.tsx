// Application frame of the travel dashboard: sidebar on the frame, white rounded main panel with header.
// Approved prototype: dashboard/design/prototype.html.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsUpDown, ExternalLink, LogOut, Menu, UserRound } from 'lucide-react';
import {
  clearAuthSession,
  fetchDashboardAgents,
  fetchPayoutRequests,
  fetchProspectSummary,
  fetchTenantProfile,
  fetchTenantSubscription,
  getFullImageUrl,
  getStoredTravelName,
  getStoredUser,
  type TenantSubscriptionInfo,
} from '../services/api';
import { AlertTriangle } from 'lucide-react';
import { Banner, Button, IconButton, SearchField } from '../ui';
import { subscriptionNotice } from './subscriptionNotice';
import { NAV_GROUPS, SETTINGS_ITEM, itemActive, titleForPath, type BadgeKey, type NavItem } from './nav';
import { NotificationMenu } from './NotificationMenu';
import { MobileNav } from './MobileNav';
import brandIcon from '../assets/icon-klikumroh.svg';
import './app.css';

/* ---------- Frame context: page title, badges, subscription ---------- */
interface FrameCtx {
  setTitle: (t: string | null) => void;
  refreshBadges: () => void;
  /** Reloads the travel name and icon shown in the header (after they change in Pengaturan or Website). */
  refreshTravel: () => void;
  subscription: TenantSubscriptionInfo | null;
}
const FrameContext = createContext<FrameCtx | null>(null);


/** Pages set their own header title (e.g. a prospect's name); otherwise the nav label is used. */
export function usePageTitle(title: string | null) {
  const ctx = useContext(FrameContext);
  useEffect(() => {
    ctx?.setTitle(title);
    return () => ctx?.setTitle(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);
}
export const useFrame = () => useContext(FrameContext);

/** Public website of the travel (subdomain). */
export function publicSiteUrl(slug?: string | null): string | null {
  if (!slug) return null;
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return local ? `http://${slug}.localhost:3000` : `https://${slug}.klikumroh.id`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'KU';

type Badges = Record<BadgeKey, number>;

const NavItemLink: React.FC<{ item: NavItem; path: string; badges: Badges }> = ({ item, path, badges }) => {
  const Icon = item.icon;
  const count = item.badge ? badges[item.badge] : 0;
  return (
    <NavLink to={item.to} end={item.to === '/'} className={`ap-nav__item${itemActive(item, path) ? ' ap-nav__item--on' : ''}`}>
      <Icon className="ku-icon" aria-hidden="true" />
      {item.label}
      {count > 0 && <span className="ap-badge" aria-label={`${count} perlu tindakan`}>{count}</span>}
    </NavLink>
  );
};

const UserMenu: React.FC<{ name: string; role: string }> = ({ name, role }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="ap-pop ap-pop--up" ref={ref}>
      <button type="button" className="ap-user" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="ap-avatar" aria-hidden="true">{initials(name)}</span>
        <span className="ap-user__text">
          <span className="ap-user__name">{name}</span>
          <span className="ap-user__role">{role}</span>
        </span>
        <ChevronsUpDown className="ku-icon--sm ap-user__chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="ap-pop__panel ap-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate('/account'); }}>
            <UserRound className="ku-icon--sm" aria-hidden="true" /> Akun saya
          </button>
          <button type="button" role="menuitem" onClick={() => { clearAuthSession(); window.location.href = '/'; }}>
            <LogOut className="ku-icon--sm" aria-hidden="true" /> Keluar
          </button>
        </div>
      )}
    </div>
  );
};

export const AppFrame: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [title, setTitle] = useState<string | null>(null);
  const [sub, setSub] = useState<TenantSubscriptionInfo | null>(null);
  const [badges, setBadges] = useState<Badges>({ prospects: 0, agents: 0, payouts: 0 });
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const user = getStoredUser();
  const [travelName, setTravelName] = useState(getStoredTravelName());
  const [travelIcon, setTravelIcon] = useState<string | null>(null);

  const refreshTravel = React.useCallback(() => {
    fetchTenantProfile()
      .then((p) => {
        if (p.name) setTravelName(p.name);
        setTravelIcon(p.brand_icon_url || null);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshTravel();
  }, [refreshTravel]);

  const refreshBadges = React.useCallback(() => {
    Promise.all([
      fetchProspectSummary().catch(() => null),
      fetchDashboardAgents('pending').catch(() => []),
      fetchPayoutRequests('pending').catch(() => []),
    ]).then(([summary, agents, payouts]) =>
      setBadges({ prospects: summary?.baru ?? 0, agents: agents.length, payouts: payouts.length }),
    );
  }, []);

  useEffect(() => {
    fetchTenantSubscription().then(setSub).catch(() => {});
  }, []);
  useEffect(() => {
    refreshBadges();
    setMobileNav(false);
  }, [location.pathname, refreshBadges]);

  const siteUrl = publicSiteUrl(sub?.tenant_slug);
  const heading = title ?? titleForPath(location.pathname);
  // Urgent subscription states are shown on every page; the dashboard shows them in its own strip and
  // the billing pages show the full status, so neither repeats this banner.
  const notice = subscriptionNotice(sub);
  const pageNotice =
    notice && notice.tone !== 'accent' && location.pathname !== '/' && !location.pathname.startsWith('/settings') ? notice : null;

  return (
    <FrameContext.Provider value={{ setTitle, refreshBadges, refreshTravel, subscription: sub }}>
      <div className="ku ap">
        {mobileNav && <div className="ku-overlay ap-mobile-overlay" onClick={() => setMobileNav(false)} aria-hidden="true" />}
        <aside className={`ap-side${mobileNav ? ' ap-side--open' : ''}`}>
          <Link to="/" className="ap-logo" aria-label="KlikUmroh, ke dashboard">
            <img src={brandIcon} alt="" className="ap-logo__icon" width={28} height={28} />
            <span><b>Klik</b>Umroh</span>
          </Link>

          {NAV_GROUPS.map((g, i) => (
            <div key={g.label ?? i} className="ap-group">
              {g.label && <div className="ap-section">{g.label}</div>}
              <nav className="ap-nav" aria-label={g.label ?? 'Utama'}>
                {g.items.map((item) => (
                  <NavItemLink key={item.id} item={item} path={location.pathname} badges={badges} />
                ))}
              </nav>
            </div>
          ))}

          <div className="ap-side__bottom">
            <nav className="ap-nav">
              {siteUrl && (
                <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="ap-nav__item">
                  <ExternalLink className="ku-icon" aria-hidden="true" />
                  Lihat website
                </a>
              )}
              <NavItemLink item={SETTINGS_ITEM} path={location.pathname} badges={badges} />
            </nav>
            <UserMenu name={user?.name || 'Admin'} role="Admin travel" />
          </div>
        </aside>

        <main className="ap-main">
          <header className="ap-head">
            <IconButton label="Buka menu" className="ap-head__menu" onClick={() => setMobileNav(true)}>
              <Menu className="ku-icon" />
            </IconButton>
            <h1 className="ap-head__title">{heading}</h1>
            <div className="ap-head__search">
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Cari prospek (nama atau nomor WhatsApp)"
                onEnter={() => query.trim() && navigate(`/prospects?q=${encodeURIComponent(query.trim())}`)}
              />
            </div>
            <div className="ap-head__right">
              <NotificationMenu />
              <Link to="/settings" className="ap-travel" title="Langganan travel">
                {travelIcon ? (
                  <img className="ap-travel__icon" src={getFullImageUrl(travelIcon)} alt="" onError={() => setTravelIcon(null)} />
                ) : (
                  <span className="ap-travel__mark" aria-hidden="true">{initials(travelName)}</span>
                )}
                <span className="ap-travel__name">{travelName}</span>
              </Link>
            </div>
          </header>
          <div className="ap-body">
            {pageNotice && (
              <div className="ap-notice">
                <Banner tone={pageNotice.tone === 'danger' ? 'danger' : 'warning'} icon={<AlertTriangle className="ku-icon--sm" />} action={<Button size="sm" to={pageNotice.to}>{pageNotice.action}</Button>}>
                  <b>{pageNotice.title}.</b> {pageNotice.text}
                </Banner>
              </div>
            )}
            <Outlet />
          </div>
        </main>
        <MobileNav badges={badges} siteUrl={siteUrl} />
      </div>
    </FrameContext.Provider>
  );
};
