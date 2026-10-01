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

// Only the travel's own FAQ is shown (Website > FAQ in the dashboard). With none, the section is hidden:
// no built-in answers that promise facilities, schedules, or payment terms on the travel's behalf.
export const FAQAccordion: React.FC<FAQAccordionProps> = ({ faqs = [] }) => {
  const activeFaqs = faqs;
  const [openId, setOpenId] = useState<number | null>(activeFaqs[0]?.id || null);

  const toggle = (id: number) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  if (activeFaqs.length === 0) return null;

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
