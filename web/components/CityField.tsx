'use client';

// Domisili field for public forms: free text with suggestions from Indonesia's kota/kabupaten list
// (data/indonesia-regencies.json, the same list the agent portal and the dashboard use). Picking a
// suggestion fills the full name, e.g. "Kota Bandung". Styled like FormInput.
import React, { useId, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import regencies from '../data/indonesia-regencies.json';
import './FormInput.css';
import './CustomDropdown.css';
import './CityField.css';

type Regency = { code: string; name: string };
const ALL = (regencies as Regency[]).map((r) => ({ name: r.name, key: r.name.toLowerCase().replace(/^(kota|kabupaten)\s+/, '') }));
const MAX = 6;

export interface CityFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 'up' opens the suggestions above the field (e.g. near the bottom of a sheet). */
  openUp?: boolean;
  /** Page-specific classes so the field matches the form it sits in (e.g. the agent portal). */
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  id?: string;
}

export const CityField: React.FC<CityFieldProps> = ({ label, value, onChange, placeholder = 'Ketik nama kota/kabupaten', openUp, className, labelClassName, inputClassName, id: givenId }) => {
  const autoId = useId();
  const id = givenId || autoId;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase().replace(/^(kota|kabupaten|kab\.?)\s+/, '');
    if (q.length < 2) return [];
    const starts = ALL.filter((r) => r.key.startsWith(q));
    const contains = ALL.filter((r) => !r.key.startsWith(q) && r.key.includes(q));
    return [...starts, ...contains].slice(0, MAX).map((r) => r.name);
  }, [value]);
  const show = open && matches.length > 0 && !(matches.length === 1 && matches[0] === value);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!show) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className={`${className || 'tw-form-group'} tw-city`}>
      <label htmlFor={id} className={labelClassName || 'tw-form-label'}>
        {label}
      </label>
      <input
        id={id}
        className={inputClassName || 'tw-form-input'}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={show}
        aria-controls={listId}
        aria-activedescendant={show ? `${listId}-${active}` : undefined}
        autoComplete="off"
        maxLength={100}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {show && (
        <ul id={listId} role="listbox" className={`tw-dropdown__menu tw-city__list${openUp ? ' tw-city__list--up' : ''}`}>
          {matches.map((name, i) => (
            <li
              key={name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`tw-dropdown__item tw-city__item${i === active ? ' tw-city__item--active' : ''}`}
              // mousedown, not click: runs before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(name);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <MapPin size={14} aria-hidden="true" />
              <span>{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
