import React from 'react';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline-light';
  size?: 'sm' | 'md' | 'lg';
  asLink?: boolean;
  href?: string;
  block?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  asLink = false,
  href,
  block = false,
  fullWidth = false,
  className = '',
  children,
  ...props
}) => {
  const isBlock = block || fullWidth;
  const combinedClass = `mkt-btn mkt-btn--${variant} mkt-btn--${size} ${isBlock ? 'mkt-btn--block' : ''} ${className}`.trim();

  if (asLink && href) {
    const isExternal = href.startsWith('http') || href.startsWith('https') || href.startsWith('//');
    return (
      <a
        href={href}
        className={combinedClass}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={combinedClass} {...props}>
      {children}
    </button>
  );
};
