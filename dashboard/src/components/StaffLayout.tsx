import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Building2, Layers, LogOut, Ticket, CheckCircle2, Settings } from 'lucide-react';
import { Button } from './Button';
import { NotificationDropdown } from './NotificationDropdown';
import {
  getStoredStaffToken,
  getStoredStaffUser,
  clearStaffAuthSession,
  type StaffUser,
} from '../services/staffApi';
import klikumrohLogo from '../assets/klikumroh-logo.png';
import './StaffLayout.css';

export interface StaffLayoutProps {
  title?: string;
  children: React.ReactNode;
}

export const StaffLayout: React.FC<StaffLayoutProps> = ({ title = 'KlikUmroh Internal', children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<StaffUser | null>(null);

  useEffect(() => {
    const token = getStoredStaffToken();
    if (!token) {
      navigate('/internal/login', { replace: true });
      return;
    }
    const staffUser = getStoredStaffUser();
    setUser(staffUser);
  }, [navigate, location.pathname]);

  const handleLogout = () => {
    clearStaffAuthSession();
    navigate('/internal/login', { replace: true });
  };

  const navItems = [
    {
      to: '/internal/tenants',
      label: 'Daftar Tenant',
      icon: <Building2 size={18} />,
    },
    {
      to: '/internal/pricing-plans',
      label: 'Plan Harga',
      icon: <Layers size={18} />,
    },
    {
      to: '/internal/coupons',
      label: 'Kelola Kupon',
      icon: <Ticket size={18} />,
    },
    {
      to: '/internal/payment-verifications',
      label: 'Approval Pembayaran',
      icon: <CheckCircle2 size={18} />,
    },
    {
      to: '/internal/settings',
      label: 'Pengaturan Platform',
      icon: <Settings size={18} />,
    },
  ];

  const userInitial = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'MA';

  return (
    <div className="db-main-layout">
      {/* Lightmode Staff Sidebar */}
      <aside className="db-staff-sidebar">
        <div className="db-staff-sidebar__logo-area">
          <img
            src={klikumrohLogo}
            alt="KlikUmroh"
            className="db-staff-sidebar__logo"
          />
        </div>

        <nav className="db-staff-sidebar__nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `db-staff-sidebar__item ${isActive ? 'db-staff-sidebar__item--active' : ''}`
              }
            >
              <span className="db-staff-sidebar__item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="db-staff-sidebar__footer">
          KlikUmroh Internal v1.0
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="db-content-area">
        <header className="db-staff-topbar">
          <div className="db-staff-topbar__left">
            <span className="db-staff-topbar__breadcrumb-root">Portal Internal</span>
            <span className="db-staff-topbar__breadcrumb-separator">/</span>
            <span className="db-staff-topbar__breadcrumb-current">{title}</span>
          </div>

          <div className="db-staff-topbar__right">
            <NotificationDropdown
              apiPrefix="/api/staff/notifications"
              tokenGetter={getStoredStaffToken}
            />

            <div className="db-staff-topbar__profile">
              <div className="db-staff-topbar__avatar" aria-label="Staff Avatar">
                {userInitial}
              </div>
              <div className="db-staff-topbar__user-text">
                <span className="db-staff-topbar__name">{user?.name || 'Master Admin KlikUmroh'}</span>
                <span className="db-staff-topbar__role">Staff Platform • {user?.email || 'staff@klikumroh.id'}</span>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
              className="db-staff-topbar__logout-btn"
            >
              <LogOut size={14} />
              <span>Keluar</span>
            </Button>
          </div>
        </header>

        <main className="db-page-container">
          {children}
        </main>
      </div>
    </div>
  );
};
