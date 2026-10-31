'use client';

import { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import type { SearchEntry } from '../../lib/panduan/content';
import { search } from '../../lib/panduan/search';
import styles from './Panduan.module.css';

const hrefOf = (slug: string, anchor: string) => `${slug === 'mulai-dari-sini' ? '/panduan' : `/panduan/${slug}`}${anchor ? `#${anchor}` : ''}`;

/** Keyword search box with a results list (combobox pattern: arrows move, Enter opens, Escape closes). */
export function PanduanSearch({ entries, inline = false, autoFocus = false, onNavigate }: { entries: SearchEntry[]; inline?: boolean; autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const hits = useMemo(() => search(entries, query), [entries, query]);
  // inline: the results sit under the field and stay open while there is a query (the phone search modal).
  const showList = (inline || open) && query.trim().length > 0;

  const go = (index: number) => {
    const hit = hits[index];
    if (!hit) return;
    setOpen(false);
    setQuery('');
    onNavigate?.();
    router.push(hrefOf(hit.slug, hit.anchor));
  };

  return (
    <div
      className={styles.search}
      role="search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className={styles.searchField}>
        <Search aria-hidden="true" />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          className={styles.searchInput}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
          aria-label="Cari di panduan"
          placeholder="Cari panduan, misalnya: domain, komisi, logo"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, Math.max(hits.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              if (showList && hits.length > 0) {
                e.preventDefault();
                go(active);
              }
            } else if (e.key === 'Escape') {
              if (open) {
                e.preventDefault();
                setOpen(false);
              }
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className={styles.searchClear}
            aria-label="Hapus pencarian"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {showList ? (
        <ul className={`${styles.results} ${inline ? styles.resultsInline : ''}`} id={listId} role="listbox" aria-label="Hasil pencarian">
          {hits.length === 0 ? (
            <li className={styles.noResult} role="presentation">
              Tidak ada yang cocok dengan &ldquo;{query.trim()}&rdquo;. Coba kata lain, atau buka{' '}
              <Link href="/panduan/kalau-begini-cek-ini">Kalau begini, cek ini</Link>.
            </li>
          ) : (
            hits.map((h, i) => (
              <li key={`${h.slug}-${h.anchor}`} role="presentation">
                <a
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={styles.result}
                  href={hrefOf(h.slug, h.anchor)}
                  onMouseEnter={() => setActive(i)}
                  onClick={(e) => {
                    e.preventDefault();
                    go(i);
                  }}
                >
                  <span className={styles.resultTitle}>{h.title}</span>
                  {h.section ? <span className={styles.resultSection}>Bagian: {h.section}</span> : null}
                  <span className={styles.resultSnippet}>{h.snippet}</span>
                </a>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
