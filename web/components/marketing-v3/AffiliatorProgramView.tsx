import Link from 'next/link';
import { Instrument_Serif } from 'next/font/google';
import { ArrowRight } from 'lucide-react';
import { KlikUmrohBrand } from '../marketing/KlikUmrohBrand';
import { MarketingV3Footer } from './MarketingV3Footer';
import styles from './MarketingV3View.module.css';
import page from './AffiliatorProgramView.module.css';

const serif = Instrument_Serif({ weight: '400', subsets: ['latin'], variable: '--km-font-display', display: 'swap' });

export interface AffiliatorProgram {
  first_rate: number;
  renewal_rate: number;
  coupon_discount: number;
  hold_days: number;
  min_payout: number;
}

const pct = (n: number) => `${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

// Affiliator KlikUmroh program page: what it is, how the commission works, the rules, and the terms the
// affiliator agrees to on the signup form. Every number comes from the program settings.
export function AffiliatorProgramView({ program, signupUrl, loginUrl }: { program: AffiliatorProgram | null; signupUrl: string; loginUrl: string }) {
  const p = program;
  return (
    <div className={`${styles.page} ${serif.variable}`}>
      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Link href="/" aria-label="KlikUmroh"><KlikUmrohBrand /></Link>
          <div className={styles.headerActions}>
            <a href={loginUrl} className={styles.loginButton}>Masuk affiliator</a>
            <a href="#syarat" className={styles.button}>Daftar <ArrowRight aria-hidden="true" /></a>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={`${styles.container} ${page.hero}`}>
            <p className={styles.overline}>Program Affiliator KlikUmroh</p>
            <h1>Ajak travel umroh memakai KlikUmroh, dapatkan komisi dari setiap pembayarannya.</h1>
            <p className={styles.lead}>
              {p
                ? `Komisi ${pct(p.first_rate)} dari pembayaran pertama dan ${pct(p.renewal_rate)} dari setiap perpanjangan, selama travel yang Anda bawa terus berlangganan.`
                : 'Komisi dari pembayaran pertama dan setiap perpanjangan, selama travel yang Anda bawa terus berlangganan.'}
            </p>
            <div className={page.heroActions}>
              <a href="#syarat" className={styles.button}>Baca syarat lalu daftar <ArrowRight aria-hidden="true" /></a>
              <a href="#aturan" className={styles.textLink}>Lihat aturan main</a>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${page.band}`} aria-labelledby="cara-heading">
          <div className={styles.container}>
            <h2 id="cara-heading">Cara kerjanya</h2>
            <ol className={page.steps}>
              <li><b>Daftar gratis.</b> Akun langsung aktif. Anda mendapat link pribadi dan bisa membuat satu kode kupon.</li>
              <li><b>Bagikan link atau kupon.</b> {p ? `Kupon Anda memberi travel baru diskon ${pct(p.coupon_discount)} untuk pembayaran pertamanya.` : 'Kupon Anda memberi travel baru diskon untuk pembayaran pertamanya.'}</li>
              <li><b>Travel berlangganan.</b> Komisi tercatat saat tim KlikUmroh menyetujui pembayarannya, untuk pembayaran pertama dan setiap perpanjangan.</li>
              <li><b>Cairkan komisi.</b> {p ? `Setelah ditahan ${p.hold_days} hari, komisi bisa diajukan pencairan mulai ${rupiah(p.min_payout)}. Tim KlikUmroh mentransfer ke rekening Anda.` : 'Setelah masa tahan, komisi bisa diajukan pencairan. Tim KlikUmroh mentransfer ke rekening Anda.'}</li>
            </ol>
          </div>
        </section>

        <section className={styles.section} id="aturan" aria-labelledby="aturan-heading">
          <div className={`${styles.container} ${page.copy}`}>
            <h2 id="aturan-heading">Aturan main</h2>
            {p && (
              <dl className={page.figures}>
                <div><dt>Komisi pembayaran pertama</dt><dd>{pct(p.first_rate)}</dd></div>
                <div><dt>Komisi setiap perpanjangan</dt><dd>{pct(p.renewal_rate)}</dd></div>
                <div><dt>Diskon kupon untuk travel baru</dt><dd>{pct(p.coupon_discount)}</dd></div>
                <div><dt>Masa tahan komisi</dt><dd>{p.hold_days} hari</dd></div>
                <div><dt>Minimal pencairan</dt><dd>{rupiah(p.min_payout)}</dd></div>
              </dl>
            )}
            <ul className={page.rules}>
              <li>Komisi dihitung dari tagihan langganan setelah diskon, tanpa kode unik transfer, dan hanya dari pembayaran yang sudah disetujui tim KlikUmroh.</li>
              <li>Travel tercatat milik Anda jika mendaftar memakai kupon Anda, atau lewat link Anda dalam 60 hari sejak link dibuka. Jika travel memakai kupon affiliator lain, komisi menjadi milik pemilik kupon tersebut.</li>
              <li>Satu travel hanya milik satu affiliator. Kepemilikan ditentukan saat travel mendaftar dan tidak berpindah.</li>
              <li>Kupon affiliator hanya berlaku untuk pendaftaran travel baru, tidak untuk perpanjangan. Setiap affiliator memiliki satu kupon aktif; mengganti kode membuat kupon lama tidak berlaku.</li>
              <li>Program ini satu tingkat. Tidak ada komisi dari affiliator lain yang Anda ajak.</li>
              <li>Tidak ada komisi untuk langganan yang diaktifkan tanpa pembayaran, tagihan yang ditolak atau dibatalkan, dan travel yang didaftarkan dengan email atau nomor WhatsApp Anda sendiri.</li>
            </ul>
          </div>
        </section>

        <section className={`${styles.section} ${page.band}`} id="syarat" aria-labelledby="syarat-heading">
          <div className={`${styles.container} ${page.copy}`}>
            <h2 id="syarat-heading">Syarat dan ketentuan</h2>
            <p className={page.note}>Dengan mendaftar sebagai Affiliator KlikUmroh, Anda menyetujui ketentuan berikut.</p>
            <ol className={page.terms}>
              <li>Data pendaftaran dan rekening pencairan harus benar dan atas nama Anda sendiri. Komisi hanya ditransfer ke rekening yang tercatat di akun affiliator.</li>
              <li>Anda berpromosi atas nama sendiri, bukan sebagai karyawan atau perwakilan resmi KlikUmroh, dan tidak memberikan janji tentang fitur, harga, atau hasil yang tidak tercantum di situs KlikUmroh.</li>
              <li>Dilarang memasang kode atau link affiliator di situs kumpulan kupon, menjalankan iklan berbayar yang memakai nama atau merek KlikUmroh, mengirim pesan massal tanpa izin penerima (spam), atau membuat pendaftaran travel palsu.</li>
              <li>Persentase komisi, diskon kupon, masa tahan, dan minimal pencairan dapat berubah. Perubahan berlaku untuk komisi berikutnya; komisi yang sudah tercatat tidak berubah.</li>
              <li>KlikUmroh dapat menonaktifkan akun affiliator yang melanggar ketentuan ini. Akun nonaktif tidak dapat masuk, kuponnya tidak berlaku, dan tidak mendapat komisi baru, termasuk dari perpanjangan travel yang pernah dibawa.</li>
              <li>Pencairan diproses manual oleh tim KlikUmroh. Pengajuan dapat ditolak dengan alasan, misalnya data rekening tidak sesuai; komisinya kembali ke saldo dan dapat diajukan lagi.</li>
              <li>Kewajiban pajak atas komisi mengikuti peraturan perpajakan yang berlaku.</li>
              <li>KlikUmroh dapat memperbarui syarat dan ketentuan ini. Perubahan diumumkan di halaman ini.</li>
            </ol>
            <div className={page.signup}>
              <a href={signupUrl} className={styles.button}>Saya setuju, lanjut daftar <ArrowRight aria-hidden="true" /></a>
              <p className={styles.small}>
                Pertanyaan tentang program? Hubungi <a href="https://wa.me/6289612779919">WhatsApp</a> atau <a href="mailto:support@klikumroh.id">support@klikumroh.id</a>.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingV3Footer />
    </div>
  );
}
