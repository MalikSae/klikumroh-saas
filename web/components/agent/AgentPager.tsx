import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './AgentShell.css';

// Previous / next with "Hal x dari y" in between, for lists the server pages.
interface AgentPagerProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

export const AgentPager: React.FC<AgentPagerProps> = ({ page, totalPages, onChange, disabled = false }) => {
  if (totalPages <= 1) return null;
  return (
    <nav className="ag-pager" aria-label="Halaman">
      <button
        type="button"
        className="ag-pager__btn"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1 || disabled}
        aria-label="Halaman sebelumnya"
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span className="ag-pager__info">
        Hal {page} dari {totalPages}
      </span>
      <button
        type="button"
        className="ag-pager__btn"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages || disabled}
        aria-label="Halaman berikutnya"
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </nav>
  );
};
