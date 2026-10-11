import React from 'react';
import './AgentShell.css';

// A row of filter chips that scrolls sideways (the right edge fades to show there is more). One chip is on.
// `tone="brand"` fills the active chip with the travel's brand colour (caption and script pages); the default is
// the dark fill used by the lists.
export interface AgentChipItem<K extends string> {
  key: K;
  label: string;
  count?: number;
}

interface AgentChipsProps<K extends string> {
  items: AgentChipItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  tone?: 'dark' | 'brand';
}

export function AgentChips<K extends string>({ items, value, onChange, label, tone = 'dark' }: AgentChipsProps<K>) {
  return (
    <div className={`ag-chips${tone === 'brand' ? ' ag-chips--brand' : ''}`} role="tablist" aria-label={label}>
      {items.map((item) => {
        const on = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={on}
            className={`ag-chip${on ? ' ag-chip--on' : ''}${!on && item.count === 0 ? ' ag-chip--empty' : ''}`}
            onClick={() => onChange(item.key)}
          >
            {item.label}
            {item.count !== undefined && <span className="ag-chip__count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
