import React from 'react';
import './AgentShell.css';

// A status as coloured text (or a pill) in the agent portal: the pipeline status of a jamaah, the state of a
// commission or a payout, the state of an agent. The colours are the status tokens, never the travel's brand
// colour (a red brand would read as an error). The mapping from a domain value to a tone lives with the domain
// (lib/prospectStatus.ts for the pipeline); this component only knows tones.
export type StatusTone = 'new' | 'wait' | 'interested' | 'success' | 'info' | 'muted' | 'danger';

export interface StatusLabelProps {
  tone: StatusTone;
  children: React.ReactNode;
  // 16px instead of 13px, for the status of the thing a page is about.
  large?: boolean;
  // A tinted pill instead of plain text.
  pill?: boolean;
  as?: 'span' | 'p';
}

export const StatusLabel: React.FC<StatusLabelProps> = ({ tone, children, large = false, pill = false, as: Tag = 'span' }) => (
  <Tag className={`ag-status ag-status--${tone}${large ? ' ag-status--lg' : ''}${pill ? ' ag-status--pill' : ''}`}>{children}</Tag>
);
