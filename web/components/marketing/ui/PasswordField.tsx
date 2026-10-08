'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { TextField, type TextFieldProps } from './TextField';
import styles from './MarketingUi.module.css';

export interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'action' | 'suffix'> {
  /** id of the show/hide button (tests and scripts look it up). */
  toggleId?: string;
}

/** TextField for a password, with an eye button inside the box to show or hide it. */
export const PasswordField: React.FC<PasswordFieldProps> = ({ toggleId, ...fieldProps }) => {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...fieldProps}
      type={visible ? 'text' : 'password'}
      action={
        <button
          type="button"
          id={toggleId}
          className={styles.toggle}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      }
    />
  );
};
