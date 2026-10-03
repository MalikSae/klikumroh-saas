'use client';

// Bottom tab bar of every public travel page (mobile-app style): Beranda · Paket · Chat · Mitra.
// Chat opens the consultation form (saved as a prospect, with the agent referral and Meta Lead event the
// form already handles). Place it as the last child inside MobileContainer: it renders a spacer in the page
// flow so the footer is never hidden behind the fixed bar. Package detail pages use their own action bar.
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, MessageCircle, Users } from 'lucide-react';
import { KaabaIcon } from './icons/KaabaIcon';
import { ProspectModal } from './ProspectModal';
import './PublicTabBar.css';

export const PublicTabBar: React.FC<{ tenantName?: string | null; onChat?: () => void }> = ({ tenantName, onChat }) => {
  const path = usePathname();
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const home = path === '/';
  const paket = path.startsWith('/paket');
  const mitra = path.startsWith('/agen');
  // A signed-in agent goes straight to the portal home (which itself sends an expired session to login and
  // an inactive account to the status page); everyone else opens the login page.
  const openMitra = (e: React.MouseEvent) => {
    let token: string | null = null;
    try {
      token = localStorage.getItem('agent_token');
    } catch {}
    if (token) {
      e.preventDefault();
      router.push('/agen/dashboard');
    }
  };
  return (
    <>
      <div className="tw-tabbar-space" aria-hidden="true" />
      <nav className="tw-tabbar" aria-label="Navigasi utama">
        <Link href="/" className={`tw-tab${home ? ' tw-tab--on' : ''}`} aria-current={home ? 'page' : undefined}>
          <Home size={20} aria-hidden="true" />
          Beranda
        </Link>
        <Link href="/paket" className={`tw-tab${paket ? ' tw-tab--on' : ''}`} aria-current={paket ? 'page' : undefined}>
          <KaabaIcon size={20} aria-hidden="true" />
          Paket
        </Link>
        <button type="button" className="tw-tab" onClick={() => (onChat ? onChat() : setChatOpen(true))} aria-haspopup="dialog">
          <MessageCircle size={20} aria-hidden="true" />
          Chat
        </button>
        <Link href="/agen/login" className={`tw-tab${mitra ? ' tw-tab--on' : ''}`} aria-current={mitra ? 'page' : undefined} onClick={openMitra}>
          <Users size={20} aria-hidden="true" />
          Mitra
        </Link>
      </nav>
      {!onChat && <ProspectModal isOpen={chatOpen} onClose={() => setChatOpen(false)} selectedPackage={null} tenantName={tenantName || undefined} />}
    </>
  );
};
