'use client';

// The travel's brand above page titles: its logo, else its icon, else the name as text. Used where a page
// would otherwise print the travel name as a small label (agent login, agent sign-up).
import React, { useState } from 'react';
import './BrandMark.css';

export const BrandMark: React.FC<{ name?: string | null; logoUrl?: string | null; iconUrl?: string | null; fallback: string }> = ({ name, logoUrl, iconUrl, fallback }) => {
  const [logoOk, setLogoOk] = useState(true);
  const [iconOk, setIconOk] = useState(true);
  const label = name || fallback;
  if (logoUrl && logoOk) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={label} className="tw-brandmark tw-brandmark--logo" onError={() => setLogoOk(false)} />;
  }
  if (iconUrl && iconOk) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt={label} className="tw-brandmark tw-brandmark--icon" onError={() => setIconOk(false)} />;
  }
  return <span className="tw-brandmark tw-brandmark--text">{label}</span>;
};
