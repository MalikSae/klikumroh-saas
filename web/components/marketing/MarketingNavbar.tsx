'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight, LogIn } from 'lucide-react';
import { KlikUmrohBrand } from './KlikUmrohBrand';
import styles from './MarketingNavbar.module.css';

export const MarketingNavbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ''}`}>
      <div className={styles.container}>
        {/* KlikUmroh Brand */}
        <Link href="/marketing" className={styles.brand}>
          <KlikUmrohBrand theme="light" iconSize={30} />
        </Link>

        {/* Navigation Links */}
        <nav className={styles.navLinks}>
          <a href="#fitur" className={styles.navLink}>Fitur</a>
          <a href="#cara-kerja" className={styles.navLink}>Cara kerja</a>
          <a href="#harga" className={styles.navLink}>Harga</a>
          <a href="#faq" className={styles.navLink}>FAQ</a>
        </nav>

        {/* Desktop Actions */}
        <div className={styles.navActions}>
          <Link href="/login" className={styles.loginBtn}>
            <LogIn size={16} />
            <span>Login</span>
          </Link>
          <a href="#harga" className={styles.ctaBtn}>
            <span>Lihat Harga</span>
            <ArrowRight size={16} />
          </a>
        </div>

        {/* Mobile Hamburger Toggle */}
        <button
          type="button"
          className={styles.mobileToggle}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Nav Dropdown */}
      {mobileMenuOpen && (
        <div className={styles.mobileDropdown}>
          <nav className={styles.mobileNav}>
            <a
              href="#fitur"
              className={styles.mobileNavLink}
              onClick={() => setMobileMenuOpen(false)}
            >
              Fitur
            </a>
            <a
              href="#cara-kerja"
              className={styles.mobileNavLink}
              onClick={() => setMobileMenuOpen(false)}
            >
              Cara kerja
            </a>
            <a
              href="#harga"
              className={styles.mobileNavLink}
              onClick={() => setMobileMenuOpen(false)}
            >
              Harga
            </a>
            <a
              href="#faq"
              className={styles.mobileNavLink}
              onClick={() => setMobileMenuOpen(false)}
            >
              FAQ
            </a>
            <div className={styles.mobileActions}>
              <Link
                href="/login"
                className={styles.mobileLoginBtn}
                onClick={() => setMobileMenuOpen(false)}
              >
                <LogIn size={16} />
                <span>Login</span>
              </Link>
              <a
                href="#harga"
                className={styles.mobileCtaBtn}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span>Lihat Harga</span>
                <ArrowRight size={16} />
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};
