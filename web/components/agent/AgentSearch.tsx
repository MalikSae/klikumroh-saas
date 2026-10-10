import React from 'react';
import { Search, X } from 'lucide-react';
import './AgentShell.css';

// The search field of every agent list: icon on the left, clear button on the right (44px target).
interface AgentSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  // Accessible name, e.g. "Cari jamaah".
  label: string;
  maxLength?: number;
}

export const AgentSearch: React.FC<AgentSearchProps> = ({ value, onChange, placeholder, label, maxLength }) => (
  <div className="ag-search">
    <Search size={18} className="ag-search__icon" aria-hidden="true" />
    <input
      type="search"
      inputMode="search"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className="tw-field ag-search__input"
    />
    {value && (
      <button type="button" onClick={() => onChange('')} className="ag-search__clear" aria-label="Hapus pencarian">
        <X size={18} aria-hidden="true" />
      </button>
    )}
  </div>
);
