import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Layers,
  LogOut,
  Ticket,
  CheckCircle2,
  Settings,
  Users,
  Menu,
  X,
  Search,
  HelpCircle,
  ArrowLeft,
} from 'lucide-react';
import { Tooltip } from '../../../components/Tooltip';
import { NotificationDropdown } from '../../../components/NotificationDropdown';
import {
  getStoredStaffToken,
  getStoredStaffUser,
  clearStaffAuthSession,
  setStaffAuthSession,
  fetchStaffMe,
  type StaffUser,
} from '../../../services/staffApi';
import './AdminLayout.css';

export interface AdminLayoutProps {
  title?: string;
  subtitle?: string;
  tooltipText?: string;
  headerActions?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  title = 'HQ Overview',
  subtitle,
  tooltipText,
  headerActions,
  onBack,
  backLabel,
  children,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const token = getStoredStaffToken();
    if (!token) {
      navigate('/internal/login', { replace: true });
      return;
    }
    const staffUser = getStoredStaffUser();
    setUser(staffUser);

    // Live sync fresh profile data from database
    fetchStaffMe()
      .then((freshUser) => {
        if (freshUser) {
          setUser(freshUser);
          setStaffAuthSession(token, freshUser);
        }
      })
      .catch((err) => {
        if (err?.message?.toLowerCase().includes('unauthorized') || !getStoredStaffToken()) {
          navigate('/internal/login', { replace: true });
        }
      });
  }, [navigate, location.pathname]);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    clearStaffAuthSession();
    navigate('/internal/login', { replace: true });
  };

  const navGroups = [
    {
      group: 'Overview',
      items: [
        {
          to: '/internal/dashboard',
          label: 'Executive Cockpit',
          icon: <LayoutDashboard size={16} />,
        },
      ],
    },
    {
      group: 'Biro Travel',
      items: [
        {
          to: '/internal/tenants',
          label: 'Daftar Travel Mitra',
          icon: <Building2 size={16} />,
        },
        {
          to: '/internal/pricing-plans',
          label: 'Tier Paket',
          icon: <Layers size={16} />,
        },
        {
          to: '/internal/coupons',
          label: 'Kupon Diskon',
          icon: <Ticket size={16} />,
        },
      ],
    },
    {
      group: 'Billing & Keuangan',
      items: [
        {
          to: '/internal/payment-verifications',
          label: 'Verifikasi Pembayaran',
          icon: <CheckCircle2 size={16} />,
        },
      ],
    },
    {
      group: 'Platform',
      items: [
        {
          to: '/internal/staff',
          label: 'Manajemen Staf',
          icon: <Users size={16} />,
        },
        {
          to: '/internal/settings',
          label: 'Pengaturan Global',
          icon: <Settings size={16} />,
        },
      ],
    },
  ];

  const userInitial = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'KU';

  return (
    <div className="sa-shell">
      {/* Mobile Backdrop */}
      <div
        className={`sa-backdrop ${isMobileMenuOpen ? 'sa-backdrop--visible' : ''}`}
        onClick={() => setIsMobileMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Modern SaaS Executive Sidebar */}
      <aside className={`sa-sidebar ${isMobileMenuOpen ? 'sa-sidebar--open' : ''}`}>
        {/* Workspace Organization Switcher Header */}
        <div className="sa-sidebar__org">
          <div className="sa-org-badge">
            <div className="sa-org-icon">
              <img src="/icon-klikumroh.svg" alt="KlikUmroh" className="sa-org-icon-img" />
            </div>
            <div className="sa-org-info">
              <span className="sa-org-title">KlikUmroh HQ</span>
              <span className="sa-org-tag">
                <span className="sa-status-dot" />
                <span>Operational</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            className="sa-sidebar__close-btn"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Tutup Menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Grouped Navigation Links */}
        <div className="sa-sidebar__body">
          {navGroups.map((grp) => (
            <div key={grp.group} className="sa-nav-group">
              <span className="sa-nav-group__label">{grp.group}</span>
              {grp.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `sa-nav-link ${isActive ? 'sa-nav-link--active' : ''}`
                  }
                >
                  <div className="sa-nav-link__main">
                    <span className="sa-nav-link__icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom User Profile Dock */}
        <div className="sa-sidebar__footer">
          <div className="sa-user-dock">
            <div className="sa-user-dock__meta">
              <div className="sa-user-avatar">{userInitial}</div>
              <div className="sa-user-text">
                <span className="sa-user-name">{user?.name || 'Owner'}</span>
                <span className="sa-user-role">{user?.email || 'staff@klikumroh.id'}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="sa-logout-btn"
              title="Keluar dari portal"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="sa-content-wrapper">
        <header className="sa-topbar">
          <div className="sa-topbar__left">
            <button
              type="button"
              className="sa-topbar__hamburger"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label="Buka Menu"
            >
              <Menu size={18} />
            </button>

            <div className="sa-crumb">
              <span className="sa-crumb__root">KlikUmroh HQ</span>
              <span className="sa-crumb__sep">/</span>
              <span className="sa-crumb__active">{title}</span>
            </div>
          </div>

          <div className="sa-topbar__right">
            <div className="sa-search-command">
              <Search size={14} />
              <input type="text" placeholder="Quick search travel, domain..." readOnly />
              <span className="sa-kbd">⌘K</span>
            </div>

            <NotificationDropdown
              apiPrefix="/api/staff/notifications"
              tokenGetter={getStoredStaffToken}
            />
          </div>
        </header>

        <main className="sa-canvas">
          {/* Header Bar */}
          {title && (
            <div className="sa-header">
              <div className="sa-header__text">
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      marginBottom: '6px',
                      color: 'var(--sa-text-muted)',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      width: 'fit-content',
                    }}
                  >
                    <ArrowLeft size={13} />
                    <span>{backLabel || 'Kembali'}</span>
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h1 className="sa-header__title">{title}</h1>
                  {tooltipText && (
                    <Tooltip content={tooltipText}>
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'help',
                          color: 'var(--sa-text-muted)',
                          display: 'inline-flex',
                        }}
                        aria-label={`Bantuan ${title}`}
                      >
                        <HelpCircle size={14} />
                      </button>
                    </Tooltip>
                  )}
                </div>
                {subtitle && <p className="sa-header__subtitle">{subtitle}</p>}
              </div>

              {headerActions && (
                <div className="sa-header__actions">
                  {headerActions}
                </div>
              )}
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
};
