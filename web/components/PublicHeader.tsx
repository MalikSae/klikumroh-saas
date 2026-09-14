import React from 'react';
import Link from 'next/link';
import { Bell, ArrowLeft } from 'lucide-react';
import './PublicHeader.css';

export interface PublicHeaderProps {
  tenantName?: string;
  title?: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
  showBack?: boolean;
  backHref?: string;
  onBackClick?: () => void;
  onNotificationClick?: () => void;
  hideNotification?: boolean;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  tenantName = 'KlikUmroh Travel',
  title,
  logoUrl,
  iconUrl,
  showBack = false,
  backHref = '/',
  onBackClick,
  onNotificationClick,
  hideNotification = false,
}) => {
  const displayTitle = title || tenantName;

  // Header branding fallback hierarchy:
  // 1. If logoUrl (horizontal logo) exists -> render horizontal logo
  // 2. If logoUrl doesn't exist, but iconUrl (1:1) exists -> render icon + text nama travel
  // 3. If neither exists -> render text nama travel only (no initial badge)
  const renderBranding = () => {
    if (logoUrl) {
      return (
        <img
          src={logoUrl}
          alt={displayTitle}
          className="tw-header__logo-horizontal"
        />
      );
    }
    if (iconUrl) {
      return (
        <>
          <img
            src={iconUrl}
            alt={displayTitle}
            className="tw-header__icon-img"
          />
          <span className="tw-header__title">{displayTitle}</span>
        </>
      );
    }
    return <span className="tw-header__title">{displayTitle}</span>;
  };

  return (
    <header className="tw-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        {showBack ? (
          <>
            {onBackClick ? (
              <button
                type="button"
                onClick={onBackClick}
                className="tw-header__back-btn"
                aria-label="Kembali"
              >
                <ArrowLeft size={20} />
              </button>
            ) : (
              <Link
                href={backHref}
                className="tw-header__back-btn"
                aria-label="Kembali"
              >
                <ArrowLeft size={20} />
              </Link>
            )}
            <span
              className="tw-header__title"
              style={{
                fontSize: '16px',
                fontWeight: 700,
              }}
            >
              {displayTitle}
            </span>
          </>
        ) : (
          <Link href="/" className="tw-header__brand">
            {renderBranding()}
          </Link>
        )}
      </div>

      <div className="tw-header__actions">
        {!hideNotification && (
          <button
            type="button"
            className="tw-header__notif-btn"
            onClick={onNotificationClick}
            aria-label="Notifikasi"
          >
            <Bell size={19} />
            <span className="tw-header__notif-dot" />
          </button>
        )}
      </div>
    </header>
  );
};
