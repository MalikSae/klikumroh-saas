import React from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { AgentButton } from './AgentButton';
import './AgentShell.css';

// The three blocks every agent page needs when it has no list to show: loading, failed, empty. One markup, one
// spacing, one spinner. Pages pass words and a handler; they do not draw these blocks themselves.
interface Action {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  // The main action of the page when the list is empty (add the first item); the default is a quiet outline.
  variant?: 'primary' | 'outline';
  icon?: React.ReactNode;
}

interface BaseProps {
  // Tighter padding, for a block inside a list rather than a whole page.
  compact?: boolean;
}

export const AgentStateLoading: React.FC<BaseProps & { text: string }> = ({ text, compact }) => (
  <div className={`ag-state${compact ? ' ag-state--compact' : ''}`} role="status">
    <Loader2 size={24} className="ag-shell-spin" aria-hidden="true" />
    <p className="ag-state__text">{text}</p>
  </div>
);

export const AgentStateError: React.FC<BaseProps & { title?: string; text: string; onRetry: () => void }> = ({
  title,
  text,
  onRetry,
  compact,
}) => (
  <div className={`ag-state${compact ? ' ag-state--compact' : ''}`}>
    <AlertCircle size={28} className="ag-state__icon--error" aria-hidden="true" />
    {title && <h2 className="ag-state__title">{title}</h2>}
    <p className="ag-state__text">{text}</p>
    <AgentButton onClick={onRetry}>
      <RefreshCw size={16} aria-hidden="true" />
      <span>Coba lagi</span>
    </AgentButton>
  </div>
);

export const AgentStateEmpty: React.FC<
  BaseProps & {
    icon?: React.ReactNode;
    title?: string;
    text?: string;
    action?: Action;
    // White rounded panel, for an empty list that sits on the grey page.
    panel?: boolean;
  }
> = ({ icon, title, text, action, panel, compact }) => (
  <div className={`ag-state${compact ? ' ag-state--compact' : ''}${panel ? ' ag-state--panel' : ''}`}>
    {icon}
    {title && <h2 className="ag-state__title">{title}</h2>}
    {text && <p className="ag-state__text">{text}</p>}
    {action && (
      <AgentButton variant={action.variant} onClick={action.onClick} disabled={action.disabled}>
        {action.icon}
        {action.label}
      </AgentButton>
    )}
  </div>
);
