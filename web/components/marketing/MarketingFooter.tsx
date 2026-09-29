'use client';

import React from 'react';
import Link from 'next/link';
import { KlikUmrohBrand } from './KlikUmrohBrand';
import { usePlatformSettings, whatsappLink } from '../../lib/usePlatformSettings';
import styles from './MarketingFooter.module.css';

export const MarketingFooter: React.FC = () => {
  const { settings } = usePlatformSettings();
  const contactLink = whatsappLink(settings.whatsapp_number);

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        {/* Top */}
        <div className={styles.footerTop}>
          {/* Brand Column */}
          <div className={styles.brandColumn}>
            <KlikUmrohBrand theme="dark" iconSize={28} />
            <p className={styles.description}>
              Platform agen dan affiliate dengan manajemen prospek serta tools marketing siap pakai untuk travel umroh Indonesia.
            </p>
          </div>

          {/* Links Columns */}
          <div className={styles.linksGrid}>
            {/* Produk */}
            <div className={styles.linkCol}>
              <h4 className={styles.colTitle}>Produk</h4>
              <ul className={styles.colLinks}>
                <li><a href="#fitur">Agen & affiliate</a></li>
                <li><a href="#fitur">Manajemen prospek</a></li>
                <li><a href="#fitur">Tools marketing</a></li>
                <li><a href="#harga">Harga</a></li>
              </ul>
            </div>

            {/* Perusahaan */}
            <div className={styles.linkCol}>
              <h4 className={styles.colTitle}>Perusahaan</h4>
              <ul className={styles.colLinks}>
                <li><a href="#demo">Tentang KlikUmroh</a></li>
                {contactLink && (
                  <li>
                    <a href={contactLink} target="_blank" rel="noopener noreferrer">
                      Kontak
                    </a>
                  </li>
                )}
                <li><a href="#faq">FAQ</a></li>
              </ul>
            </div>

          {/* Akses */}
            <div className={styles.linkCol}>
              <h4 className={styles.colTitle}>Akses</h4>
              <ul className={styles.colLinks}>
                <li>
                  <Link href="/login">
                    Login travel
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className={styles.footerBottom}>
          <span className={styles.copyright}>© 2026 KlikUmroh.id</span>
          {(settings.privacy_url || settings.terms_url) && (
            <span className={styles.legal}>
              {settings.privacy_url && (
                <a href={settings.privacy_url} target="_blank" rel="noopener noreferrer">
                  Kebijakan Privasi
                </a>
              )}
              {settings.privacy_url && settings.terms_url && '   •   '}
              {settings.terms_url && (
                <a href={settings.terms_url} target="_blank" rel="noopener noreferrer">
                  Syarat & Ketentuan
                </a>
              )}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
};
