import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Tooltip } from '../../../components/Tooltip';

export interface AdminStatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  tooltip?: string;
  badge?: React.ReactNode;
}

export const AdminStatCard: React.FC<AdminStatCardProps> = ({
  label,
  value,
  subValue,
  tooltip,
  badge,
}) => {
  return (
    <div className="sa-stat-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="sa-stat-card__label">{label}</span>
          {tooltip && (
            <Tooltip content={tooltip}>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'help',
                  color: 'var(--sa-text-muted)',
                  display: 'inline-flex',
                }}
                aria-label={`Info ${label}`}
              >
                <HelpCircle size={12} />
              </button>
            </Tooltip>
          )}
        </div>
        {badge}
      </div>

      <div className="sa-stat-card__value">
        {value}
      </div>

      {subValue && (
        <div className="sa-stat-card__sub">
          {subValue}
        </div>
      )}
    </div>
  );
};
