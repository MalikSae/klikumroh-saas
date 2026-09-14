'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Package, MessageCircle, User } from 'lucide-react';
import './BottomNavbar.css';

export interface BottomNavbarProps {
  onOpenMenu?: () => void;
  // TODO: logic kondisional referral vs default menyusul
  waNumber?: string;
  loginHref?: string;
}

export const BottomNavbar: React.FC<BottomNavbarProps> = ({
  onOpenMenu,
  waNumber = '6281234567890',
  loginHref = '/agen/login',
}) => {
  const pathname = usePathname();

  // TODO: logic kondisional referral vs default menyusul
  const waUrl = `https://wa.me/${waNumber}?text=Halo%20Admin%2C%20saya%20ingin%20tanya%20paket%20umroh`;

  return (
    <div className="tw-bottom-nav-wrap">
      <nav className="tw-bottom-nav" aria-label="Navigasi Bawah">
        <Link
          href="/"
          className={`tw-bottom-nav__item ${pathname === '/' ? 'tw-bottom-nav__item--active' : ''}`}
        >
          <span className="tw-bottom-nav__icon">
            <Home size={20} />
          </span>
          <span className="tw-bottom-nav__label">Beranda</span>
        </Link>

        <Link
          href="/paket"
          className={`tw-bottom-nav__item ${pathname === '/paket' ? 'tw-bottom-nav__item--active' : ''}`}
        >
          <span className="tw-bottom-nav__icon">
            <Package size={20} />
          </span>
          <span className="tw-bottom-nav__label">Paket</span>
        </Link>

        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="tw-bottom-nav__item"
        >
          <span className="tw-bottom-nav__icon">
            <MessageCircle size={20} />
          </span>
          <span className="tw-bottom-nav__label">Chat</span>
        </a>

        <Link
          href={loginHref}
          className={`tw-bottom-nav__item ${pathname.startsWith('/agen') ? 'tw-bottom-nav__item--active' : ''}`}
        >
          <span className="tw-bottom-nav__icon">
            <User size={20} />
          </span>
          <span className="tw-bottom-nav__label">Mitra Agen</span>
        </Link>
      </nav>
    </div>
  );
};
