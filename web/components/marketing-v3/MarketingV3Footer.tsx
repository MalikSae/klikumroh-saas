'use client';

import Link from 'next/link';
import { KlikUmrohBrand } from '../marketing/KlikUmrohBrand';
import { usePlatformSettings, whatsappLink } from '../../lib/usePlatformSettings';
import styles from './MarketingV3View.module.css';

// Footer of the KlikUmroh marketing pages (landing page and the Affiliator KlikUmroh page).
export function MarketingV3Footer() {
  const { settings } = usePlatformSettings();
  const wa = whatsappLink(settings.whatsapp_number);
  const local = settings.whatsapp_number.replace(/[^0-9]/g, '').replace(/^62/, '0');
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerGrid}`}>
        <div className={styles.footerBrand}>
          <Link href="/" aria-label="KlikUmroh"><KlikUmrohBrand /></Link>
          <p>Sistem agen dan pencatatan calon jamaah untuk travel umroh.</p>
        </div>
        <div className={styles.footerAddress}>
          <h3>Alamat KlikUmroh</h3>
          <address>Jl. H. Bokir Bin Dji&apos;un No.E 9, RT.1/RW.2, Dukuh, Kec. Kramat jati, Kota Jakarta Timur, Daerah Khusus Ibukota Jakarta 13550</address>
        </div>
        <div className={styles.footerContact}>
          <h3>Hubungi kami</h3>
          {wa && <a href={wa}><span>WhatsApp</span>{local}</a>}
          <a href="mailto:support@klikumroh.id"><span>Email</span>support@klikumroh.id</a>
        </div>
      </div>
      <div className={`${styles.container} ${styles.footerBottom}`}>
        <p>KlikUmroh.id</p>
        <nav aria-label="Navigasi footer"><Link href="/#fitur">Fitur</Link><Link href="/#harga">Harga</Link><Link href="/affiliator">Program affiliator</Link><Link href="/login">Login travel</Link></nav>
      </div>
    </footer>
  );
}
