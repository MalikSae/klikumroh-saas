import React from 'react';
import Link from 'next/link';
import { Instrument_Serif } from 'next/font/google';
import { KlikUmrohBrand } from './KlikUmrohBrand';
import { parseLegalText } from '../../lib/legalText';
import type { LegalDocument } from '../../lib/legalDocuments';
import styles from './LegalDocumentView.module.css';

// Same display serif as the marketing landing for the title.
const serif = Instrument_Serif({ weight: '400', subsets: ['latin'], variable: '--km-font-display', display: 'swap' });

const formatDay = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
};

/** A published legal document as a readable page: logo, serif title, the text, and the date it was published. */
export const LegalDocumentView: React.FC<{ doc: LegalDocument }> = ({ doc }) => {
  const blocks = parseLegalText(doc.content);
  const updated = formatDay(doc.published_at);
  return (
    <main className={`${styles.page} ${serif.variable}`}>
      <header className={styles.header}>
        <Link href="/marketing" className={styles.brand} aria-label="KlikUmroh.id">
          <KlikUmrohBrand theme="light" iconSize={30} showBadge={true} />
        </Link>
      </header>
      <article className={styles.article}>
        <h1 className={styles.title}>{doc.title}</h1>
        {updated ? <p className={styles.updated}>Terakhir diperbarui {updated}</p> : null}
        <div className={styles.body}>
          {blocks.map((b, i) => {
            if (b.type === 'heading') return <h2 key={i}>{b.text}</h2>;
            if (b.type === 'list') {
              return (
                <ul key={i}>
                  {b.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={i}>
                {b.lines.map((line, j) => (
                  <React.Fragment key={j}>
                    {j > 0 ? <br /> : null}
                    {line}
                  </React.Fragment>
                ))}
              </p>
            );
          })}
        </div>
      </article>
      <footer className={styles.footer}>
        <Link href="/marketing">Kembali ke KlikUmroh.id</Link>
      </footer>
    </main>
  );
};
