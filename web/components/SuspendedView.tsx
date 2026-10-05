'use client';

import React from 'react';
import { AlertTriangle, LogIn } from 'lucide-react';
import { MobileContainer } from './MobileContainer';
import type { PublicTenantInfo } from '../app/page';
import './SuspendedView.css';

export interface SuspendedViewProps {
  tenantInfo: PublicTenantInfo | null;
}

// Shown to public visitors while the travel's subscription is suspended: it only says the website is
// temporarily inactive. No contact to the travel here (no WhatsApp, phone or email): public contact goes
// through the prospect form, which is closed while suspended (founder decision, 5 Oct 2026).
export const SuspendedView: React.FC<SuspendedViewProps> = ({ tenantInfo }) => {
  const brandPrimary = tenantInfo?.brand_primary_color;
  const travelName = tenantInfo?.name || 'Travel Umroh';

  return (
    <div
      className="tw-suspended-wrapper"
      style={brandPrimary ? ({ '--tw-brand-primary': brandPrimary } as React.CSSProperties) : undefined}
    >
      <MobileContainer>
        <div className="tw-suspended-container">
          {/* Tenant Brand Identity */}
          <div className="tw-suspended-brand">
            {tenantInfo?.brand_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- travel logo uploaded by the tenant, served as-is
              <img
                src={tenantInfo.brand_logo_url}
                alt={travelName}
                className="tw-suspended-logo"
              />
            ) : (
              <h2 className="tw-suspended-brand-name">{travelName}</h2>
            )}
          </div>

          {/* Suspension Status Card */}
          <div className="tw-suspended-card">
            <div className="tw-suspended-icon-box">
              <AlertTriangle size={32} />
            </div>

            <h1 className="tw-suspended-title">
              Layanan Website Sedang Ditangguhkan Sementara
            </h1>

            <p className="tw-suspended-desc">
              Mohon maaf atas ketidaknyamanan ini. Website resmi travel ini sedang dinonaktifkan sementara karena masa aktif lisensi software telah berakhir dan dalam proses perpanjangan oleh pengelola travel.
            </p>
          </div>

          {/* Admin Owner Quick Access */}
          <div className="tw-suspended-admin-box">
            <span className="tw-suspended-admin-title">Pengelola atau Pemilik Travel?</span>
            <span>
              Selesaikan pembayaran tagihan perpanjangan lisensi di Dashboard Admin KlikUmroh untuk mengaktifkan kembali website secara otomatis.
            </span>
            <a
              href="https://klikumroh.id/login"
              target="_blank"
              rel="noopener noreferrer"
              className="tw-suspended-login-btn"
            >
              <LogIn size={15} />
              <span>Login ke Dashboard Travel</span>
            </a>
          </div>
        </div>
      </MobileContainer>
    </div>
  );
};
