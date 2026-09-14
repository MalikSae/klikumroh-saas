'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Trophy, User } from 'lucide-react';
import './AgentBottomNavbar.css';

export const AgentBottomNavbar: React.FC = () => {
  const pathname = usePathname();

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
          className={`agent-bottom-nav__item ${isBerandaActive ? 'agent-bottom-nav__item--active' : ''}`}
        >
          <span className="agent-bottom-nav__icon">
            <Home size={20} />
          </span>
          <span className="agent-bottom-nav__label">Beranda</span>
        </Link>

        <Link
          href="/agen/jamaah"
          className={`agent-bottom-nav__item ${isJamaahActive ? 'agent-bottom-nav__item--active' : ''}`}
        >
          <span className="agent-bottom-nav__icon">
            <Users size={20} />
          </span>
          <span className="agent-bottom-nav__label">Jamaah</span>
        </Link>

        <Link
          href="/agen/leaderboard"
          className={`agent-bottom-nav__item ${isLeaderboardActive ? 'agent-bottom-nav__item--active' : ''}`}
        >
          <span className="agent-bottom-nav__icon">
            <Trophy size={20} />
          </span>
          <span className="agent-bottom-nav__label">Leaderboard</span>
        </Link>

        <Link
          href="/agen/profil"
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
