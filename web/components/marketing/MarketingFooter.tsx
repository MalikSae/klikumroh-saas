'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from './MarketingFooter.module.css';

export const MarketingFooter: React.FC = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        {/* Top */}
        <div className={styles.footerTop}>
          {/* Brand Column */}
          <div className={styles.brandColumn}>
            <Image
              src="/klikumroh-logo-white.png"
              alt="KlikUmroh.id"
              width={180}
              height={50}
              className={styles.footerLogo}
            />
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
                <li>
                  <a
                    href="https://wa.me/6281234567890"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Kontak
                  </a>
                </li>
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
          <span className={styles.legal}>Kebijakan Privasi   •   Syarat & Ketentuan</span>
        </div>
      </div>
    </footer>
  );
};
