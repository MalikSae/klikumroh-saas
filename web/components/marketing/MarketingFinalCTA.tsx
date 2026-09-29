'use client';

import React from 'react';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import { usePlatformSettings, whatsappLink } from '../../lib/usePlatformSettings';
import styles from './MarketingFinalCTA.module.css';

export const MarketingFinalCTA: React.FC = () => {
  const { settings } = usePlatformSettings();
  const demoLink = whatsappLink(
    settings.whatsapp_number,
    'Halo KlikUmroh, saya owner travel ingin jadwalkan sesi demo dan tanya platform'
  );

  return (
    <section id="demo" className={styles.section}>
      <ScrollReveal as="div" className={styles.container} animation="scale-up">
        <span className={styles.eyebrow}>
          AGEN, PROSPEK, DAN TOOLS MARKETING DALAM SATU ALUR
        </span>

        <h2 className={styles.headline}>
          Siap Mengubah Jaringan Agen Anda Menjadi Mesin Closing Jamaah?
        </h2>

        <p className={styles.body}>
          Pilih paket langganan Anda hari ini untuk langsung mengaktifkan sistem, atau diskusikan kebutuhan biro travel Anda bersama tim kami via WhatsApp.
        </p>

        <div className={styles.actions}>
          <a href="#harga" className={styles.primaryBtn}>
            <span>Lihat pilihan paket</span>
            <ArrowRight size={16} />
          </a>
          {demoLink && (
            <a href={demoLink} target="_blank" rel="noopener noreferrer" className={styles.secondaryBtn}>
              <MessageCircle size={16} />
              <span>Konsultasi Gratis</span>
            </a>
          )}
        </div>
      </ScrollReveal>
    </section>
  );
};
