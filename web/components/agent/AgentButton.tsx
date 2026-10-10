import React from 'react';
import Link from 'next/link';
import './AgentShell.css';

// The one button of the agent portal. Variant says what the action is, size says where it sits:
//   primary  the main action of a block (the travel's brand colour)
//   outline  a secondary action (default)
//   soft     a quiet action on a grey fill
//   ghost    cancel / dismiss, text only
//   danger   a destructive confirm
//   wa       open WhatsApp
// sm 32px is for a button inside a card head or a form row, md 40px is the default, lg 46px is a form submit.
// With `href` it renders a link (next/link for in-app paths, a plain <a> for external ones).
export type AgentButtonVariant = 'primary' | 'outline' | 'soft' | 'ghost' | 'danger' | 'wa';
export type AgentButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: AgentButtonVariant;
  size?: AgentButtonSize;
  // Full width of the container.
  block?: boolean;
  // Confirmation state of a copy button ("Tersalin"): brand-coloured text.
  done?: boolean;
  // Layout only (margin, align-self); the look comes from variant and size.
  className?: string;
  children: React.ReactNode;
}

type ButtonProps = CommonProps & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & { href?: undefined };
type LinkProps = CommonProps & { href: string; target?: string; rel?: string; onClick?: React.MouseEventHandler<HTMLAnchorElement> };

export type AgentButtonProps = ButtonProps | LinkProps;

export const AgentButton: React.FC<AgentButtonProps> = (props) => {
  const { variant = 'outline', size = 'md', block = false, done = false, className, children } = props;
  const cls = [
    'ag-shell-btn',
    `ag-shell-btn--${variant}`,
    `ag-shell-btn--${size}`,
    block ? 'ag-shell-btn--block' : '',
    done ? 'ag-shell-btn--done' : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  if (props.href !== undefined) {
    const { href, target, rel, onClick } = props;
    if (/^https?:/.test(href)) {
      return (
        <a href={href} target={target} rel={rel} className={cls} onClick={onClick}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {children}
      </Link>
    );
  }

  const { variant: _v, size: _s, block: _b, done: _d, className: _c, children: _ch, href: _h, type = 'button', ...rest } = props;
  void _v; void _s; void _b; void _d; void _c; void _ch; void _h;
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
};
