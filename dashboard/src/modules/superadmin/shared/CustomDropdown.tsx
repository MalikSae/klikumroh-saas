import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './CustomDropdown.css';

export interface DropdownOption {
  value: string | number;
  label: string;
}

export interface CustomDropdownProps {
  id?: string;
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  options?: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: string | boolean;
  className?: string;
  onChange?: (e: { target: { name: string; value: string | number } }) => void;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  id,
  name = '',
  value,
  defaultValue,
  options = [],
  placeholder = 'Pilih opsi...',
  disabled = false,
  error,
  className = '',
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [internalValue, setInternalValue] = useState<string | number | undefined>(
    value !== undefined ? value : defaultValue
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Synchronize controlled value
  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  // Check available vertical space and open upwards if needed
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 220 && spaceAbove > spaceBelow) {
        setOpenUpwards(true);
      } else {
        setOpenUpwards(false);
      }
    } else {
      setOpenUpwards(false);
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find(
    (opt) => String(opt.value) === String(internalValue)
  );

  const handleSelect = (option: DropdownOption) => {
    if (disabled) return;
    if (value === undefined) {
      setInternalValue(option.value);
    }
    setIsOpen(false);
    if (onChange) {
      onChange({
        target: {
          name,
          value: option.value,
        },
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    }
  };

  return (
    <div ref={dropdownRef} className={`db-dropdown ${className}`}>
      {/* Hidden input for standard form submission */}
      <input
        type="hidden"
        name={name}
        id={id}
        value={internalValue !== undefined ? String(internalValue) : ''}
      />

      <button
        type="button"
        className={`db-dropdown__trigger ${isOpen ? 'db-dropdown__trigger--open' : ''} ${error ? 'db-dropdown__trigger--error' : ''}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={selectedOption ? selectedOption.label : placeholder}
      >
        <span
          className={`db-dropdown__value ${!selectedOption ? 'db-dropdown__placeholder' : ''}`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        <span
          className={`db-dropdown__chevron ${isOpen ? 'db-dropdown__chevron--open' : ''}`}
        >
          <ChevronDown size={18} />
        </span>
      </button>

      {isOpen && (
        <div
          className={`db-dropdown__menu ${openUpwards ? 'db-dropdown__menu--up' : ''}`}
          role="listbox"
          tabIndex={-1}
        >
          {options.length === 0 ? (
            <div className="db-dropdown__item" style={{ opacity: 0.6, cursor: 'default' }}>
              Tidak ada opsi tersedia
            </div>
          ) : (
            options.map((option) => {
              const isSelected = String(option.value) === String(internalValue);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`db-dropdown__item ${isSelected ? 'db-dropdown__item--selected' : ''}`}
                  onClick={() => handleSelect(option)}
                >
                  <span className="db-dropdown__item-text">{option.label}</span>
                  {isSelected && (
                    <span className="db-dropdown__check">
                      <Check size={16} />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
