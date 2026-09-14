import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import './Badge.css';

export interface BadgeProps {
  variant?:
    | 'positive'
    | 'negative'
    | 'neutral'
    | 'new'
    | 'contacted'
    | 'interested'
    | 'closing'
    | 'lost';
  showArrow?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  showArrow = false,
  children,
  className = '',
}) => {
  return (
    <span className={`db-badge db-badge--${variant} ${className}`}>
      {showArrow && (variant === 'positive' || variant === 'negative') && (
        <span className="db-badge__icon" aria-hidden="true">
          {variant === 'positive' ? (
            <TrendingUp size={12} strokeWidth={2.5} />
          ) : (
            <TrendingDown size={12} strokeWidth={2.5} />
          )}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
};
