import React from 'react';
import { ArrowLeft } from 'lucide-react';
import './AgentShell.css';

// The one header of every page of the agent portal (sub-pages and tab pages alike). Its geometry lives in
// AgentShell.css and nowhere else: pages must not draw their own header (the lint script
// scripts/check-agent-shell.js fails the build if they do).
//
// The header holds ONLY the back arrow and the title (founder rule, 11 Okt 2026: no buttons in the header).
// There is deliberately no slot for actions: an action belongs in the page content, where it can be seen
// next to what it acts on.
//
// - onBack given: sub-page, a back arrow at the left edge, then the title.
// - onBack omitted: tab page, the title starts at the page margin (16px).
export interface AgentPageHeaderProps {
  title: string;
  onBack?: () => void;
  backLabel?: string;
}

export const AgentPageHeader: React.FC<AgentPageHeaderProps> = ({ title, onBack, backLabel = 'Kembali' }) => (
  <header className={`ag-shell-header${onBack ? '' : ' ag-shell-header--tab'}`}>
    {onBack && (
      <button type="button" className="ag-shell-header__back" onClick={onBack} aria-label={backLabel}>
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
    )}
    <h1 className="ag-shell-header__title">{title}</h1>
  </header>
);
