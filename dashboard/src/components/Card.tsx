import React from 'react';
import './Card.css';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  hoverable?: boolean;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  hoverable = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`db-card ${hoverable ? 'db-card--hoverable' : ''} ${className}`}
      {...props}
    >
      {(title || subtitle) && (
        <div className="db-card__header">
          {title && <h3 className="db-card__title">{title}</h3>}
          {subtitle && <p className="db-card__subtitle">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
};
