import React from 'react';
import { Image as ImageIcon, Calendar, Users, ChevronRight } from 'lucide-react';
import './PackageCard.css';

export interface PackageCardProps {
  id?: string | number;
  name: string;
  price?: number;
  departureDateRaw?: string | null;
  quota?: number;
  imageUrl?: string;
  badge?: string;
  onSelect?: () => void;
  className?: string;
  actionLabel?: string;
}

export const PackageCard: React.FC<PackageCardProps> = ({
  name,
  price,
  departureDateRaw,
  quota,
  imageUrl,
  badge,
  onSelect,
  className = '',
  actionLabel,
}) => {
  const formattedPrice = price
    ? `Rp ${price.toLocaleString('id-ID')}`
    : 'Hubungi Kami';

  const formattedDate = departureDateRaw
    ? new Date(departureDateRaw).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : undefined;

  return (
    <div 
      className={`tw-package-card ${className}`} 
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        }
      }}
    >
      <div className="tw-package-card__image-wrap">
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="tw-package-card__image" />
        ) : (
          <div className="tw-package-card__placeholder-icon" aria-hidden="true">
            <ImageIcon size={32} />
          </div>
        )}
        {badge && <span className="tw-package-card__badge">{badge}</span>}
      </div>

      <div className="tw-package-card__content">
        <h3 className="tw-package-card__title">{name}</h3>

        {(formattedDate || (quota !== undefined && !badge)) && (
          <div className="tw-package-card__meta">
            {formattedDate && (
              <span className="tw-package-card__meta-item">
                <Calendar size={13} />
                <span>{formattedDate}</span>
              </span>
            )}
            {formattedDate && quota !== undefined && !badge && <span className="tw-package-card__meta-separator">•</span>}
            {quota !== undefined && !badge && (
              <span className="tw-package-card__meta-item">
                <Users size={13} />
                <span>Sisa {quota} Kursi</span>
              </span>
            )}
          </div>
        )}

        <div className="tw-package-card__footer">
          <div className="tw-package-card__price-section">
            <span className="tw-package-card__price-label">Mulai dari</span>
            <span className="tw-package-card__price-value">{formattedPrice}</span>
          </div>
          {actionLabel ? (
            <span className="tw-package-card__action-btn">
              {actionLabel}
            </span>
          ) : (
            <span className="tw-package-card__chevron" aria-hidden="true">
              <ChevronRight size={18} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};


