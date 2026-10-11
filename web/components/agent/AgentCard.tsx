import React from 'react';
import Link from 'next/link';
import './AgentShell.css';

// The one surface of the agent portal: white block, padding 16, radius 16, card shadow, content gap 12.
//   (default)  a block of content
//   tint       brand-tinted, for the one block that should stand out
//   list       rows bring their own vertical padding (menus, lists)
//   flush      no padding; the children fill the card (accordions)
//   scroll     content runs to the right edge so a horizontal scroller can bleed
// With `href` it is a link (next/link). Layout tweaks go in `className`; the look comes from here.
type CardTag = 'section' | 'article' | 'nav' | 'div' | 'ul' | 'ol' | 'form';
export type AgentCardVariant = 'default' | 'tint' | 'list' | 'flush' | 'scroll';

type CardProps = Omit<React.HTMLAttributes<HTMLElement>, 'className'> & {
  // form: the card is the form (onSubmit, noValidate)
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
  noValidate?: boolean;
  as?: CardTag;
  variant?: AgentCardVariant;
  className?: string;
  href?: string;
};

export const AgentCard: React.FC<CardProps> = ({ as = 'div', variant = 'default', className, href, children, ...rest }) => {
  const cls = `ag-card${variant === 'default' ? '' : ` ag-card--${variant}`}${className ? ` ${className}` : ''}`;
  if (href !== undefined) {
    return (
      <Link href={href} className={cls} {...(rest as Record<string, unknown>)}>
        {children}
      </Link>
    );
  }
  const Tag = as as React.ElementType;
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
};
