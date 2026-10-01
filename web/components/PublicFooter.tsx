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

const clean = (v?: string | null) => (v && v.trim() ? v.trim() : '');

// Only the travel's own contact and licence data is shown. An empty field hides its line: no sample
// address, phone, email, or licence number is ever shown as if it were the travel's.
export const PublicFooter: React.FC<PublicFooterProps> = ({
  tenantName = 'KlikUmroh Travel',
  address,
  phone,
  whatsappNumber,
  email,
  ppiuNumber,
}) => {
  const displayAddress = clean(address);
  const displayPhone = clean(phone) || clean(whatsappNumber);
  const displayEmail = clean(email);
  const ppiu = clean(ppiuNumber).replace(/^PPIU\s*/i, '').replace(/^No\.?\s*/i, '').trim();
  const hasContacts = Boolean(displayAddress || displayPhone || displayEmail || ppiu);

  return (
    <footer id="kontak" className="tw-footer">
      <div className="tw-footer__brand">
        <div className="tw-footer__title">{tenantName}</div>
        {ppiu && <div className="tw-footer__legal">Penyelenggara Perjalanan Ibadah Umroh (PPIU)</div>}
      </div>

      {hasContacts && (
        <div className="tw-footer__contacts">
          {displayAddress && (
            <div className="tw-footer__contact-item">
              <span className="tw-footer__contact-icon"><MapPin size={15} /></span>
              <span>{displayAddress}</span>
            </div>
          )}
          {displayPhone && (
            <div className="tw-footer__contact-item">
              <span className="tw-footer__contact-icon"><Phone size={15} /></span>
              <span>{displayPhone}</span>
            </div>
          )}
          {displayEmail && (
            <div className="tw-footer__contact-item">
              <span className="tw-footer__contact-icon"><Mail size={15} /></span>
              <span>{displayEmail}</span>
            </div>
          )}
          {ppiu && (
            <div className="tw-footer__contact-item">
              <span className="tw-footer__contact-icon"><ShieldCheck size={15} /></span>
              <span>Izin PPIU No. {ppiu}</span>
            </div>
          )}
        </div>
      )}

      <div className="tw-footer__bottom">
        &copy; {new Date().getFullYear()} {tenantName}. Powered by KlikUmroh.id
      </div>
    </footer>
  );
};
