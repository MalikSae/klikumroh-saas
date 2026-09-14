import React, { useState, useRef } from 'react';
import { HelpCircle } from 'lucide-react';
import './Tooltip.css';

export interface TooltipProps {
  content: string | React.ReactNode;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'auto';
  align?: 'center' | 'left' | 'right';
  className?: string;
  size?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'auto',
  align = 'center',
  className = '',
  size = 14,
}) => {
  const [autoPos, setAutoPos] = useState<'top' | 'bottom'>('top');
  const wrapRef = useRef<HTMLSpanElement>(null);

  const calculatePosition = (): 'top' | 'bottom' => {
    if (position === 'bottom') return 'bottom';
    if (position === 'top') return 'top';
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      // If near top of viewport (< 180px)
      if (rect.top < 180) {
        return 'bottom';
      }
      // Check if inside a modal or scroll container and near its top edge (< 120px)
      const scrollParent = wrapRef.current.closest('.db-modal-body, .db-modal-content, [data-scrollable="true"]');
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        if (rect.top - parentRect.top < 120) {
          return 'bottom';
        }
      }
    }
    return 'top';
  };

  const handlePositionCheck = () => {
    setAutoPos(calculatePosition());
  };

  React.useEffect(() => {
    handlePositionCheck();
  }, [position]);

  const resolvedPos = position !== 'auto' ? position : autoPos;
  const posClass = resolvedPos === 'bottom' ? 'db-tooltip-popup--bottom' : 'db-tooltip-popup--top';
  const alignClass = align === 'left' ? 'db-tooltip-popup--left' : align === 'right' ? 'db-tooltip-popup--right' : '';

  return (
    <span
      ref={wrapRef}
      className={`db-tooltip-wrap ${className}`}
      tabIndex={0}
      role="tooltip"
      onMouseEnter={handlePositionCheck}
      onFocus={handlePositionCheck}
      aria-label={typeof content === 'string' ? content : 'Informasi bantuan'}
    >
      {children || <HelpCircle size={size} className="db-tooltip-icon" />}
      <span className={`db-tooltip-popup ${posClass} ${alignClass}`}>
        {content}
      </span>
    </span>
  );
};
