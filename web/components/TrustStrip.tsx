import React from 'react';
import { ShieldCheck, Star, Award } from 'lucide-react';
import './TrustStrip.css';

export interface TrustStripProps {
  ppiuNumber?: string | null;
  trustRating?: string | null;
  trustAlumniCount?: string | null;
  trustGuarantee?: string | null;
}

const clean = (v?: string | null) => (v && v.trim() ? v.trim() : '');

// Only the travel's own data is shown. An empty field hides its item: nothing is filled in with a
// made-up default (no invented rating, alumni count, guarantee, or licence claim).
export const TrustStrip: React.FC<TrustStripProps> = ({
  ppiuNumber,
  trustRating,
  trustAlumniCount,
  trustGuarantee,
}) => {
  // 1. PPIU licence, only when the travel entered its number.
  const ppiu = clean(ppiuNumber)
    .replace(/^PPIU\s*/i, '')
    .replace(/^No\.?\s*/i, '')
    .trim();

  // 2. Rating and alumni, each only when entered.
  const rating = clean(trustRating);
  const rawAlumni = clean(trustAlumniCount);
  const alumni = rawAlumni ? (/jamaah/i.test(rawAlumni) ? rawAlumni : `${rawAlumni} Jamaah`) : '';

  // 3. Guarantee in the travel's own words; "Title, detail" is shown on two lines.
  const guarantee = clean(trustGuarantee);
  const parts = guarantee.split(/[,–—•-]\s*/);
  const split = parts.length >= 2 && parts[0].trim() !== '' && parts[1].trim() !== '';
  const guaranteeTitle = split ? parts[0].trim() : guarantee;
  const guaranteeDesc = split ? parts.slice(1).join(', ').trim() : '';

  if (!ppiu && !rating && !alumni && !guarantee) return null;

  return (
    <div className="tw-trust-strip">
      {ppiu && (
        <div className="tw-trust-item">
          <div className="tw-trust-item__icon">
            <ShieldCheck size={16} />
          </div>
          <div className="tw-trust-item__text">
            <span className="tw-trust-item__title">Izin PPIU Resmi</span>
            <span className="tw-trust-item__desc">No. {ppiu}</span>
          </div>
        </div>
      )}

      {(rating || alumni) && (
        <div className="tw-trust-item">
          <div className="tw-trust-item__icon">
            <Star size={16} />
          </div>
          <div className="tw-trust-item__text">
            <span className="tw-trust-item__title">{rating ? `Rating ${rating}` : alumni}</span>
            {rating && alumni && <span className="tw-trust-item__desc">{alumni}</span>}
          </div>
        </div>
      )}

      {guarantee && (
        <div className="tw-trust-item">
          <div className="tw-trust-item__icon">
            <Award size={16} />
          </div>
          <div className="tw-trust-item__text">
            <span className="tw-trust-item__title">{guaranteeTitle}</span>
            {guaranteeDesc && <span className="tw-trust-item__desc">{guaranteeDesc}</span>}
          </div>
        </div>
      )}
    </div>
  );
};
