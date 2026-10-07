'use client';

// The consultant (agent) whose referral link brought the visitor (see lib/consultant.ts): two lines,
// "Konsultan {travel}" and the full name. No button goes straight to WhatsApp: "Konsultasi Gratis" opens
// the interest form, which saves the visitor as this
// consultant's prospect and only then opens a chat with them. Renders nothing without a consultant.
import React, { useState } from 'react';
import { BadgeCheck, User } from 'lucide-react';
import type { Consultant } from '../lib/consultant';
import { WhatsAppIcon } from './icons/WhatsAppIcon';
import './ConsultantCard.css';


export const ConsultantCard: React.FC<{
  consultant: Consultant | null;
  travelName: string;
  /** Opens the interest form. Without it the card shows no button (it sits next to the page's own CTA). */
  onAsk?: () => void;
  /** Button color: green (default) or the travel's brand color where it replaces the page's brand CTA. */
  askTone?: 'green' | 'brand';
  className?: string;
}> = ({ consultant, travelName, onAsk, askTone = 'green', className }) => {
  const [photoOk, setPhotoOk] = useState(true);
  if (!consultant) return null;
  return (
    <section className={`tw-consultant${className ? ` ${className}` : ''}`} aria-label={`Konsultan ${travelName}: ${consultant.name}`}>
      {consultant.photo_url && photoOk ? (
        // eslint-disable-next-line @next/next/no-img-element -- consultant photo uploaded by the agent
        <img src={consultant.photo_url} alt="" className="tw-consultant__photo" onError={() => setPhotoOk(false)} />
      ) : (
        // No photo: a person icon (founder, 7 Oct 2026), not the name's initials.
        <span className="tw-consultant__photo tw-consultant__photo--initials" aria-hidden="true">
          <User size={24} />
        </span>
      )}
      <div className="tw-consultant__text">
        <span className="tw-consultant__label">Konsultan {travelName}</span>
        <span className="tw-consultant__name-row">
          <b className="tw-consultant__name">{consultant.name}</b>
          <BadgeCheck size={18} className="tw-consultant__verified" aria-label="Terverifikasi" />
        </span>
      </div>
      {onAsk && (
        // WhatsApp icon only (founder, 7 Oct 2026); it still opens the interest form first, never wa.me directly.
        <button
          type="button"
          className={`tw-consultant__ask${askTone === 'brand' ? ' tw-consultant__ask--brand' : ''}`}
          onClick={onAsk}
          aria-label={`Konsultasi gratis dengan ${consultant.name}`}
          title="Konsultasi Gratis"
        >
          <WhatsAppIcon size={20} aria-hidden="true" />
        </button>
      )}
    </section>
  );
};
