'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Instrument_Serif } from 'next/font/google';
import { ArrowRight, Check, ChevronDown, Menu, Quote, X } from 'lucide-react';
import { formatPromoDay, payablePrice, type PlanTier } from '../../lib/pricingPlans';
import pipelineShot from '../../public/landing/pipeline.png';
import agentShot from '../../public/landing/portal-agen.png';
import heroShot from '../../public/landing/hero.png';
import whitelabelShot from '../../public/landing/whitelabel.png';
import { KlikUmrohBrand } from '../marketing/KlikUmrohBrand';
import { MarketingEcosystemBar } from '../marketing/MarketingEcosystemBar';
import styles from './MarketingV3View.module.css';
import { MarketingPixelPattern } from './MarketingPixelPattern';
import { MarketingJourney } from './MarketingJourney';
import { MarketingV3Footer } from './MarketingV3Footer';

const serif = Instrument_Serif({ weight: '400', subsets: ['latin'], variable: '--km-font-display', display: 'swap' });
const money = (amount: number) => `Rp${amount.toLocaleString('id-ID')}`;

export function MarketingV3View({ plans }: { plans: PlanTier[] }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const lowestMonthly = Math.min(...plans.map(plan => plan.monthlyEquivalent));
  const [demoBase, setDemoBase] = useState('https://demo.klikumroh.id');
  useEffect(() => {
    const { hostname, port, protocol } = window.location;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser hostname selects the local demo after hydration.
    if (hostname === 'localhost' || hostname === '127.0.0.1') setDemoBase(`${protocol}//demo.localhost:${port || '3000'}`);
  }, []);

  return (
    <div className={`${styles.page} ${serif.variable}`}>
      <header className={styles.header} onKeyDown={(event) => {
        if (event.key === 'Escape' && mobileMenuOpen) {
          setMobileMenuOpen(false);
          event.currentTarget.querySelector<HTMLButtonElement>('[aria-controls="marketing-v3-mobile-menu"]')?.focus();
        }
      }}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Link href="/" aria-label="KlikUmroh"><KlikUmrohBrand /></Link>
          <nav aria-label="Navigasi halaman"><a href="#cara-kerja">Cara kerja</a><a href="#fitur">Fitur</a><a href="#harga">Harga</a></nav>
          <div className={styles.headerActions}><Link href="/login" className={styles.loginButton}>Login</Link><Link href="/demo" className={styles.button}>Coba demo <ArrowRight aria-hidden="true" /></Link></div>
          <button type="button" className={styles.mobileMenuToggle} aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'} aria-expanded={mobileMenuOpen} aria-controls="marketing-v3-mobile-menu" onClick={() => setMobileMenuOpen(open => !open)}>{mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
        </div>
        {mobileMenuOpen && <div className={styles.mobileMenuPanel} id="marketing-v3-mobile-menu">
          <nav aria-label="Navigasi mobile"><a href="#cara-kerja" onClick={() => setMobileMenuOpen(false)}>Cara kerja</a><a href="#fitur" onClick={() => setMobileMenuOpen(false)}>Fitur</a><a href="#harga" onClick={() => setMobileMenuOpen(false)}>Harga</a></nav>
          <div className={styles.mobileMenuActions}><Link href="/login" className={styles.loginButton} onClick={() => setMobileMenuOpen(false)}>Login</Link><Link href="/demo" className={styles.button} onClick={() => setMobileMenuOpen(false)}>Coba demo <ArrowRight aria-hidden="true" /></Link></div>
        </div>}
      </header>

      <main>
        <section className={`${styles.hero} ${styles.patterned}`}>
          <MarketingPixelPattern />
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <p className={styles.overline}>KlikUmroh untuk pemilik travel umroh</p>
              <h1>Bantu <span className={styles.heroHighlight}>agen</span> membawa calon jamaah ke travel Anda.</h1>
              <p className={styles.lead}>Berikan agen link paket dan bahan promosi. Calon jamaah yang mengisi form tercatat di dashboard, lengkap dengan sumber agennya.</p>
              <div className={styles.actions}><Link href="/demo" className={styles.button}>Coba demo dashboard <ArrowRight aria-hidden="true" /></Link><a href="#harga" className={styles.textLink}>Lihat harga</a></div>
              <p className={styles.small}>Demo tersedia tanpa membuat akun travel.</p>
            </div>
          </div>
          <figure className={`${styles.container} ${styles.heroVisual}`}>
            <Image src={heroShot} alt="Dashboard travel dan portal agen KlikUmroh" priority sizes="(min-width: 1200px) 1120px, 100vw" />
          </figure>
        </section>

        <MarketingEcosystemBar />

        <section className={`${styles.section} ${styles.whitelabelSection}`} id="fitur" aria-labelledby="whitelabel-heading">
          <div className={`${styles.container} ${styles.featureGrid}`}>
            <figure className={styles.visual}><Image src={whitelabelShot} alt="Pengaturan logo dan warna travel di dashboard KlikUmroh serta contoh website travel pada ponsel" sizes="(min-width: 960px) 50vw, 100vw" /></figure>
            <div className={styles.featureCopy}>
              <p className={styles.overline}>Website travel</p>
              <h2 id="whitelabel-heading">Website dengan nama travel Anda.</h2>
              <p>Calon jamaah melihat paket di website travel Anda, dengan logo dan warna brand sendiri. Kelola identitas, banner, dan informasi paket dari dashboard KlikUmroh.</p>
              <ul className={styles.benefits}>
                <li><Check aria-hidden="true" /> Gunakan nama, logo, dan warna travel sendiri</li>
                <li><Check aria-hidden="true" /> Tampilkan paket, banner, dan profil travel</li>
                <li><Check aria-hidden="true" /> Pakai subdomain travel atau hubungkan domain sendiri</li>
              </ul>
              <a href={demoBase} className={styles.textLink}>Lihat contoh website travel <ArrowRight aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={`${styles.container} ${styles.featureGrid}`}>
            <figure className={styles.visual}><Image src={pipelineShot} alt="Daftar prospek dan status pada dashboard travel" sizes="(min-width: 960px) 50vw, 100vw" /><figcaption>Contoh daftar prospek di dashboard travel.</figcaption></figure>
            <div className={styles.featureCopy}><p className={styles.overline}>Dashboard travel</p><h2>Prospek dari agen mana? Sudah dihubungi?</h2><p>Periksa sumber dan status prospek tanpa meminta laporan satu per satu ke agen.</p><ul className={styles.benefits}><li><Check aria-hidden="true" /> Lihat prospek dari website, iklan, dan agen</li><li><Check aria-hidden="true" /> Catat status tindak lanjut dan pendaftaran</li><li><Check aria-hidden="true" /> Periksa komisi agen dan unduh data CSV</li></ul><Link href="/demo" className={styles.textLink}>Coba demo dashboard <ArrowRight aria-hidden="true" /></Link></div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.agentSection} ${styles.patterned}`}>
          <MarketingPixelPattern />
          <div className={`${styles.container} ${styles.featureGrid}`}>
            <div className={styles.featureCopy}><p className={styles.overline}>Portal agen</p><h2>Agen punya link paket dan bahan untuk promosi.</h2><p>Caption, contoh chat WhatsApp, dan ide mencari calon jamaah tersedia di portal. Agen juga bisa melihat progres prospek dan catatan komisinya.</p><ul className={styles.benefits}><li><Check aria-hidden="true" /> Bagikan paket lewat link referral sendiri</li><li><Check aria-hidden="true" /> Gunakan materi promosi yang tersedia</li><li><Check aria-hidden="true" /> Pantau prospek dan komisi dari ponsel</li></ul><a href={`${demoBase}/agen/login?demo=1`} className={styles.textLink}>Lihat portal agen <ArrowRight aria-hidden="true" /></a></div>
            <figure className={`${styles.visual} ${styles.agentVisual}`}><Image src={agentShot} alt="Portal agen pada ponsel, berisi paket dan bahan promosi" sizes="(min-width: 960px) 560px, 100vw" /><figcaption>Portal agen tetap dirancang untuk ponsel.</figcaption></figure>
          </div>
        </section>

        <MarketingJourney />

        <section className={styles.demoSection}>
          <div className={`${styles.container} ${styles.demoInner}`}><div><h2>Lihat cara kerjanya dengan data demo.</h2><p>Coba daftar prospek sebagai owner, lalu buka portal sebagai agen.</p></div><div className={styles.demoActions}><Link className={styles.button} href="/demo">Coba demo dashboard <ArrowRight aria-hidden="true" /></Link><a className={styles.textLink} href={demoBase}>Lihat website travel demo <ArrowRight aria-hidden="true" /></a></div></div>
        </section>

        <section className={`${styles.section} ${styles.testimonials}`} aria-labelledby="testimoni-heading">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <h2 id="testimoni-heading">Kata mereka tentang KlikUmroh</h2>
            </div>
            {/* Dummy quotes for this preview layout; replace with verified customer quotes before production release. */}
            <div className={styles.testimonialGrid}>
              <article>
                <blockquote><Quote className={styles.quoteMark} aria-hidden="true" /><p>Yang paling kepakai buat saya daftar prospeknya. Kelihatan calon jamaah ini dari agen siapa dan sudah sampai tahap mana. Jadi kalau tanya ke tim, saya sudah tahu yang mau ditanyakan.</p></blockquote>
                <p className={styles.testimonialRole}>Pemilik travel</p>
              </article>
              <article>
                <blockquote><Quote className={styles.quoteMark} aria-hidden="true" /><p>Saya sering bingung mau nulis apa buat promosi. Ada contoh caption di sini, tinggal saya sesuaikan dengan cara ngomong saya. Kalau ada yang tanya paket, saya kirim linknya.</p></blockquote>
                <p className={styles.testimonialRole}>Agen travel</p>
              </article>
              <article>
                <blockquote><Quote className={styles.quoteMark} aria-hidden="true" /><p>Enaknya catatan prospek bisa saya baca dulu sebelum menghubungi. Saya tahu terakhir bahas apa, jadi tidak mulai dari awal lagi. Setelah itu tinggal perbarui statusnya.</p></blockquote>
                <p className={styles.testimonialRole}>Tim pemasaran travel</p>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.section} id="harga">
          <div className={styles.container}><div className={styles.pricingHeading}><h2>Pilih durasi berlangganan</h2><p>Fiturnya sama. Langganan lebih lama, biaya per bulan lebih rendah.</p></div>
            {plans.length > 0 ? <><div className={styles.plans}>{plans.map((plan) => {
              const bestValue = plan.monthlyEquivalent === lowestMonthly && Boolean(plan.discountBadge);
              return <article className={`${styles.plan} ${bestValue ? styles.bestValue : ''}`} key={plan.id}>
                <div className={styles.planHeader}><h3>{plan.periodMonths} bulan</h3>{plan.promoPercent ? <span className={`${styles.discountBadge} ${styles.promoBadge}`}>Promo {plan.promoPercent}%</span> : plan.discountBadge && <span className={styles.discountBadge}>{plan.discountBadge}</span>}</div>
                <p className={styles.monthly}>{plan.promoPrice != null && <s className={styles.oldMonthly}>{money(Math.round(plan.price / plan.periodMonths))}</s>}{money(plan.monthlyEquivalent)}<span> / bulan</span></p>
                <p className={styles.planNote}>{plan.promoPercent ? `Promo travel baru${plan.promoEndsAt ? ` sampai ${formatPromoDay(plan.promoEndsAt)}` : ''}` : bestValue ? 'Biaya per bulan paling rendah' : plan.discountBadge ? 'Lebih hemat dari paket 3 bulan' : 'Durasi langganan paling singkat'}</p>
                <dl className={styles.total}><dt>Total pembayaran</dt><dd>{plan.promoPrice != null && <s className={styles.oldPrice}>{money(plan.price)}</s>}{money(payablePrice(plan))}</dd></dl>
                <p className={styles.planPayNote}>Dibayar sekali untuk {plan.periodMonths} bulan.{plan.promoPrice != null ? ' Perpanjangan memakai harga normal.' : ''}</p>
                <ul className={styles.planBenefits}><li><Check aria-hidden="true" /> Website travel dan form minat</li><li><Check aria-hidden="true" /> Dashboard prospek dan komisi</li><li><Check aria-hidden="true" /> Portal agen dan materi promosi</li><li><Check aria-hidden="true" /> Jumlah agen tidak dibatasi</li></ul>
                <Link href={`/marketing/checkout?plan_id=${plan.id}`} className={styles.planLink}>Berlangganan {plan.periodMonths} bulan <ArrowRight aria-hidden="true" /></Link>
              </article>;
            })}</div><p className={styles.billingNote}>Semua paket mencakup fitur yang sama. Dibayar sekaligus untuk durasi yang dipilih. Diskon dihitung dari biaya bulanan paket 3 bulan.</p></> : <p className={styles.unavailable}>Harga belum dapat dimuat. Silakan coba lagi nanti.</p>}
          </div>
        </section>

        <section className={`${styles.section} ${styles.faqSection}`}><div className={`${styles.container} ${styles.faqGrid}`}><div><h2>Yang perlu Anda tahu</h2><p>KlikUmroh berfokus pada agen, promosi, dan pencatatan calon jamaah.</p></div><div className={styles.questions}>
          <details><summary>Apakah jamaah otomatis bertambah?<ChevronDown aria-hidden="true" /></summary><p>Tidak otomatis. KlikUmroh menyediakan link, bahan promosi, dan pencatatan prospek. Travel tetap perlu mengaktifkan agen, berpromosi, dan menghubungi calon jamaah.</p></details>
          <details><summary>Saya baru mulai merekrut agen. Bisa memakai KlikUmroh?<ChevronDown aria-hidden="true" /></summary><p>Bisa. Travel dapat menyiapkan paket, materi, dan komisi sebelum mengajak agen bergabung. Perekrutan agen tetap dilakukan oleh travel.</p></details>
          <details><summary>Apakah ini menggantikan sistem operasional travel?<ChevronDown aria-hidden="true" /></summary><p>Tidak. KlikUmroh tidak mengelola visa, dokumen perjalanan, akomodasi, atau akuntansi. Anda tetap bisa memakai sistem operasional yang sudah ada.</p></details>
          <details><summary>Bisakah data prospek diunduh?<ChevronDown aria-hidden="true" /></summary><p>Bisa. Dashboard menyediakan unduhan data prospek dalam format CSV.</p></details>
          <details><summary>Apa yang dimaksud website white label?<ChevronDown aria-hidden="true" /></summary><p>Website memakai nama, logo, dan warna travel Anda. KlikUmroh menyediakan sistem di belakangnya. Anda dapat memakai subdomain travel di klikumroh.id atau menghubungkan domain sendiri.</p></details>
          <details><summary>Apa yang perlu disiapkan sebelum mulai?<ChevronDown aria-hidden="true" /></summary><p>Siapkan identitas travel, informasi paket umroh, dan aturan komisi agen. Tambahkan paket dan ajak agen bergabung untuk mulai membagikan link referral.</p></details>
          <details><summary>Bagaimana jika agen belum terbiasa berpromosi?<ChevronDown aria-hidden="true" /></summary><p>Agen bisa memakai contoh caption dan chat WhatsApp di portal, lalu menyesuaikannya dengan cara bicara mereka. Travel tetap perlu mengajak agen menggunakan materi dan membagikan paket secara rutin.</p></details>
          <details><summary>Apa yang terjadi setelah saya membayar?<ChevronDown aria-hidden="true" /></summary><p>Unggah bukti transfer pada halaman tagihan. Tim KlikUmroh memeriksa pembayaran sebelum mengaktifkan langganan. Setelah aktif, Anda dapat menyiapkan website travel, paket, dan portal agen.</p></details>
          <details><summary>Bisakah saya meminta bantuan saat menyiapkan travel?<ChevronDown aria-hidden="true" /></summary><p>Hubungi tim KlikUmroh melalui <a href="https://wa.me/6289612779919">WhatsApp</a> atau <a href="mailto:support@klikumroh.id">support@klikumroh.id</a> untuk bantuan penggunaan dan pengaturan awal.</p></details>
          <details id="garansi"><summary>Apakah ada garansi uang kembali?<ChevronDown aria-hidden="true" /></summary><p>Ya, tersedia garansi 14 hari uang kembali. Untuk mengajukan pengembalian dana, hubungi tim KlikUmroh melalui <a href="https://wa.me/6289612779919">WhatsApp</a> atau <a href="mailto:support@klikumroh.id">support@klikumroh.id</a> dengan informasi akun travel dan tagihan Anda.</p></details>
        </div></div></section>

        <section className={`${styles.closing} ${styles.patterned}`}><MarketingPixelPattern /><div className={styles.container}><h2>Coba KlikUmroh sebelum berlangganan.</h2><p>Buka dashboard demo untuk melihat prospek, sumber agen, dan statusnya.</p><Link href="/demo" className={styles.button}>Coba demo dashboard <ArrowRight aria-hidden="true" /></Link></div></section>
      </main>
      <MarketingV3Footer />
    </div>
  );
}
