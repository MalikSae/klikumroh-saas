import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown, ChevronRight, AlertCircle, Menu, Search } from 'lucide-react';
import { getStoredTravelName, clearAuthSession, fetchTenantSubscription, type TenantSubscriptionInfo } from '../services/api';
import { NotificationDropdown } from './NotificationDropdown';
import { useSidebar } from './SidebarContext';
import './Topbar.css';

export interface TopbarProps {
  title?: string;
  subtitle?: string;
  travelName?: string;
  userName?: string;
  userRole?: string;
  userInitial?: string;
  userPhotoUrl?: string;
  actions?: React.ReactNode;
  className?: string;
  onLogout?: () => void;
  onEditProfile?: () => void;
}

type BannerTone = 'info' | 'warning' | 'danger';

const formatDate = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/**
 * One subscription banner at most, most urgent first: unpaid activation, suspended, grace period,
 * then the renewal reminder from 30 days before expiry (L1). A renewal invoice waiting for payment
 * is linked directly so the travel lands on the payment instructions.
 */
const subscriptionBanner = (info: TenantSubscriptionInfo | null): { tone: BannerTone; text: string; action: string; to: string } | null => {
  if (!info) return null;
  const pending = info.pending_verification;
  const payLink = pending ? `/settings/subscription/payment/${pending.id}` : null;

  if (info.status === 'pending') {
    const rejected = !pending ? info.payment_verifications?.find((p) => p.status === 'rejected') : undefined;
    if (rejected) {
      return {
        tone: 'danger',
        text: `Pembayaran aktivasi perlu diperbaiki: ${rejected.rejection_reason || 'bukti transfer belum sesuai'}.`,
        action: 'Perbaiki pembayaran',
        to: `/settings/subscription/payment/${rejected.id}`,
      };
    }
    return {
      tone: 'warning',
      text: pending?.proof_url
        ? 'Bukti transfer sedang diverifikasi tim KlikUmroh. Website travel aktif setelah pembayaran disetujui.'
        : 'Akun travel Anda menunggu pembayaran aktivasi. Website travel aktif setelah pembayaran diverifikasi.',
      action: pending?.proof_url ? 'Lihat tagihan' : 'Lihat instruksi pembayaran',
      to: payLink || '/settings/subscription',
    };
  }
  if (info.is_suspended) {
    return {
      tone: 'danger',
      text: 'Layanan ditangguhkan: website travel tidak tampil dan data hanya bisa dilihat. Perpanjang untuk mengaktifkan kembali.',
      action: payLink ? 'Selesaikan pembayaran' : 'Perpanjang sekarang',
      to: payLink || '/settings/subscription/checkout',
    };
  }
  if (info.is_subscription_expired) {
    return {
      tone: 'warning',
      text: `Masa aktif berakhir ${formatDate(info.subscription_expires_at)}. Layanan tetap berjalan selama masa tenggang ${info.grace_period_days_remaining} hari lagi, setelah itu website ditangguhkan.`,
      action: payLink ? 'Selesaikan pembayaran' : 'Perpanjang sekarang',
      to: payLink || '/settings/subscription/checkout',
    };
  }
  if (info.should_show_renewal_invoice && info.days_remaining > 0) {
    return {
      tone: info.days_remaining <= 7 ? 'warning' : 'info',
      text: `Masa aktif langganan berakhir dalam ${info.days_remaining} hari (${formatDate(info.subscription_expires_at)}).`,
      action: payLink ? 'Selesaikan pembayaran' : 'Perpanjang',
      to: payLink || '/settings/subscription/checkout',
    };
  }
  return null;
};

