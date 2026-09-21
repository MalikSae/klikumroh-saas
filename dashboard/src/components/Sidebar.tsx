import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  X,
  ChevronsUpDown,
  ExternalLink,
} from 'lucide-react';
import { useSidebar } from './SidebarContext';
import {
  getStoredTravelName,
  fetchTenantSubscription,
  type TenantSubscriptionInfo,
} from '../services/api';
import './Sidebar.css';

export interface MenuItem {
  id?: string;
  label: string;
  to?: string;
  icon?: React.ReactNode;
  active?: boolean;
  badge?: string | number;
  onClick?: () => void;
  children?: MenuItem[];
}

export interface SidebarProps {
  brandName?: string;
  menuItems: MenuItem[];
  footerContent?: React.ReactNode;
  className?: string;
  currentPath?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  brandName = 'KlikUmroh.id',
  menuItems,
  footerContent,
  className = '',
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen: isMobileOpen, close: closeMobileSidebar } = useSidebar();
  const [subInfo, setSubInfo] = useState<TenantSubscriptionInfo | null>(null);

  // Close mobile sidebar ONLY when pathname actually changes
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      closeMobileSidebar();
    }
  }, [location.pathname, closeMobileSidebar]);

  // Fetch subscription & tenant info for Active Travel Card
  useEffect(() => {
    let isMounted = true;
    fetchTenantSubscription()
      .then((info) => {
        if (isMounted && info) {
          setSubInfo(info);
        }
      })
      .catch(() => {
        // Silently ignore if not available
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Close mobile sidebar on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        closeMobileSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, closeMobileSidebar]);

  // Track which parent menus are expanded
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Auto-expand group if current path matches any of its children
  useEffect(() => {
    const currentPath = location.pathname;
    setExpandedGroups((prev) => {
      const updated = { ...prev };
      menuItems.forEach((item, index) => {
        const key = item.id || `menu-${index}`;
        if (item.children && item.children.length > 0) {
          const isChildActive = item.children.some(
            (child) => child.to && (currentPath === child.to || currentPath.startsWith(child.to + '/'))
          );
          if (isChildActive || item.active) {
            updated[key] = true;
          }
        }
      });
      return updated;
    });
  }, [location.pathname, menuItems]);

  const toggleGroup = (key: string, item: MenuItem) => {
    setExpandedGroups((prev) => {
      const isCurrentlyOpen = !!prev[key];
      const nextState = !isCurrentlyOpen;
      
      if (nextState && item.to) {
        navigate(item.to);
      } else if (nextState && item.children && item.children.length > 0 && !location.pathname.startsWith('/settings')) {
        const firstChild = item.children[0];
        if (firstChild.to) {
          navigate(firstChild.to);
        }
      }

      return {
        ...prev,
        [key]: nextState,
      };
    });
  };

  const travelName = subInfo?.tenant_name || getStoredTravelName() || 'Travel Umroh';
  const travelInitials = travelName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'TU';
  const planName = subInfo?.current_plan_name || 'Paket Travel';
  const publicWebUrl = subInfo?.tenant_slug ? `//${subInfo.tenant_slug}.localhost:3000` : '/';

  return (
    <>
      {isMobileOpen && (
        <div
          className="db-sidebar-backdrop"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}
      <aside className={`db-sidebar ${isMobileOpen ? 'db-sidebar--mobile-open' : ''} ${className}`}>
        <div className="db-sidebar__logo-area">
          <NavLink to="/" className="db-sidebar__brand-link" aria-label={brandName}>
            <div className="db-sidebar__brand-icon-frame">
              <img
                src="/icon-klikumroh.svg"
                alt={brandName}
                className="db-sidebar__brand-icon"
              />
            </div>
            <div className="db-sidebar__brand-text">
              <span className="db-sidebar__brand-name">
                <span className="db-sidebar__brand-bold">Klik</span>
                <span className="db-sidebar__brand-muted">Umroh</span>
              </span>
              <span className="db-sidebar__brand-badge">.id</span>
            </div>
          </NavLink>
          <button
            type="button"
            className="db-sidebar__close-btn"
            onClick={closeMobileSidebar}
            aria-label="Tutup Menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Active Travel Card */}
        <div className="db-sidebar__travel-card">
          <div className="db-sidebar__travel-mark">
            <span className="db-sidebar__travel-initial">{travelInitials}</span>
          </div>
          <div className="db-sidebar__travel-info">
            <div className="db-sidebar__travel-name" title={travelName}>
              {travelName}
            </div>
            <div className="db-sidebar__travel-plan">{planName}</div>
          </div>
          <button
            type="button"
            className="db-sidebar__travel-switch-btn"
            title="Kelola travel"
            onClick={() => navigate('/settings/profile')}
            aria-label="Pengaturan Travel"
          >
            <ChevronsUpDown size={14} />
          </button>
        </div>

        <nav className="db-sidebar__nav">
          <div className="db-sidebar__section-label">MENU UTAMA</div>

          {menuItems.map((item, index) => {
            const key = item.id || `menu-${index}`;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = !!expandedGroups[key];

            if (hasChildren) {
              const isAnyChildActive = item.children!.some(
                (child) =>
                  child.active ||
                  (child.to && (location.pathname === child.to || location.pathname.startsWith(child.to + '/')))
              );
              const isParentActive = isAnyChildActive || item.active;

              return (
                <div key={key} className="db-sidebar__group">
                  <button
                    type="button"
                    className={`db-sidebar__item db-sidebar__item--parent ${
                      isParentActive ? 'db-sidebar__item--parent-active' : ''
                    }`}
                    onClick={() => toggleGroup(key, item)}
                    aria-expanded={isExpanded}
                  >
                    <div className="db-sidebar__item-left">
                      {item.icon && <span className="db-sidebar__item-icon">{item.icon}</span>}
                      <span>{item.label}</span>
                    </div>
                    <div className="db-sidebar__item-right">
                      {item.badge !== undefined && (
                        <span className="db-sidebar__badge">{item.badge}</span>
                      )}
                      <span className="db-sidebar__chevron" aria-hidden="true">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="db-sidebar__subnav">
                      {item.children!.map((child, cIdx) => {
                        const childKey = child.id || child.to || `${key}-sub-${cIdx}`;
                        if (child.to) {
                          return (
                            <NavLink
                              key={childKey}
                              to={child.to}
                              className={({ isActive }) =>
                                `db-sidebar__subitem ${
                                  isActive || child.active ? 'db-sidebar__subitem--active' : ''
                                }`
                              }
                              onClick={() => {
                                child.onClick?.();
                                closeMobileSidebar();
                              }}
                            >
                              {child.icon && (
                                <span className="db-sidebar__subitem-icon">{child.icon}</span>
                              )}
                              <span className="db-sidebar__subitem-label">{child.label}</span>
                              {child.badge !== undefined && (
                                <span className="db-sidebar__badge">{child.badge}</span>
                              )}
                            </NavLink>
                          );
                        }

                        return (
                          <button
                            key={childKey}
                            type="button"
                            className={`db-sidebar__subitem ${
                              child.active ? 'db-sidebar__subitem--active' : ''
                            }`}
                            onClick={() => {
                              child.onClick?.();
                              closeMobileSidebar();
                            }}
                          >
                            {child.icon && (
                              <span className="db-sidebar__subitem-icon">{child.icon}</span>
                            )}
                            <span className="db-sidebar__subitem-label">{child.label}</span>
                            {child.badge !== undefined && (
                              <span className="db-sidebar__badge">{child.badge}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            if (item.to) {
              return (
                <NavLink
                  key={key}
                  to={item.to}
                  className={({ isActive }) =>
                    `db-sidebar__item ${isActive || item.active ? 'db-sidebar__item--active' : ''}`
                  }
                  onClick={() => {
                    item.onClick?.();
                    closeMobileSidebar();
                  }}
                >
                  <div className="db-sidebar__item-left">
                    {item.icon && <span className="db-sidebar__item-icon">{item.icon}</span>}
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="db-sidebar__badge">{item.badge}</span>
                  )}
                </NavLink>
              );
            }

            return (
              <button
                key={key}
                type="button"
                className={`db-sidebar__item ${item.active ? 'db-sidebar__item--active' : ''}`}
                onClick={() => {
                  item.onClick?.();
                  closeMobileSidebar();
                }}
              >
                <div className="db-sidebar__item-left">
                  {item.icon && <span className="db-sidebar__item-icon">{item.icon}</span>}
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="db-sidebar__badge">{item.badge}</span>
                )}
              </button>
            );
          })}

          <div className="db-sidebar__section-label db-sidebar__section-label--mt">AKSES CEPAT</div>
          <a
            href={publicWebUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="db-sidebar__item db-sidebar__quick-link"
          >
            <div className="db-sidebar__item-left">
              <span className="db-sidebar__item-icon">
                <ExternalLink size={16} />
              </span>
              <span>Lihat Web Travel</span>
            </div>
          </a>
        </nav>

        {/* Subscription / Footer Summary */}
        <div className="db-sidebar__footer">
          {subInfo && subInfo.status === 'pending' ? (
            <div className="db-sidebar__sub-card">
              <div className="db-sidebar__sub-row">
                <span className="db-sidebar__sub-label">Status</span>
                <span
                  className="db-sidebar__sub-days"
                  style={{
                    fontSize: '11px',
                    color: 'var(--db-status-contacted-border)',
                    fontWeight: 600,
                  }}
                >
                  Menunggu Pembayaran
                </span>
              </div>
            </div>
          ) : subInfo && subInfo.days_remaining !== undefined ? (
            <div className="db-sidebar__sub-card">
              <div className="db-sidebar__sub-row">
                <span className="db-sidebar__sub-label">Masa aktif</span>
                <span className="db-sidebar__sub-days">
                  {subInfo.days_remaining} hari
                </span>
              </div>
              <div className="db-sidebar__sub-progress-track">
                <div
                  className="db-sidebar__sub-progress-bar"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        5,
                        (subInfo.days_remaining /
                          Math.max(1, (subInfo.current_plan_period_months ?? 1) * 30)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : footerContent ? (
            footerContent
          ) : (
            <div className="db-sidebar__version">KlikUmroh.id 1.0</div>
          )}
        </div>
      </aside>
    </>
  );
};

