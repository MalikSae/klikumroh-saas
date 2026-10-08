import React from 'react';
import { Loader2 } from 'lucide-react';
import styles from './MarketingUi.module.css';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export type PrimaryButtonProps = (ButtonProps | LinkProps) & {
  /** Shows a spinner and loadingText instead of the children, and disables the button. */
  loading?: boolean;
  loadingText?: string;
};

/** Black primary button of the marketing site (same height as the fields, tactile edge like the landing CTA).
 * Pass href to get a link that looks the same. */
export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ loading, loadingText, className = '', children, ...rest }) => {
  const classes = `${styles.primaryBtn} ${className}`;
  const content = loading ? (
    <>
      <Loader2 size={18} className={styles.spinner} aria-hidden="true" />
      <span>{loadingText ?? 'Memproses...'}</span>
    </>
  ) : (
    children
  );
  if ('href' in rest && rest.href !== undefined) {
    return <a className={classes} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{content}</a>;
  }
  const { type = 'button', disabled, onClick, ...buttonProps } = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  // Loading uses aria-disabled, not disabled: a disabled button drops keyboard focus to the page body and the
  // user loses their place. Clicks and Enter are ignored while loading.
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (loading) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...buttonProps}
    >
      {content}
    </button>
  );
};
