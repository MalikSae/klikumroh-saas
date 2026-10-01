import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  overflowVisible?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  footer,
  children,
  className = '',
  overflowVisible = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="db-modal-overlay" onClick={onClose}>
      <div
        className={`db-modal-content ${overflowVisible ? 'db-modal-content--overflow-visible' : ''} ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="db-modal-header">
            <h3 className="db-modal-title">{title}</h3>
            <button
              type="button"
              className="db-modal-close"
              onClick={onClose}
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="db-modal-body">{children}</div>
        {footer && <div className="db-modal-footer">{footer}</div>}
      </div>
    </div>
  );
};
