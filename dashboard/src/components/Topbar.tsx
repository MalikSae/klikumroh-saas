import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown, ChevronRight, AlertCircle, Menu, Search } from 'lucide-react';
import { getStoredTravelName, clearAuthSession, fetchTenantSubscription } from '../services/api';
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
  const [isSubscriptionExpired, setIsSubscriptionExpired] = useState(false);
  const [isPendingPayment, setIsPendingPayment] = useState(false);
  const [pendingVerificationId, setPendingVerificationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentTravelName = travelName || getStoredTravelName();

  useEffect(() => {
    let isMounted = true;
    fetchTenantSubscription()
      .then((info) => {
        if (isMounted && info) {
          setIsSubscriptionExpired(Boolean(info.is_subscription_expired));
          if (info.status === 'pending') {
            setIsPendingPayment(true);
            if (info.pending_verification) {
              setPendingVerificationId(info.pending_verification.id);
            }
          }
        }
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
      {isPendingPayment && (
        <div className="db-topbar__expired-banner db-topbar__pending-banner" role="alert">
          <AlertCircle size={16} className="db-topbar__expired-banner-icon" aria-hidden="true" />
          <span className="db-topbar__expired-banner-text">
            Akun travel Anda sedang menunggu aktivasi pembayaran. Selesaikan pembayaran untuk mengaktifkan website publik Anda.
          </span>
          <Link
            to={pendingVerificationId ? `/settings/subscription/payment/${pendingVerificationId}` : '/settings/subscription'}
            className="db-topbar__expired-banner-link"
          >
            Lihat Instruksi Pembayaran
          </Link>
        </div>
      )}
      {!isPendingPayment && isSubscriptionExpired && (
        <div className="db-topbar__expired-banner" role="alert">
          <AlertCircle size={16} className="db-topbar__expired-banner-icon" aria-hidden="true" />
          <span className="db-topbar__expired-banner-text">
            Langganan Anda telah berakhir. Perpanjang sekarang untuk melanjutkan mengelola data.
          </span>
          <Link to="/settings/subscription" className="db-topbar__expired-banner-link">
            Perpanjang sekarang
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
              placeholder="Cari prospek atau agen"
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
