'use client';

import React, { useState } from 'react';
import { MessageCircle, Plus, Minus } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import { usePlatformSettings, whatsappLink } from '../../lib/usePlatformSettings';
import styles from './MarketingFAQ.module.css';

interface FAQItem {
  q: string;
  a: string;
}

const FAQS: FAQItem[] = [
  {
    q: 'Apakah KlikUmroh menggantikan ERP travel?',
    a: 'Tidak. KlikUmroh fokus pada agen, referral, prospek, komisi, dan tools marketing. Sistem dokumen, visa, keuangan, dan keberangkatan tetap dapat digunakan seperti biasa.',
  },
  {
    q: 'Apakah data jamaah kami aman dan tidak akan bocor ke travel lain?',
    a: 'Data setiap travel terisolasi ketat per akun dan dikirim lewat koneksi terenkripsi (HTTPS). Seluruh database prospek, daftar jamaah, dan omzet adalah milik biro travel Anda. Kami tidak mengontak jamaah Anda dan tidak membagikan datanya ke pihak ketiga. Staf KlikUmroh hanya membuka data untuk keperluan support, dan setiap aksesnya tercatat di Riwayat Akses Staf yang bisa Anda periksa sendiri.',
  },
  {
    q: 'Bagaimana agen mulai bergerak setelah mendaftar?',
    a: 'Agen langsung melihat materi promosi, script chat WhatsApp, ide sumber jamaah, serta link referral mereka sendiri. Semuanya sudah siap digunakan dari HP.',
  },
  {
    q: 'Apakah website publik dan portal agen menggunakan nama travel kami?',
    a: 'Ya. KlikUmroh adalah sistem whitelabel. Nama, logo, warna identitas, dan domain menggunakan milik travel Anda.',
  },
  {
    q: 'Berapa lama proses setup awal sampai sistem bisa digunakan?',
    a: 'Setelah verifikasi transfer langganan, dashboard Anda langsung aktif. Pengaturan nama, logo, paket umroh, dan komisi agen rata-rata selesai dalam 30–60 menit.',
  },
  {
    q: 'Apakah data prospek dan agen kami aman dan tidak dibagikan?',
    a: 'Ya. Data travel Anda terisolasi per akun dan tidak dibagikan ke pihak mana pun. Setiap akses staf KlikUmroh untuk keperluan support tercatat di Riwayat Akses Staf pada dashboard Anda. Anda dapat mengekspor data ke format Excel/CSV kapan saja.',
  },
];

export const MarketingFAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const { settings } = usePlatformSettings();
  const askLink = whatsappLink(settings.whatsapp_number, 'Halo KlikUmroh, saya ingin tanya seputar platform');

  const toggleFAQ = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="faq" className={styles.section}>
      <div className={styles.container}>
        {/* Left: Introduction */}
        <ScrollReveal as="div" className={styles.faqIntro} animation="fade-up">
          <span className={styles.eyebrow}>SEBELUM ANDA MEMUTUSKAN</span>
          <h2 className={styles.headline}>
            Pertanyaan yang biasanya muncul dari owner travel.
          </h2>
          <p className={styles.body}>
            Belum menemukan jawaban yang Anda cari? Tim kami dapat menunjukkan alurnya langsung dalam sesi demo.
          </p>
          {askLink && (
            <a href={askLink} target="_blank" rel="noopener noreferrer" className={styles.whatsappBtn}>
              <MessageCircle size={18} />
              <span>Tanya lewat WhatsApp</span>
            </a>
          )}
        </ScrollReveal>

        {/* Right: FAQ Accordion */}
        <div className={styles.faqList}>
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <ScrollReveal
                key={idx}
                as="div"
                className={styles.faqItem}
                animation="fade-up"
                delay={idx * 60}
              >
                <button
                  type="button"
                  className={styles.questionBtn}
                  onClick={() => toggleFAQ(idx)}
                  aria-expanded={isOpen}
                >
                  <span className={styles.questionText}>{faq.q}</span>
                  <div className={styles.toggleIcon}>
                    {isOpen ? (
                      <Minus size={18} className={styles.minusIcon} />
                    ) : (
                      <Plus size={18} className={styles.plusIcon} />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className={styles.answerBox}>
                    <p className={styles.answerText}>{faq.a}</p>
                  </div>
                )}
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};
