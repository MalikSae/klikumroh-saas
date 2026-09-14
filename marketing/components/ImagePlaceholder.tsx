import React from 'react';
import { ImageIcon } from 'lucide-react';
import './ImagePlaceholder.css';

export interface ImagePlaceholderProps {
  description: string;
  minHeight?: number | string;
  dark?: boolean;
  className?: string;
}

export const ImagePlaceholder: React.FC<ImagePlaceholderProps> = ({
  description,
  minHeight,
  dark = false,
  className = '',
}) => {
  return (
    <div
      className={`mkt-placeholder ${dark ? 'mkt-placeholder--dark' : ''} ${className}`.trim()}
      style={minHeight ? { minHeight } : undefined}
      role="img"
      aria-label={description}
    >
      <ImageIcon size={32} className="mkt-placeholder__icon" />
      <span className="mkt-placeholder__label">Brief Image Placeholder</span>
      <p className="mkt-placeholder__text">{description}</p>
    </div>
  );
};
