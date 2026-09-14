'use client';

import React, { useState } from 'react';
import { MessageCircle, Plus, Minus } from 'lucide-react';
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
    q: 'Apakah cocok untuk travel yang belum punya agen?',
    a: 'Sangat cocok. KlikUmroh menyediakan tools marketing siap pakai (sumber jamaah, bank caption, script WhatsApp) sehingga Anda bisa mulai merekrut dan membekali agen baru dari nol dengan sistem yang sudah siap.',
  },
  {
    q: 'Bagaimana sistem mengetahui jamaah berasal dari agen mana?',
    a: 'Setiap agen memiliki link referral unik. Saat prospek mengisi form minat, sumber dan nama agen otomatis terkunci di database dan masuk ke pipeline prospek bersama.',
  },
  {
    q: 'Apakah agen perlu menggunakan laptop?',
    a: 'Tidak perlu. Portal agen dirancang nyaman dan ringan diakses langsung dari browser HP (mobile-friendly), tanpa perlu instalasi aplikasi rumit.',
  },
  {
    q: 'Apakah jumlah agen dibatasi?',
    a: 'Tidak dibatasi. Semua paket langganan KlikUmroh mendukung penambahan agen tanpa batas (unlimited agents) tanpa biaya tambahan per agen.',
  },
  {
    q: 'Apakah website dapat memakai brand travel kami?',
    a: 'Ya. KlikUmroh bekerja di belakang layar secara whitelabel. Website publik dan portal agen menggunakan nama, logo, warna identitas, serta custom domain resmi travel Anda.',
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
        <div className={styles.faqIntro}>
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
        </div>

        {/* Right: FAQ Accordion */}
        <div className={styles.faqList}>
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div key={idx} className={styles.faqItem}>
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
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
