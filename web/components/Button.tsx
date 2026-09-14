import React from 'react';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  className = '',
  children,
  style,
  ...props
}) => {
  return (
    <button
      className={`tw-button tw-button--${variant} tw-button--${size} ${className}`}
      style={{ width: fullWidth ? '100%' : 'auto', ...style }}
      {...props}
    >
      {children}
    </button>
  );
};
