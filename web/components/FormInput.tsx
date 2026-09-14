import React from 'react';
import { CustomDropdown } from './CustomDropdown';
import './FormInput.css';

export interface FormOption {
  value: string | number;
  label: string;
}

export interface FormInputProps {
  id?: string;
  name?: string;
  type?: 'text' | 'tel' | 'email' | 'number' | 'select' | 'textarea' | 'date' | 'password';
  label?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: any) => void;
  onBlur?: (e: any) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  options?: FormOption[];
  rows?: number;
  className?: string;
  inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
  pattern?: string;
  maxLength?: number;
}

export const FormInput: React.FC<FormInputProps> = ({
  id,
  name,
  type = 'text',
  label,
  value,
  defaultValue,
  onChange,
  onBlur,
  placeholder,
  required = false,
  disabled = false,
  error,
  hint,
  options = [],
  rows = 3,
  className = '',
  inputMode,
  pattern,
  maxLength,
}) => {
  const inputId = id || name || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={`tw-form-group ${className}`}>
      {label && (
        <label htmlFor={inputId} className="tw-form-label">
          {label}
          {required && <span className="tw-form-label__required">*</span>}
        </label>
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
          // Assuming CustomDropdown can accept onBlur if needed, but for now we only need it on input/textarea.
        />
      ) : type === 'textarea' ? (
        <textarea
          id={inputId}
          name={name}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className={`tw-form-textarea ${error ? 'tw-form-textarea--error' : ''}`}
        />
      ) : (
        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          inputMode={inputMode}
          pattern={pattern}
          maxLength={maxLength}
          className={`tw-form-input ${error ? 'tw-form-input--error' : ''}`}
        />
      )}

      {error && <span className="tw-form-error">{error}</span>}
      {hint && !error && <span className="tw-form-hint">{hint}</span>}
    </div>
  );
};
