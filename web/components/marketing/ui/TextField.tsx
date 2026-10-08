import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import styles from './MarketingUi.module.css';

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Required: the label and the error text are tied to the input by it. */
  id: string;
  label: string;
  /** Marks the label "(opsional)". */
  optional?: boolean;
  /** Error text below the field; also turns the border red and sets aria-invalid. */
  error?: string | null;
  hint?: React.ReactNode;
  /** Text inside the box after the input (for example ".klikumroh.id"). */
  suffix?: React.ReactNode;
  /** Replaces the suffix with a control inside the box (PasswordField uses it for the eye button). */
  action?: React.ReactNode;
}

/** Marketing text field: label above, 44px bordered box, error below (red text with an icon, not colour alone). */
export const TextField: React.FC<TextFieldProps> = ({ id, label, optional, error, hint, suffix, action, className = '', disabled, readOnly, ...inputProps }) => {
  const messageId = useId();
  const hasMessage = Boolean(error) || Boolean(hint);
  return (
    <div className={`${styles.field} ${className}`}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}>(opsional)</span>}
      </label>
      <div className={`${styles.control} ${error ? styles.controlError : ''} ${disabled ? styles.controlDisabled : ''} ${readOnly ? styles.controlReadonly : ''}`}>
        <input
          id={id}
          className={styles.input}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          {...inputProps}
        />
        {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
        {action}
      </div>
      {error ? (
        <span id={messageId} className={styles.error}>
          <AlertCircle size={14} aria-hidden="true" />
          <span><span className={styles.visuallyHidden}>Kesalahan: </span>{error}</span>
        </span>
      ) : hint ? (
        <span id={messageId} className={styles.hint}>{hint}</span>
      ) : null}
    </div>
  );
};
