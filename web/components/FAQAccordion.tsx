'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import './FAQAccordion.css';

export interface PublicFAQItem {
  id: number;
  question: string;
  answer: string;
  display_order?: number;
}

export interface FAQAccordionProps {
  faqs?: PublicFAQItem[];
}

const DEFAULT_FAQS: PublicFAQItem[] = [
  {
    id: 1,
    question: 'Apakah paket umroh sudah termasuk tiket pesawat & visa?',
    answer: 'Ya, seluruh paket kami adalah all-in, sudah mencakup tiket pesawat pulang-pergi, visa umroh resmi, hotel di Makkah & Madinah, konsumsi 3x sehari menu Indonesia, serta transportasi bus AC di Tanah Suci.',
  },
  {
    id: 2,
    question: 'Berapa lama estimasi proses pendaftaran & pengurusan dokumen?',
    answer: 'Pendaftaran disarankan 1-2 bulan sebelum tanggal keberangkatan agar tim kami dapat memproses paspor, vaksin meningitis, dan penerbitan visa umroh dengan nyaman dan terverifikasi.',
  },
  {
    id: 3,
    question: 'Bagaimana alur pembayaran uang muka (DP) dan pelunasan?',
    answer: 'Uang muka (DP) disetorkan saat pendaftaran untuk mengamankan kursi pesawat dan kamar hotel. Pelunasan sisa biaya dapat dicicil dan diselesaikan selambatnya 30 hari sebelum keberangkatan.',
  },
  {
    id: 4,
    question: 'Apakah ada bimbingan manasik sebelum keberangkatan?',
    answer: 'Tentu. Kami menyelenggarakan sesi manasik umroh teori dan praktik gratis untuk seluruh calon jamaah sebelum keberangkatan, dipandu langsung oleh Ustadz pembimbing ibadah.',
  },
];

export const FAQAccordion: React.FC<FAQAccordionProps> = ({ faqs = [] }) => {
  const activeFaqs = faqs.length > 0 ? faqs : DEFAULT_FAQS;
  const [openId, setOpenId] = useState<number | null>(activeFaqs[0]?.id || null);

  const toggle = (id: number) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section id="faq" className="tw-faq">
      <div className="tw-faq__header">
        <span className="tw-faq__tag">Pusat Informasi</span>
        <h2 className="tw-faq__title">Pertanyaan yang Sering Diajukan</h2>
      </div>

      <div className="tw-faq__list">
        {activeFaqs.map((item) => {
          const isOpen = openId === item.id;
          return (
            <div key={item.id} className={`tw-faq-item ${isOpen ? 'tw-faq-item--open' : ''}`}>
              <button
                type="button"
                className="tw-faq-item__trigger"
                onClick={() => toggle(item.id)}
                aria-expanded={isOpen}
              >
                <span className="tw-faq-item__question">{item.question}</span>
                <span className="tw-faq-item__icon">
                  {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </span>
              </button>

              {isOpen && (
                <div className="tw-faq-item__body">
                  <p>{item.answer}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
