'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Package, MessageCircle, User } from 'lucide-react';
import { whatsappLink } from '../lib/usePlatformSettings';
import { trackMetaEvent } from '../lib/metaPixel';
import './BottomNavbar.css';

export interface BottomNavbarProps {
  onOpenMenu?: () => void;
  // TODO: logic kondisional referral vs default menyusul
  waNumber?: string;
  loginHref?: string;
}

export const BottomNavbar: React.FC<BottomNavbarProps> = ({
  onOpenMenu,
  waNumber,
  loginHref = '/agen/login',
}) => {
  const pathname = usePathname();

  // TODO: logic kondisional referral vs default menyusul
  // No travel WhatsApp number -> no Chat item (never route jamaah to a placeholder number).
  const waUrl = whatsappLink(waNumber, 'Halo Admin, saya ingin tanya paket umroh');

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

        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tw-bottom-nav__item"
            onClick={() => trackMetaEvent('Contact', { content_category: 'umroh' })}
          >
            <span className="tw-bottom-nav__icon">
              <MessageCircle size={20} />
            </span>
            <span className="tw-bottom-nav__label">Chat</span>
          </a>
        )}

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
