import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import './AgentShell.css';

// The head of an AgentCard: one title line (plus an optional meta line) and, at the right, small controls.
// The head is as tall as its text. Controls at the right keep their size but never make the head taller:
// icon buttons are 24px with a 44px tap area, a link has a tap area around it, and a small button (32px)
// overlaps the card padding by 5px above and below. So every card starts its title 16px from the top.
//
//   title    the heading text (an <h2>); `id` lets the card name itself with aria-labelledby
//   icon     small icon before the title
//   meta     one muted line under the title
//   aside    non-interactive text at the right (a count, a status)
//   link     "Lihat semua" style link at the right
//   children controls at the right (AgentIconButton, AgentButton size="sm")
//   onToggle the text block is a button that opens and closes the card (`expanded` is its aria-expanded)
interface AgentCardHeadProps {
  id?: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
  link?: { href: string; label: string };
  children?: React.ReactNode;
  onToggle?: () => void;
  expanded?: boolean;
}

export const AgentCardHead: React.FC<AgentCardHeadProps> = ({ id, title, icon, meta, aside, link, children, onToggle, expanded }) => {
  // A heading cannot sit inside a button, so a toggling head uses spans.
  const Title = (onToggle ? 'span' : 'h2') as 'span';
  const Meta = (onToggle ? 'span' : 'p') as 'span';
  const text = (
    <>
      <Title id={id} className="ag-card-head__title">
        {icon}
        {title}
      </Title>
      {meta && <Meta className="ag-card-head__meta">{meta}</Meta>}
    </>
  );
  const hasRight = Boolean(aside || link || children);
  return (
    <div className="ag-card-head">
      {onToggle ? (
        <button type="button" className="ag-card-head__text ag-card-head__text--button" onClick={onToggle} aria-expanded={expanded}>
          {text}
        </button>
      ) : (
        <div className="ag-card-head__text">{text}</div>
      )}
      {hasRight && (
        <div className="ag-card-head__right">
          {aside && <span className="ag-card-head__aside">{aside}</span>}
          {link && (
            <Link href={link.href} className="ag-card-head__link">
              {link.label}
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          )}
          {children}
        </div>
      )}
    </div>
  );
};
