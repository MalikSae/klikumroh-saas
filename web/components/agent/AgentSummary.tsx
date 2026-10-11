import React from 'react';
import { AgentCard } from './AgentCard';
import './AgentShell.css';

// The headline figure of a page: a small label (with an optional control at the right), the amount big, and under
// a dashed line up to two figures side by side, each a small label over its amount. The home page's balance and
// the "Agen binaan saya" commission use it, so both read the same.
interface Stat {
  label: string;
  value: string;
}

interface AgentSummaryProps {
  id?: string;
  label: string;
  amount: string;
  // A small control at the right of the label (the eye that hides the balance).
  action?: React.ReactNode;
  stats?: Stat[];
  // Layout only (the home page overlaps the card on its band).
  className?: string;
}

export const AgentSummary: React.FC<AgentSummaryProps> = ({ id, label, amount, action, stats, className }) => (
  <AgentCard
    as="section"
    className={`ag-summary${className ? ` ${className}` : ''}`}
    data-card-spacing="tight"
    aria-labelledby={id}
  >
    <div className="ag-summary__label">
      <h2 id={id}>{label}</h2>
      {action}
    </div>
    <p className="ag-summary__amount">{amount}</p>
    {stats && stats.length > 0 && (
      <div className="ag-summary__foot">
        {stats.map((s) => (
          <div key={s.label} className="ag-summary__stat">
            <span>{s.label}</span>
            <b>{s.value}</b>
          </div>
        ))}
      </div>
    )}
  </AgentCard>
);
