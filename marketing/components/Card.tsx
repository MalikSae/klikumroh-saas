import React from 'react';
import './Card.css';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  variant?: 'default' | 'muted' | 'dark' | 'accent-top';
  hoverable?: boolean;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  variant = 'default',
  hoverable = false,
  className = '',
  children,
  ...props
}) => {
  const variantClass = variant !== 'default' ? `mkt-card--${variant}` : '';
  const hoverClass = hoverable ? 'mkt-card--hoverable' : '';
  const combinedClass = `mkt-card ${variantClass} ${hoverClass} ${className}`.trim();

  return (
    <div className={combinedClass} {...props}>
      {(title || subtitle) && (
        <div className="mkt-card__header">
          {title && <h3 className="mkt-card__title">{title}</h3>}
          {subtitle && <p className="mkt-card__subtitle">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
};
