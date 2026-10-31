import React from 'react';
import Link from 'next/link';
import { ImageIcon } from 'lucide-react';
import { GUIDE_HOME_SLUG, guideHref } from '../../lib/panduan/content';
import type { Block, Inline } from '../../lib/panduan/markdown';
import styles from './Panduan.module.css';

export type GuideImages = Record<string, { width: number; height: number }>;

function renderInline(parts: Inline[]): React.ReactNode {
  return parts.map((p, i) => {
    if (p.type === 'bold') return <strong key={i}>{p.text}</strong>;
    if (p.type === 'code') return <code key={i}>{p.text}</code>;
    if (p.type === 'link') {
      if (p.href.startsWith('slug:')) {
        const slug = p.href.slice('slug:'.length);
        return (
          <Link key={i} href={slug === GUIDE_HOME_SLUG ? '/panduan' : guideHref(slug)}>
            {p.text}
          </Link>
        );
      }
      if (/^https?:\/\//.test(p.href)) {
        return (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">
            {p.text}
          </a>
        );
      }
      return <React.Fragment key={i}>{p.text}</React.Fragment>;
    }
    return <React.Fragment key={i}>{p.text}</React.Fragment>;
  });
}

function renderBlocks(blocks: Block[], images: GuideImages): React.ReactNode {
  return blocks.map((b, i) => {
    switch (b.type) {
      case 'heading':
        return b.level === 2 ? (
          <h2 key={i} id={b.id}>
            {b.text}
          </h2>
        ) : (
          <h3 key={i} id={b.id}>
            {b.text}
          </h3>
        );
      case 'paragraph':
        return <p key={i}>{renderInline(b.inline)}</p>;
      case 'list': {
        const items = b.items.map((it, j) => (
          <li key={j}>
            {renderInline(it.inline)}
            {it.children.length > 0 ? renderBlocks(it.children, images) : null}
          </li>
        ));
        return b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
      }
      case 'table':
        return (
          <div key={i} className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  {b.head.map((c, j) => (
                    <th key={j} scope="col">
                      {renderInline(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k}>{renderInline(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'image': {
        const size = b.src ? images[b.src] : undefined;
        if (b.src && size) {
          const href = `/panduan/${b.src}`;
          const portrait = size.height > size.width;
          return (
            <figure key={i} className={styles.shot}>
              <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Buka gambar ukuran penuh: ${b.caption}`}>
                {/* A plain <img>: these are fixed screenshots already sized for the page, so the image optimizer adds nothing. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={href}
                  alt=""
                  width={size.width}
                  height={size.height}
                  loading="lazy"
                  decoding="async"
                  className={portrait ? styles.shotImgPortrait : styles.shotImg}
                />
              </a>
              <figcaption>{b.caption}</figcaption>
            </figure>
          );
        }
        // No screenshot yet: the slot says what belongs here.
        return (
          <figure key={i} className={styles.figure}>
            <ImageIcon aria-hidden="true" />
            <figcaption>Gambar layar: {b.caption}</figcaption>
          </figure>
        );
      }
    }
  });
}

export function PanduanContent({ blocks, images = {} }: { blocks: Block[]; images?: GuideImages }) {
  return <div className={styles.prose}>{renderBlocks(blocks, images)}</div>;
}
