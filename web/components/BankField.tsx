'use client';

// Bank name picker for agent payout accounts: a fixed list of common Indonesian banks (no typos such as
// "bca" / "Bank Central Asia" for the admin who transfers), plus "Lainnya" with a free text field.
// Used on Profil and Tarik saldo. The value is the bank name as stored (bank_name).
import React, { useState } from 'react';
import { CustomDropdown } from './CustomDropdown';

export const BANK_NAMES = [
  'BCA',
  'BRI',
  'BNI',
  'Mandiri',
  'BSI',
  'CIMB Niaga',
  'Permata',
  'BTN',
  'Danamon',
  'OCBC',
  'Maybank',
  'Bank Muamalat',
  'Bank Jago',
  'SeaBank',
  'Bank DKI',
  'BJB',
];
const OTHER = '__lainnya__';

interface BankFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

const matchBank = (value: string) => BANK_NAMES.find((b) => b.toLowerCase() === value.trim().toLowerCase());

export const BankField: React.FC<BankFieldProps> = ({ id, value, onChange }) => {
  // "Lainnya" is chosen explicitly, or implied by a name that is not in the list (also when the saved
  // value arrives after the first render).
  const [otherChosen, setOther] = useState<boolean>(false);
  const known = matchBank(value);
  const other = otherChosen || (value.trim() !== '' && !known);
  const selected = other ? OTHER : known || '';

  return (
    <div className="tw-bank-field">
      <label className="tw-field-label" htmlFor={id}>
        Nama bank
      </label>
      <CustomDropdown
        id={id}
        name="bank_name"
        value={selected}
        placeholder="Pilih bank"
        options={[...BANK_NAMES.map((b) => ({ value: b, label: b })), { value: OTHER, label: 'Lainnya' }]}
        onChange={(e) => {
          const v = String(e.target.value);
          if (v === OTHER) {
            setOther(true);
            if (matchBank(value)) onChange('');
          } else {
            setOther(false);
            onChange(v);
          }
        }}
      />
      {other && (
        <input
          type="text"
          aria-label="Nama bank lainnya"
          placeholder="Tulis nama bank"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="tw-field tw-bank-field__other"
        />
      )}
    </div>
  );
};
