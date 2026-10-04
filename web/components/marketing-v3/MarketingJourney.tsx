'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { BookOpen, Send, Link2, Users, CircleCheck } from 'lucide-react';
import agentShot from '../../public/landing/portal-agen.png';
import pipelineShot from '../../public/landing/pipeline.png';
import styles from './MarketingV3View.module.css';

const journey = [
  { icon: BookOpen, title: 'Agen mendapat bahan promosi', text: 'Caption, contoh chat WhatsApp, dan link paket tersedia di portal agen.' },
  { icon: Send, title: 'Agen membagikan paket', text: 'Agen menawarkan paket lewat link referral miliknya sendiri.' },
  { icon: Link2, title: 'Prospek terhubung ke agen', text: 'Calon jamaah yang mengisi form tercatat dengan sumber agennya.' },
  { icon: Users, title: 'Agen dan travel menindaklanjuti bersama', text: 'Keduanya melihat catatan dan memperbarui status prospek yang sama.' },
  { icon: CircleCheck, title: 'Hasil closing tercatat', text: 'Travel dapat melihat jamaah closing dan catatan komisi agennya.' },
];

export function MarketingJourney() {
  const section = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const ActiveIcon = journey[active].icon;

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const list = element.querySelector('ol');
    if (!list) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const readingLine = window.innerHeight / 2;
      let current = 0;
      list.querySelectorAll('li').forEach((item, index) => {
        if (item.getBoundingClientRect().top <= readingLine) current = index;
      });
      setActive(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(list);
    schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, []);

  return (
    <section ref={section} className={styles.workflow} id="cara-kerja" aria-labelledby="journey-heading">
      <div className={styles.container}>
        <div className={styles.journeyHeading}>
          <div className={styles.sectionHeading}><h2 id="journey-heading">Dari promosi agen sampai jamaah closing.</h2><p>Prospek terhubung ke agen. Agen dan travel menjaga tindak lanjut dengan catatan yang sama.</p></div>
        </div>
        <div className={styles.journeyLayout}>
          <figure className={styles.journeyPreview} aria-label="Preview produk sesuai tahap perjalanan">
            <div className={styles.journeyPreviewHeader}><span>{active < 2 ? 'Portal agen' : 'Dashboard travel'}</span><span>{active + 1} / {journey.length}</span></div>
            <div className={styles.journeyMedia}>
              <Image src={active < 2 ? agentShot : pipelineShot} alt={active < 2 ? 'Contoh portal agen dengan bahan promosi dan paket' : 'Contoh dashboard travel dengan prospek dan status tindak lanjut'} sizes="(min-width: 768px) 45vw, 100vw" />
            </div>
            <figcaption key={active}><ActiveIcon aria-hidden="true" /><span>{journey[active].title}</span></figcaption>
            <div className={styles.journeyProgress} aria-hidden="true">{journey.map((step, index) => <span key={step.title} data-filled={index <= active} />)}</div>
          </figure>
          <ol className={styles.journey} aria-label="Lima tahap kerja agen dan travel">
          {journey.map(({ title, text }, index) => <li key={title} data-active={active === index} data-complete={index < active}>
            <span className={styles.journeyNumber}>0{index + 1}</span>
            <div className={styles.journeyCopy}><h3>{title}</h3><p>{text}</p></div>
          </li>)}
          </ol>
        </div>
      </div>
    </section>
  );
}
