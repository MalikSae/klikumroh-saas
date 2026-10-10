import React from 'react';
import { ArrowLeft } from 'lucide-react';
import './agent/AgentShell.css';

// The header of every sub-page of a travel's public site (catalogue, package detail, ...). It has the same
// geometry as the agent portal header (components/agent/AgentPageHeader): 56px, back arrow centred 26px from
// the edge, title 52px from the edge. The one difference: ONE action is allowed on the right (the share icon
// of the package page). The home page keeps its own brand header (components/home/TravelHome).
//
// The numbers live in agent/AgentShell.css and nowhere else; pages must not draw their own header (the lint
// script scripts/check-agent-shell.js fails the build if they do).
export interface PublicPageHeaderProps {
  title: string;
  onBack: () => void;
  backLabel?: string;
  // One icon button on the right, e.g. share. Build it with className="ag-shell-header__icon-btn".
  action?: React.ReactNode;
}

export const PublicPageHeader: React.FC<PublicPageHeaderProps> = ({ title, onBack, backLabel = 'Kembali', action }) => (
  <header className={`ag-shell-header ag-shell-header--raised${action ? ' ag-shell-header--action' : ''}`}>
    <button type="button" className="ag-shell-header__back" onClick={onBack} aria-label={backLabel}>
      <ArrowLeft size={20} aria-hidden="true" />
    </button>
    <h1 className="ag-shell-header__title">{title}</h1>
    {action}
  </header>
);
