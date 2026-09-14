import React from 'react';
import { ShieldCheck, Star, Award } from 'lucide-react';
import './TrustStrip.css';

export interface TrustStripProps {
  ppiuNumber?: string | null;
  trustRating?: string | null;
  trustAlumniCount?: string | null;
  trustGuarantee?: string | null;
}

export const TrustStrip: React.FC<TrustStripProps> = ({
  ppiuNumber,
  trustRating,
  trustAlumniCount,
  trustGuarantee,
}) => {
  // 1. Legalitas PPIU Resmi
  let ppiuText = 'Kemenag RI';
  if (ppiuNumber && ppiuNumber.trim()) {
    const cleanPpiu = ppiuNumber
      .replace(/^PPIU\s*/i, '')
      .replace(/^No\.?\s*/i, '')
      .trim();
    ppiuText = cleanPpiu ? `No. ${cleanPpiu}` : 'Kemenag RI';
  }

  // 2. Rating & Kepuasan Jamaah
  const ratingText = trustRating && trustRating.trim() ? `Rating ${trustRating.trim()}` : 'Rating 4.9';
  let alumniText = '1.000+ Jamaah';
  if (trustAlumniCount && trustAlumniCount.trim()) {
    const rawAlumni = trustAlumniCount.trim();
    alumniText = /jamaah/i.test(rawAlumni) ? rawAlumni : `${rawAlumni} Jamaah`;
  }

  // 3. Garansi & Komitmen Keberangkatan
  let guaranteeTitle = '100% Berangkat';
  let guaranteeDesc = 'Jadwal Pasti';
  if (trustGuarantee && trustGuarantee.trim()) {
    const trimmed = trustGuarantee.trim();
    const splitParts = trimmed.split(/[,–—•-]\s*/);
    if (splitParts.length >= 2 && splitParts[0].trim() && splitParts[1].trim()) {
      guaranteeTitle = splitParts[0].trim();
      guaranteeDesc = splitParts.slice(1).join(', ').trim();
    } else {
      guaranteeTitle = trimmed;
      if (/jadwal/i.test(guaranteeTitle) && /pasti/i.test(guaranteeTitle)) {
        guaranteeDesc = 'Garansi Resmi';
      } else if (/pasti/i.test(guaranteeTitle)) {
        guaranteeDesc = 'Jadwal Terjamin';
      } else {
        guaranteeDesc = 'Jadwal Pasti';
      }
    }
  }

  return (
    <div className="tw-trust-strip">
      <div className="tw-trust-item">
        <div className="tw-trust-item__icon">
          <ShieldCheck size={16} />
        </div>
        <div className="tw-trust-item__text">
          <span className="tw-trust-item__title">Izin PPIU Resmi</span>
          <span className="tw-trust-item__desc">{ppiuText}</span>
        </div>
      </div>

      <div className="tw-trust-item">
        <div className="tw-trust-item__icon">
          <Star size={16} />
        </div>
        <div className="tw-trust-item__text">
          <span className="tw-trust-item__title">{ratingText}</span>
          <span className="tw-trust-item__desc">{alumniText}</span>
        </div>
      </div>

      <div className="tw-trust-item">
        <div className="tw-trust-item__icon">
          <Award size={16} />
        </div>
        <div className="tw-trust-item__text">
          <span className="tw-trust-item__title">{guaranteeTitle}</span>
          <span className="tw-trust-item__desc">{guaranteeDesc}</span>
        </div>
      </div>
    </div>
  );
};
