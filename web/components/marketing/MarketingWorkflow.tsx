'use client';

import React from 'react';
import { Search, Share2, UserPlus, MessagesSquare, BadgeDollarSign } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';
import styles from './MarketingWorkflow.module.css';

const STEPS = [
  {
    num: '01',
    icon: Search,
    title: 'Cari calon jamaah',
    desc: 'Pilih dari 99 ide sumber yang paling dekat.',
    highlighted: false,
  },
  {
    num: '02',
    icon: Share2,
    title: 'Mulai promosi',
    desc: 'Gunakan copy promosi dan link referral.',
    highlighted: false,
  },
  {
    num: '03',
    icon: UserPlus,
    title: 'Prospek masuk',
    desc: 'Nama dan sumber agen otomatis tercatat.',
    highlighted: false,
  },
  {
    num: '04',
    icon: MessagesSquare,
    title: 'Follow-up bersama',
    desc: 'Gunakan script WhatsApp; progres terlihat kedua pihak.',
    highlighted: false,
  },
  {
    num: '05',
    icon: BadgeDollarSign,
    title: 'Closing & komisi',
    desc: 'Travel konfirmasi closing, komisi tercatat.',
    highlighted: true,
  },
];

export const MarketingWorkflow: React.FC = () => {
  return (
    <section id="cara-kerja" className={styles.section}>
      <div className={styles.container}>
        <ScrollReveal animation="fade-up">
          <div className={styles.heading}>
            <span className={styles.eyebrow}>CARA KERJANYA</span>
            <h2 className={styles.headline}>
              Agen mulai promosi. Setiap prospek yang masuk bisa dipantau bersama.
            </h2>
            <p className={styles.description}>
              Agen dan travel melihat status, catatan, dan tindak lanjut yang sama.
            </p>
          </div>
        </ScrollReveal>

        <div className={styles.stepsGrid}>
          {STEPS.map((step, index) => {
            const IconComponent = step.icon;
            return (
              <ScrollReveal
                key={step.num}
                as="div"
                className={`${styles.stepCard} ${step.highlighted ? styles.stepCardHighlighted : ''}`}
                animation="fade-up"
                delay={index * 90}
              >
                <div className={styles.stepTop}>
                  <span className={`${styles.stepNum} ${step.highlighted ? styles.stepNumHighlighted : ''}`}>
                    {step.num}
                  </span>
                  <IconComponent
                    size={20}
                    className={`${styles.stepIcon} ${step.highlighted ? styles.stepIconHighlighted : ''}`}
                  />
                </div>
                <div className={styles.stepContent}>
                  <h3 className={`${styles.stepTitle} ${step.highlighted ? styles.stepTitleHighlighted : ''}`}>
                    {step.title}
                  </h3>
                  <p className={`${styles.stepDesc} ${step.highlighted ? styles.stepDescHighlighted : ''}`}>
                    {step.desc}
                  </p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};
