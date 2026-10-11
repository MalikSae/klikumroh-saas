import React from 'react';
import Link from 'next/link';
import './AgentShell.css';

// An icon-only button: 44x44 tap target, the icon itself stays 16-20px. `active` shows an on state (a saved star,
// an open menu, a copied check) in the travel's brand colour. A visible name is not available, so `label` is
// required. With `href` it is a link to another page (next/link) with the same look.
interface CommonProps {
  label: string;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}

type ButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps | 'aria-label'> & { href?: undefined };
type LinkProps = CommonProps & { href: string };

export const AgentIconButton: React.FC<ButtonProps | LinkProps> = (props) => {
  const { label, active = false, className, children } = props;
  const cls = `ag-shell-icon-btn${active ? ' ag-shell-icon-btn--active' : ''}${className ? ` ${className}` : ''}`;

  if (props.href !== undefined) {
    return (
      <Link href={props.href} aria-label={label} className={cls}>
        {children}
      </Link>
    );
  }

  const { label: _l, active: _a, className: _c, children: _ch, href: _h, type = 'button', ...rest } = props;
  void _l; void _a; void _c; void _ch; void _h;
  return (
    <button type={type} aria-label={label} className={cls} {...rest}>
      {children}
    </button>
  );
};
