import React from 'react';
import { Card } from './Card';
import { Badge } from './Badge';
import './StatCard.css';

export interface StatCardProps {
  label: string;
  value: string | number;
  trend?: {
    variant: 'positive' | 'negative';
    label: string;
  };
  footerNote?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  trend,
  footerNote,
  className = '',
}) => {
  return (
    <Card className={`db-stat-card ${className}`} hoverable>
      <div className="db-stat-card__top">
        <span className="db-stat-card__label">{label}</span>
      </div>
      <div className="db-stat-card__main">
        <span className="db-stat-card__value">{value}</span>
        {trend && (
          <Badge variant={trend.variant}>
            {trend.label}
          </Badge>
        )}
      </div>
      {footerNote && (
        <p className="db-stat-card__footer">{footerNote}</p>
      )}
    </Card>
  );
};
