// Affiliator KlikUmroh portal frame: same app frame as the travel dashboard (sidebar on desktop, bottom
// tab bar on phones), with the affiliator's own four sections. Guards the routes with the affiliator token.
import React, { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, LogOut, Store, UserRound, Wallet } from 'lucide-react';
import { getAffiliatorToken, logoutAffiliator } from '../../services/affiliatorApi';
import brandIcon from '../../assets/icon-klikumroh.svg';
import '../../ui';
import '../../app/app.css';
import './affiliator.css';

const NAV = [
  { to: '/affiliator', label: 'Beranda', icon: Home, end: true },
  { to: '/affiliator/travel', label: 'Travel', icon: Store, end: false },
  { to: '/affiliator/komisi', label: 'Komisi', icon: Wallet, end: false },
  { to: '/affiliator/akun', label: 'Akun', icon: UserRound, end: false },
];

const TITLES: Record<string, string> = {
  '/affiliator': 'Beranda',
  '/affiliator/travel': 'Travel yang saya bawa',
  '/affiliator/komisi': 'Komisi & pencairan',
  '/affiliator/akun': 'Akun & rekening',
};

const signOut = () => {
  void logoutAffiliator().then(() => {
    window.location.href = '/affiliator/login';
  });
};

export const AffiliatorFrame: React.FC = () => {
  const token = getAffiliatorToken();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!token) window.location.href = '/affiliator/login';
  }, [token]);
  if (!token) return null;

  const title = TITLES[pathname.replace(/\/$/, '')] ?? 'Affiliator';
  return (
    <div className="ku ap">
      <aside className="ap-side">
        <Link to="/affiliator" className="ap-logo" aria-label="Affiliator KlikUmroh, ke beranda">
          <img src={brandIcon} alt="" className="ap-logo__icon" width={28} height={28} />
          <span><b>Klik</b>Umroh</span>
        </Link>
        <div className="ap-section">AFFILIATOR</div>
        <nav className="ap-nav" aria-label="Affiliator">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `ap-nav__item${isActive ? ' ap-nav__item--on' : ''}`}>
              <Icon className="ku-icon" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ap-side__bottom">
          <nav className="ap-nav">
            <button type="button" className="ap-nav__item" onClick={signOut}>
              <LogOut className="ku-icon" aria-hidden="true" />
              Keluar
            </button>
          </nav>
        </div>
      </aside>

      <main className="ap-main">
        <header className="ap-head">
          <h1 className="ap-head__title">{title}</h1>
        </header>
        <div className="ap-body">
          <Outlet />
        </div>
      </main>

      <nav className="ap-tabbar" aria-label="Affiliator">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `ap-tabbar__item${isActive ? ' ap-tabbar__item--on' : ''}`}>
            <span className="ap-tabbar__icon">
              <Icon className="ku-icon" aria-hidden="true" />
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
