// Domisili field: free text with suggestions from Indonesia's kota/kabupaten list (same data as the agent
// portal, web/data/indonesia-regencies.json). Picking a suggestion fills the full name, e.g. "Kota Bandung".
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import regencies from '../data/indonesia-regencies.json';

type Regency = { code: string; name: string };
const ALL = (regencies as Regency[]).map((r) => ({ name: r.name, key: r.name.toLowerCase().replace(/^(kota|kabupaten)\s+/, '') }));
const MAX = 8;

export const CityInput: React.FC<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
}> = ({ id, value, onChange, placeholder = 'Ketik nama kota atau kabupaten', invalid }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase().replace(/^(kota|kabupaten|kab\.?)\s+/, '');
    if (q.length < 2) return [];
    const starts = ALL.filter((r) => r.key.startsWith(q));
    const contains = ALL.filter((r) => !r.key.startsWith(q) && r.key.includes(q));
    return [...starts, ...contains].slice(0, MAX).map((r) => r.name);
  }, [value]);

  const show = open && matches.length > 0 && !(matches.length === 1 && matches[0] === value);

  const place = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 4, width: r.width });
  };

  useEffect(() => {
    if (!show) return;
    place();
    const reflow = () => place();
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [show]);

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
      // Close only the suggestions, not the modal around the field.
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        className="ku-input"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={show}
        aria-controls={listId}
        aria-activedescendant={show ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
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
      {show && pos && (
        <ul id={listId} role="listbox" className="ku-select__list" style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: 280 }}>
          {matches.map((name, i) => (
            <li
              key={name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'ku-select__opt ku-select__opt--active ku-city__opt' : 'ku-select__opt ku-city__opt'}
              // mousedown, not click: runs before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(name);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <MapPin className="ku-icon--sm" aria-hidden="true" />
              <span>{name}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
