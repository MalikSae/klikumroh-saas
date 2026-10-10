import React, { useId } from 'react';
import { X } from 'lucide-react';
import './AgentShell.css';

// A bottom sheet: dimmed backdrop, panel sliding up from the bottom, grip, optional title with a close button.
// Render it only while open (`{open && <AgentSheet ...>}`). Tapping the backdrop closes it unless `locked`
// (a request is in flight). With `onSubmit` the panel is a <form>.
interface AgentSheetProps {
  onClose: () => void;
  // Heading with a close button. Leave out for a sheet that brings its own heading (an amount, for example).
  title?: string;
  locked?: boolean;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}

export const AgentSheet: React.FC<AgentSheetProps> = ({ onClose, title, locked = false, onSubmit, children }) => {
  const titleId = useId();
  const close = () => {
    if (!locked) onClose();
  };
  const body = (
    <>
      <span className="ag-sheet__grip" aria-hidden="true" />
      {title && (
        <div className="ag-sheet__head">
          <h2 id={titleId} className="ag-sheet__title">
            {title}
          </h2>
          <button type="button" className="ag-sheet__close" onClick={close} disabled={locked} aria-label="Tutup">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      )}
      {children}
    </>
  );
  const common = {
    className: 'ag-sheet__panel',
    role: 'dialog' as const,
    'aria-modal': true as const,
    'aria-labelledby': title ? titleId : undefined,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };
  return (
    <div className="ag-sheet" role="presentation" onClick={close}>
      {onSubmit ? (
        <form {...common} onSubmit={onSubmit}>
          {body}
        </form>
      ) : (
        <div {...common}>{body}</div>
      )}
    </div>
  );
};
