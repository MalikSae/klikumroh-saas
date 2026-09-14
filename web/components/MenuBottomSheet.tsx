'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  X,
  Building2,
  Quote,
  HelpCircle,
  PhoneCall,
  UserPlus,
  LogIn,
  ChevronRight,
} from 'lucide-react';
import './MenuBottomSheet.css';

export interface MenuBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MenuBottomSheet: React.FC<MenuBottomSheetProps> = ({
  isOpen,
  onClose,
}) => {
  const pathname = usePathname();
  const router = useRouter();

  if (!isOpen) return null;

  const handleAnchorClick = (anchorId: string) => {
    onClose();
    if (pathname === '/') {
      const element = document.getElementById(anchorId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      router.push(`/#${anchorId}`);
    }
  };

  return (
    <div
      className="tw-sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Menu Navigasi"
    >
      <div className="tw-sheet-card" onClick={(e) => e.stopPropagation()}>
        <div className="tw-sheet-handle" />

        <div className="tw-sheet-header">
          <h2 className="tw-sheet-title">Menu</h2>
          <button
            type="button"
            className="tw-sheet-close"
            onClick={onClose}
            aria-label="Tutup menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="tw-sheet-nav">
          <button
            type="button"
            className="tw-sheet-link"
            onClick={() => handleAnchorClick('tentang-kami')}
          >
            <span className="tw-sheet-icon">
              <Building2 size={18} />
            </span>
            <span>Tentang Kami</span>
          </button>

          <button
            type="button"
            className="tw-sheet-link"
            onClick={() => handleAnchorClick('testimoni')}
          >
            <span className="tw-sheet-icon">
              <Quote size={18} />
            </span>
            <span>Testimoni Jamaah</span>
          </button>

          <button
            type="button"
            className="tw-sheet-link"
            onClick={() => handleAnchorClick('faq')}
          >
            <span className="tw-sheet-icon">
              <HelpCircle size={18} />
            </span>
            <span>FAQ / Pertanyaan Umum</span>
          </button>

          <button
            type="button"
            className="tw-sheet-link"
            onClick={() => handleAnchorClick('kontak')}
          >
            <span className="tw-sheet-icon">
              <PhoneCall size={18} />
            </span>
            <span>Kontak & Lokasi</span>
          </button>
        </nav>

        <div className="tw-sheet-divider" />

        <div className="tw-sheet-agent-section">
          <div className="tw-sheet-agent-label">Kemitraan Agen</div>

          <Link
            href="/agen/daftar"
            className="tw-sheet-agent-btn"
            onClick={onClose}
          >
            <div className="tw-sheet-agent-btn__left">
              <span className="tw-sheet-icon">
                <UserPlus size={16} />
              </span>
              <span>Daftar jadi Agen</span>
            </div>
            <ChevronRight size={16} opacity={0.6} />
          </Link>

          <Link
            href="/agen/login"
            className="tw-sheet-agent-btn"
            onClick={onClose}
            style={{ marginTop: '6px' }}
          >
            <div className="tw-sheet-agent-btn__left">
              <span className="tw-sheet-icon">
                <LogIn size={16} />
              </span>
              <span>Login Agen</span>
            </div>
            <ChevronRight size={16} opacity={0.6} />
          </Link>
        </div>
      </div>
    </div>
  );
};
