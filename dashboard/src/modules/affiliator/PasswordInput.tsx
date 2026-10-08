// Password field with a show/hide toggle inside the input (affiliator login, sign up, account).
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from '../../ui';
import './affiliator.css';

export const PasswordInput: React.FC<{ id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean; placeholder?: string }> = ({ id, value, onChange, autoComplete, invalid, placeholder }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="af-password">
      <input id={id} className="ku-input" type={visible ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} />
      <IconButton size="sm" className="af-password__toggle" label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
        {visible ? <EyeOff className="ku-icon--sm" aria-hidden="true" /> : <Eye className="ku-icon--sm" aria-hidden="true" />}
      </IconButton>
    </div>
  );
};
