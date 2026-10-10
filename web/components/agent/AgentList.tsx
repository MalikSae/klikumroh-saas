import React from 'react';
import Link from 'next/link';
import './AgentShell.css';

// A list panel and its rows. The panel is one white block with a thin divider between rows; a row is
//   [lead] [title (+ titleAside on the same line) / meta / children] [aside]
// and is a link (`href`), a button (`onClick`) or plain (neither). A plain row may hold links of its own.
export const AgentList: React.FC<{ children: React.ReactNode; busy?: boolean; className?: string }> = ({
  children,
  busy = false,
  className,
}) => <ul className={`ag-card ag-card--list ag-list${busy ? ' ag-list--busy' : ''}${className ? ` ${className}` : ''}`}>{children}</ul>;

interface AgentListRowProps {
  // Avatar or icon at the left.
  lead?: React.ReactNode;
  title: React.ReactNode;
  // Small grey text at the right end of the title line (a date).
  titleAside?: React.ReactNode;
  // One line under the title: a status and a short description.
  meta?: React.ReactNode;
  // Further lines under the meta line.
  children?: React.ReactNode;
  // At the far right, centred vertically (an amount).
  aside?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

export const AgentListRow: React.FC<AgentListRowProps> = ({ lead, title, titleAside, meta, children, aside, href, onClick }) => {
  const inner = (
    <>
      {lead}
      <span className="ag-row__text">
        <span className="ag-row__top">
          <span className="ag-row__title">{title}</span>
          {titleAside && <span className="ag-row__title-aside">{titleAside}</span>}
        </span>
        {meta && <span className="ag-row__meta">{meta}</span>}
        {children}
      </span>
      {aside && <span className="ag-row__aside">{aside}</span>}
    </>
  );
  if (href) {
    return (
      <li>
        <Link href={href} className="ag-row ag-row--press">
          {inner}
        </Link>
      </li>
    );
  }
  if (onClick) {
    return (
      <li>
        <button type="button" className="ag-row ag-row--press" onClick={onClick}>
          {inner}
        </button>
      </li>
    );
  }
  return (
    <li>
      <div className="ag-row">{inner}</div>
    </li>
  );
};
