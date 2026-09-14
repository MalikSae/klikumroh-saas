'use client';

import React from 'react';
import Image from 'next/image';
import { AlertTriangle, MessageCircle, Phone, Mail, LogIn } from 'lucide-react';
import { MobileContainer } from './MobileContainer';
import type { PublicTenantInfo } from '../app/page';
import './SuspendedView.css';

export interface SuspendedViewProps {
  tenantInfo: PublicTenantInfo | null;
}

export const SuspendedView: React.FC<SuspendedViewProps> = ({ tenantInfo }) => {
  const brandPrimary = tenantInfo?.brand_primary_color || '#006E67';
  const travelName = tenantInfo?.name || 'Travel Umroh';

  const formatWaUrl = (phone: string, travel: string) => {
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '62' + clean.slice(1);
    const msg = `Halo ${travel}, saya ingin menanyakan informasi paket umroh.`;
    return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div
      className="tw-suspended-wrapper"
      style={{ '--tw-brand-primary': brandPrimary } as React.CSSProperties}
    >
      <MobileContainer>
        <div className="tw-suspended-container">
          {/* Tenant Brand Identity */}
          <div className="tw-suspended-brand">
            {tenantInfo?.brand_logo_url ? (
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

            {/* Customer Contact Assistance */}
            {(tenantInfo?.whatsapp_number || tenantInfo?.phone || tenantInfo?.email) && (
              <div className="tw-suspended-contacts">
                <span className="tw-suspended-contacts-label">Kontak Resmi Travel</span>

                {tenantInfo.whatsapp_number && (
                  <a
                    href={formatWaUrl(tenantInfo.whatsapp_number, travelName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tw-suspended-wa-btn"
                  >
                    <MessageCircle size={18} />
                    <span>Hubungi Pengelola via WhatsApp</span>
                  </a>
                )}

                {tenantInfo.phone && !tenantInfo.whatsapp_number && (
                  <a href={`tel:${tenantInfo.phone}`} className="tw-suspended-contact-item">
                    <Phone size={15} />
                    <span>{tenantInfo.phone}</span>
                  </a>
                )}

                {tenantInfo.email && (
                  <a href={`mailto:${tenantInfo.email}`} className="tw-suspended-contact-item">
                    <Mail size={15} />
                    <span>{tenantInfo.email}</span>
                  </a>
                )}
              </div>
            )}
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
