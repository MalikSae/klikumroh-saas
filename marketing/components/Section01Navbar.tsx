'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu as MenuIcon, X } from 'lucide-react';
import { Button } from './Button';
import { landingContent } from '../content/landing';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import './sections.css';

export const Section01Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { whatsappDemoUrl } = usePlatformSettings();
  const data = landingContent.section01Navbar;

  return (
    <header className="mkt-navbar">
      <div className="mkt-container">
        <div className="mkt-navbar__inner">
          <Link href="/" className="mkt-navbar__logo">
            {data.logo}
          </Link>

          <nav
            className={`mkt-navbar__nav ${mobileMenuOpen ? 'mkt-navbar__nav--open' : ''}`}
            aria-label="Main Navigation"
          >
            {data.menu.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="mkt-navbar__link"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="mkt-navbar__cta">
            <Button
              variant="primary"
              size="sm"
              asLink
              href={whatsappDemoUrl}
            >
              {data.cta}
            </Button>
          </div>

          <button
            type="button"
            className="mkt-navbar__toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Tutup Menu' : 'Buka Menu'}
          >
            {mobileMenuOpen ? <X size={24} /> : <MenuIcon size={24} />}
          </button>
        </div>
      </div>
    </header>
  );
};