export const Topbar: React.FC<TopbarProps> = ({
  title = 'Dashboard',
  travelName,
  userName = 'Admin Travel',
  userRole = 'Administrator',
  userInitial = 'A',
  userPhotoUrl,
  actions,
  className = '',
  onLogout,
  onEditProfile,
}) => {
  const navigate = useNavigate();
  const { toggle: toggleMobileSidebar } = useSidebar();
  const [isOpen, setIsOpen] = useState(false);
  const [subInfo, setSubInfo] = useState<TenantSubscriptionInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentTravelName = travelName || getStoredTravelName();

  useEffect(() => {
    let isMounted = true;
    fetchTenantSubscription()
      .then((info) => {
        if (isMounted && info) setSubInfo(info);
      })
      .catch(() => {
        // Silently ignore if subscription fetch fails (e.g. unauthenticated)
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const location = useLocation();
  // The billing page shows the same status in full detail, so the global banner is not repeated there.
  const banner = location.pathname === '/settings/subscription' ? null : subscriptionBanner(subInfo);

  const handleEditProfile = () => {
    setIsOpen(false);
    if (onEditProfile) {
      onEditProfile();
    } else {
      navigate('/profil-saya');
    }
  };

  const handleLogout = () => {
    setIsOpen(false);
    if (onLogout) {
      onLogout();
    } else {
      clearAuthSession();
      window.location.href = '/';
    }
  };

  return (
    <div className="db-topbar-container">
      {banner && (
        <div className={`db-topbar__expired-banner db-topbar__banner--${banner.tone}`} role={banner.tone === 'info' ? 'status' : 'alert'}>
          <AlertCircle size={16} className="db-topbar__expired-banner-icon" aria-hidden="true" />
          <span className="db-topbar__expired-banner-text">{banner.text}</span>
          <Link to={banner.to} className="db-topbar__expired-banner-link">
            {banner.action}
          </Link>
        </div>
      )}
      <header className={`db-topbar ${className}`}>
        <div className="db-topbar__left">
          <button
            type="button"
            className="db-topbar__hamburger-btn"
            onClick={toggleMobileSidebar}
            aria-label="Buka Menu"
            title="Menu"
          >
            <Menu size={20} />
          </button>
          <div className="db-topbar__breadcrumb">
            <span className="db-topbar__breadcrumb-root">{currentTravelName}</span>
            <ChevronRight size={13} className="db-topbar__breadcrumb-sep" aria-hidden="true" />
            <span className="db-topbar__breadcrumb-current">{title}</span>
          </div>
        </div>

        <div className="db-topbar__right">
          <div className="db-topbar__search">
            <Search size={14} className="db-topbar__search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Cari prospek, agen, atau paket..."
              className="db-topbar__search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  navigate(`/prospects?search=${encodeURIComponent(searchQuery.trim())}`);
                }
              }}
            />
          </div>

          {actions}
          <NotificationDropdown />
          
          <div className="db-topbar__user-menu" ref={dropdownRef}>
            <button
              type="button"
              className={`db-topbar__user-btn ${isOpen ? 'db-topbar__user-btn--active' : ''}`}
              onClick={() => setIsOpen((prev) => !prev)}
              aria-expanded={isOpen}
              aria-haspopup="menu"
              title="Menu Akun"
            >
              <div className="db-topbar__user-text">
                <span className="db-topbar__user-name">{userName}</span>
                <span className="db-topbar__user-role">{userRole}</span>
              </div>
              {userPhotoUrl ? (
                <div className="db-topbar__avatar db-topbar__avatar--photo" aria-label="User Avatar">
                  <img
                    src={userPhotoUrl}
                    alt={userName}
                    className="db-topbar__avatar-img"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : userInitial ? (
                <div className="db-topbar__avatar" aria-label="User Avatar">
                  {userInitial}
                </div>
              ) : null}
              <ChevronDown
                size={15}
                className={`db-topbar__chevron ${isOpen ? 'db-topbar__chevron--open' : ''}`}
                aria-hidden="true"
              />
            </button>

            {isOpen && (
              <div className="db-topbar__dropdown" role="menu">
                <div className="db-topbar__dropdown-header">
                  <span className="db-topbar__dropdown-name">{userName}</span>
                  <span className="db-topbar__dropdown-role">{userRole} • {currentTravelName}</span>
                </div>

                <div className="db-topbar__dropdown-divider" />

                <button
                  type="button"
                  className="db-topbar__dropdown-item"
                  role="menuitem"
                  onClick={handleEditProfile}
                >
                  <User size={16} className="db-topbar__dropdown-icon" />
                  <span>Edit Profil</span>
                </button>

                <div className="db-topbar__dropdown-divider" />

                <button
                  type="button"
                  className="db-topbar__dropdown-item db-topbar__dropdown-item--danger"
                  role="menuitem"
                  onClick={handleLogout}
                >
                  <LogOut size={16} className="db-topbar__dropdown-icon" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </div>
  );
};
