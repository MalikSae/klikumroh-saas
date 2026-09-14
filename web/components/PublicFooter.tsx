import React from 'react';
import { MapPin, Phone, Mail, ShieldCheck } from 'lucide-react';
import './PublicFooter.css';

export interface PublicFooterProps {
  tenantName?: string;
  address?: string | null;
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
  ppiuNumber?: string | null;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({
  tenantName = 'KlikUmroh Travel',
  address,
  phone,
  whatsappNumber,
  email,
  ppiuNumber,
}) => {
  const displayAddress = address || 'Jl. Raya Utama No. 88, Graha Travel Indonesia';
  const displayPhone = phone || whatsappNumber || '+62 812-3456-7890 (Customer Service)';
  const displayEmail = email || 'info@travel.klikumroh.id';
  const displayPpiu = ppiuNumber
    ? `Izin Kemenag No. ${ppiuNumber}`
    : 'Izin Kemenag No. U.123/2023';

  return (
    <footer id="kontak" className="tw-footer">
      <div className="tw-footer__brand">
        <div className="tw-footer__title">{tenantName}</div>
        <div className="tw-footer__legal">Penyelenggara Perjalanan Ibadah Umroh (PPIU) Resmi Kemenag RI</div>
      </div>

      <div className="tw-footer__contacts">
        <div className="tw-footer__contact-item">
          <span className="tw-footer__contact-icon"><MapPin size={15} /></span>
          <span>{displayAddress}</span>
        </div>
        <div className="tw-footer__contact-item">
          <span className="tw-footer__contact-icon"><Phone size={15} /></span>
          <span>{displayPhone}</span>
        </div>
        <div className="tw-footer__contact-item">
          <span className="tw-footer__contact-icon"><Mail size={15} /></span>
          <span>{displayEmail}</span>
        </div>
        <div className="tw-footer__contact-item">
          <span className="tw-footer__contact-icon"><ShieldCheck size={15} /></span>
          <span>{displayPpiu}</span>
        </div>
      </div>

      <div className="tw-footer__bottom">
        &copy; {new Date().getFullYear()} {tenantName}. Powered by KlikUmroh.id
      </div>
    </footer>
  );
};
