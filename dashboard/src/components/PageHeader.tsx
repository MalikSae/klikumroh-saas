import React from 'react';
import './PageHeader.css';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  backButton?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  badge,
  breadcrumb,
  actions,
  backButton,
  className = '',
}) => {
  return (
    <div className={`db-page-header ${className}`}>
      <div className="db-page-header__main">
        {breadcrumb && <div className="db-page-header__breadcrumb">{breadcrumb}</div>}
        <div className="db-page-header__title-row">
          {backButton}
          <h1 className="db-page-header__title">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="db-page-header__subtitle">{subtitle}</p>}
      </div>

      {actions && <div className="db-page-header__actions">{actions}</div>}
    </div>
  );
};
