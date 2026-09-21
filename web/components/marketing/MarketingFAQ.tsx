'use client';

import React, { useState } from 'react';
import { MessageCircle, Plus, Minus } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
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
    a: 'Sangat aman. KlikUmroh menggunakan arsitektur isolasi multi-tenant ketat dan terenkripsi. Seluruh database prospek, daftar jamaah, dan omzet adalah hak milik eksklusif biro travel Anda. Kami tidak pernah mengakses, mengontak, atau membagikan kontak jamaah Anda kepada pihak ketiga mana pun.',
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
    a: 'Ya, 100% aman. Data travel Anda terisolasi secara multi-tenant murni, terenkripsi, dan tidak pernah diakses atau dibagikan ke pihak mana pun. Anda dapat mengekspornya ke format Excel/CSV kapan saja.',
  },
];

export const MarketingFAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

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
          <a
            href="https://wa.me/6281234567890?text=Halo%20KlikUmroh,%20saya%20ingin%20tanya%20seputar%20platform"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.whatsappBtn}
          >
            <MessageCircle size={18} />
            <span>Tanya lewat WhatsApp</span>
          </a>
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
