'use client';

import React, { useLayoutEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Trophy, User } from 'lucide-react';
import './AgentBottomNavbar.css';

// Next keeps the scroll position when the target page is still partly in view, so a tab switch from the
// middle of a long page would open the next tab in the middle too. A tab tap should always start at the top,
// but scrolling on the tap itself makes the old page visibly jump up before the new one appears. So the tap
// only leaves a mark, and the bar of the page that mounts next (each page renders its own) scrolls to the top
// before the first paint. Back/forward navigation never sets the mark, so the browser keeps restoring it.
let tabTapPending = false;

const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

export const AgentBottomNavbar: React.FC = () => {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (!tabTapPending) return;
    tabTapPending = false;
    scrollToTop();
  }, []);

  // Tapping the tab of the page already open does not remount anything, so scroll right away.
  const onTabTap = (href: string) => () => {
    if (pathname === href) scrollToTop();
    else {
      tabTapPending = true;
      // A tap that never leads to a new page must not scroll some later, unrelated page.
      window.setTimeout(() => {
        tabTapPending = false;
      }, 3000);
    }
  };

  const isBerandaActive = pathname === '/agen/dashboard';
  const isJamaahActive = pathname.startsWith('/agen/jamaah') || pathname.startsWith('/agen/prospek');
  const isLeaderboardActive = pathname.startsWith('/agen/leaderboard');
  const isProfilActive =
    pathname.startsWith('/agen/profil') ||
    pathname.startsWith('/agen/sumber-jamaah') ||
    pathname.startsWith('/agen/script-wa') ||
    pathname.startsWith('/agen/bank-caption') ||
    pathname.startsWith('/agen/riwayat-komisi');

  return (
    <div className="agent-bottom-nav-wrap">
      <nav className="agent-bottom-nav" aria-label="Navigasi Bawah Agen">
        <Link
          href="/agen/dashboard"
          onClick={onTabTap('/agen/dashboard')}
          className={`agent-bottom-nav__item ${isBerandaActive ? 'agent-bottom-nav__item--active' : ''}`}
        >
          <span className="agent-bottom-nav__icon">
            <Home size={20} />
          </span>
          <span className="agent-bottom-nav__label">Beranda</span>
        </Link>

        <Link
          href="/agen/jamaah"
          onClick={onTabTap('/agen/jamaah')}
          className={`agent-bottom-nav__item ${isJamaahActive ? 'agent-bottom-nav__item--active' : ''}`}
        >
          <span className="agent-bottom-nav__icon">
            <Users size={20} />
          </span>
          <span className="agent-bottom-nav__label">Jamaah</span>
        </Link>

        <Link
          href="/agen/leaderboard"
          onClick={onTabTap('/agen/leaderboard')}
          className={`agent-bottom-nav__item ${isLeaderboardActive ? 'agent-bottom-nav__item--active' : ''}`}
        >
          <span className="agent-bottom-nav__icon">
            <Trophy size={20} />
          </span>
          <span className="agent-bottom-nav__label">Leaderboard</span>
        </Link>

        <Link
          href="/agen/profil"
          onClick={onTabTap('/agen/profil')}
          className={`agent-bottom-nav__item ${isProfilActive ? 'agent-bottom-nav__item--active' : ''}`}
        >
          <span className="agent-bottom-nav__icon">
            <User size={20} />
          </span>
          <span className="agent-bottom-nav__label">Profil</span>
        </Link>
      </nav>
    </div>
  );
};
