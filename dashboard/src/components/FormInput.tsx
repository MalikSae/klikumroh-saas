import React from 'react';
import { CustomDropdown } from './CustomDropdown';
import { Tooltip } from './Tooltip';
import './FormInput.css';

export interface FormOption {
  value: string | number;
  label: string;
}

export interface FormInputProps {
  id?: string;
  name?: string;
  type?: 'text' | 'email' | 'number' | 'password' | 'select' | 'textarea' | 'date' | 'color';
  label?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: any) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
  hint?: string;
  tooltip?: string;
  tooltipPosition?: 'top' | 'bottom' | 'auto';
  options?: FormOption[];
  rows?: number;
  className?: string;
}

export const FormInput: React.FC<FormInputProps> = ({
  id,
  name,
  type = 'text',
  label,
  value,
  defaultValue,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  min,
  max,
  step,
  error,
  hint,
  tooltip,
  tooltipPosition,
  options = [],
  rows = 3,
  className = '',
}) => {
  const inputId = id || name || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const cleanLabel = label ? label.replace(/\s*\*\s*$/, '') : '';

  return (
    <div className={`db-form-group ${className}`}>
      {label && (
        <div className="db-form-label-row">
          <label htmlFor={inputId} className="db-form-label">
            {cleanLabel}
            {required && <span className="db-form-label__required">*</span>}
          </label>
          {tooltip && <Tooltip content={tooltip} position={tooltipPosition} />}
        </div>
      )}

      {type === 'select' ? (
        <CustomDropdown
          id={inputId}
          name={name}
          value={value}
          defaultValue={defaultValue}
          options={options}
          placeholder={placeholder}
          disabled={disabled}
          error={error}
          onChange={onChange}
        />
      ) : type === 'textarea' ? (
        <textarea
          id={inputId}
          name={name}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className={`db-form-textarea ${error ? 'db-form-textarea--error' : ''}`}
        />
      ) : (
        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          className={`db-form-input ${error ? 'db-form-input--error' : ''}`}
        />
      )}

      {error && <span className="db-form-error">{error}</span>}
      {hint && !error && <span className="db-form-hint">{hint}</span>}
    </div>
  );
};
