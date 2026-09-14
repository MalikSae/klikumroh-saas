import React from 'react';
import './MobileContainer.css';

export interface MobileContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const MobileContainer: React.FC<MobileContainerProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className="tw-mobile-canvas">
      <main className={`tw-mobile-container ${className}`}>
        {children}
      </main>
    </div>
  );
};
