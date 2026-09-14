import React from 'react';
import { Button } from './Button';
import './CTASection.css';

export interface CTASectionProps {
  onOpenModal: () => void;
}

export const CTASection: React.FC<CTASectionProps> = ({ onOpenModal }) => {
  return (
    <section className="tw-cta">
      <div className="tw-cta__card">
        <h2 className="tw-cta__title">
          Belum menemukan paket yang cocok?
        </h2>

        <p className="tw-cta__text">
          Sampaikan rencana keberangkatan dan jumlah jamaah. Tim travel akan membantu Anda memilih paket yang sesuai.
        </p>

        <div className="tw-cta__action">
          <Button variant="primary" size="lg" onClick={onOpenModal}>
            <span>Bantu saya memilih paket</span>
          </Button>
        </div>
      </div>
    </section>
  );
};
