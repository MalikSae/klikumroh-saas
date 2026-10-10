import React from 'react';
import './AgentShell.css';

// An icon-only button: 44x44 tap target, the icon itself stays 16-20px. `active` shows an on state (a saved star,
// an open menu, a copied check) in the travel's brand colour. A visible name is not available, so `label` is required.
interface AgentIconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  label: string;
  active?: boolean;
  children: React.ReactNode;
}

export const AgentIconButton: React.FC<AgentIconButtonProps> = ({ label, active = false, className, children, type = 'button', ...rest }) => (
  <button
    type={type}
    aria-label={label}
    className={`ag-shell-icon-btn${active ? ' ag-shell-icon-btn--active' : ''}${className ? ` ${className}` : ''}`}
    {...rest}
  >
    {children}
  </button>
);
