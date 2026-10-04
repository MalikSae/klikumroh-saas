import Link from 'next/link';
import { KlikUmrohBrand } from '../marketing/KlikUmrohBrand';
import styles from './MarketingV3View.module.css';

// Footer of the KlikUmroh marketing pages (landing page and the Affiliator KlikUmroh page).
export function MarketingV3Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerGrid}`}>
        <div className={styles.footerBrand}>
          <Link href="/" aria-label="KlikUmroh"><KlikUmrohBrand /></Link>
          <p>Website, dashboard travel, dan portal agen untuk travel umroh.</p>
        </div>
        <div className={styles.footerAddress}>
          <h3>Alamat KlikUmroh</h3>
          <address>Jl. H. Bokir Bin Dji&apos;un No.E 9, RT.1/RW.2, Dukuh, Kec. Kramat jati, Kota Jakarta Timur, Daerah Khusus Ibukota Jakarta 13550</address>
        </div>
        <div className={styles.footerContact}>
          <h3>Hubungi kami</h3>
          <a href="https://wa.me/6289612779919"><span>WhatsApp</span>089612779919</a>
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
