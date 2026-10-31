'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, Search, X } from 'lucide-react';
import { KlikUmrohBrand } from '../marketing/KlikUmrohBrand';
import type { SearchEntry } from '../../lib/panduan/content';
import { LabelBadge } from './LabelBadge';
import { PanduanSearch } from './PanduanSearch';
import styles from './Panduan.module.css';

export interface NavItem {
  slug: string;
  title: string;
  href: string;
  kind: string;
  text: string;
}
export interface NavGroup {
  key: string;
  title: string;
  items: NavItem[];
}

/** Header with search, the stage-grouped chapter list (a drawer on phones), and the page itself. */
export function PanduanShell({ groups, entries, children }: { groups: NavGroup[]; entries: SearchEntry[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const closeSearch = () => {
    setSearchOpen(false);
    searchToggleRef.current?.focus();
  };

  // One group open at a time: the one holding the current chapter. Opening another group closes the rest,
  // and moving to a chapter in a different group (a link, a search result) follows it.
  const activeKey = groups.find((g) => g.items.some((it) => it.href === pathname))?.key ?? null;
  const [openKey, setOpenKey] = useState<string | null>(activeKey);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpenKey(activeKey);
  }

  // Close the drawer after navigating, and on Escape.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the phone drawer when the route changes.
    setNavOpen(false);
  }, [pathname]);
  // The phone drawer locks the page behind it and puts focus on its close button.
  useEffect(() => {
    if (!navOpen && !searchOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen, searchOpen]);
  useEffect(() => {
    if (navOpen) closeRef.current?.focus();
  }, [navOpen]);
  useEffect(() => {
    if (!navOpen && !searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setNavOpen(false);
      if (searchOpen) {
        setSearchOpen(false);
        searchToggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen, searchOpen]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <button
            type="button"
            className={styles.menuToggle}
            aria-label={navOpen ? 'Tutup daftar bab' : 'Buka daftar bab'}
            aria-expanded={navOpen}
            aria-controls="panduan-nav"
            onClick={() => setNavOpen((o) => !o)}
          >
            {navOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <Link href="/panduan" className={styles.brand} aria-label="Panduan KlikUmroh">
            <KlikUmrohBrand theme="light" iconSize={28} showBadge={false} />
            <span className={styles.brandSection}>Panduan</span>
          </Link>
          <div className={styles.headerSearch}>
            <PanduanSearch entries={entries} />
          </div>
          <button ref={searchToggleRef} type="button" className={styles.searchToggle} aria-label="Cari di panduan" aria-haspopup="dialog" aria-expanded={searchOpen} onClick={() => setSearchOpen(true)}>
            <Search aria-hidden="true" />
          </button>
          <Link href="/login" className={styles.headerLink}>
            Masuk
          </Link>
        </div>
      </header>

      {searchOpen ? (
        <div className={styles.searchModal} role="dialog" aria-modal="true" aria-label="Cari di panduan">
          <div className={styles.searchScrim} onClick={closeSearch} aria-hidden="true" />
          <div className={styles.searchPanel}>
            <div className={styles.searchPanelHead}>
              <div className={styles.searchPanelField}>
                <PanduanSearch entries={entries} inline autoFocus onNavigate={() => setSearchOpen(false)} />
              </div>
              <button type="button" className={styles.searchCancel} onClick={closeSearch}>
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.body}>
        <div className={`${styles.scrim} ${navOpen ? styles.scrimShown : ''}`} onClick={() => setNavOpen(false)} aria-hidden="true" />
        <nav id="panduan-nav" aria-label="Daftar bab panduan" className={`${styles.sidebar} ${navOpen ? styles.sidebarOpen : ''}`}>
          <div className={styles.drawerHead}>
            <span>Daftar bab</span>
            <button ref={closeRef} type="button" className={styles.drawerClose} aria-label="Tutup daftar bab" onClick={() => setNavOpen(false)}>
              <X aria-hidden="true" />
            </button>
          </div>
          {groups.map((g) => {
            const single = g.items.length === 1;
            const open = single || openKey === g.key;
            const listId = `panduan-group-${g.key}`;
            return (
              <section key={g.key} className={styles.navGroup}>
                {single ? null : (
                  <h2 className={styles.navGroupTitle}>
                    <button
                      type="button"
                      className={`${styles.navGroupHead} ${activeKey === g.key ? styles.navGroupHeadActive : ''}`}
                      aria-expanded={open}
                      aria-controls={listId}
                      onClick={() => setOpenKey(open ? null : g.key)}
                    >
                      <span>{g.title}</span>
                      <ChevronDown aria-hidden="true" className={`${styles.navChevron} ${open ? styles.navChevronOpen : ''}`} />
                    </button>
                  </h2>
                )}
                <ul id={listId} className={styles.navList} hidden={!open}>
                  {g.items.map((it) => (
                    <li key={it.slug}>
                      <Link href={it.href} className={styles.navLink} aria-current={pathname === it.href ? 'page' : undefined}>
                        <span>{it.title}</span>
                        <LabelBadge kind={it.kind} text={it.text} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </nav>
        {children}
      </div>

      <footer className={styles.footer}>
        Butuh bantuan lain? Buka <Link href="/panduan/kalau-begini-cek-ini">Kalau begini, cek ini</Link> atau <Link href="/panduan/istilah">Istilah</Link>.
      </footer>
    </div>
  );
}
