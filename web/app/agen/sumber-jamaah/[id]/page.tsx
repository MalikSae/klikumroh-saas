'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, ChevronRight, Copy, Check, CheckCircle2 } from 'lucide-react';
import { MobileContainer } from '../../../../components/MobileContainer';
import './SumberJamaahDetail.css';
import { fetchSumberDone, saveSumberDone } from '../../../../lib/agentHabits';
import { copyToClipboard } from '../../../../lib/clipboard';
import sumberDataRaw from '../../../../data/sumber-jamaah.json';

interface SumberJamaahItem {
  id: number;
  kategori: string;
  sumber: string;
  kenapa_dicoba: string;
  cara_mulai: string;
  contoh: string;
}


export default function SumberJamaahDetailPage() {
  const router = useRouter();
  const params = useParams();

  const id = Number(params?.id);
  const item = (sumberDataRaw as SumberJamaahItem[]).find((s) => s.id === id);

  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  // Why the last mark was put back (the server refused it), shown above the button.
  const [markError, setMarkError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }

    // Auth check
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/agent/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          localStorage.removeItem('agent_token');
          router.push('/agen/login');
        }
      } catch {
        // Soft fail
      }
    };
    checkAuth();

    // Tried state comes from the server (an old browser-only list is moved up once).
    fetchSumberDone().then((ids) => {
      if (ids) setIsCompleted(ids.includes(id));
    });
  }, [id, router]);

  // Optimistic: flip at once, put it back if the server refuses. Marking also counts today's "sumber" habit.
  const toggleCompleted = async () => {
    const next = !isCompleted;
    setIsCompleted(next);
    setMarkError(null);
    const outcome = await saveSumberDone(id, next);
    if (outcome === 'ok') return;
    setIsCompleted(!next);
    setMarkError(
      outcome === 'suspended'
        ? 'Layanan travel sedang ditangguhkan, jadi tanda ini belum bisa disimpan. Coba lagi setelah travel memperpanjang langganan.'
        : 'Tanda belum tersimpan. Periksa koneksi lalu coba lagi.'
    );
  };

  // 'Tersalin' only once the text is really copied (in-app browsers may block the clipboard).
  const handleCopy = async (text: string) => {
    if (!(await copyToClipboard(text))) return;
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const totalItems = (sumberDataRaw as SumberJamaahItem[]).length;
  const nextItem = id < totalItems ? (sumberDataRaw as SumberJamaahItem[]).find((s) => s.id === id + 1) : undefined;

  // Back goes one step up the history: the list ("Sumber berikutnya" replaces the entry, so the list stays one
  // step back). Pushing the list here made list <-> detail loop and Beranda unreachable. Opened directly from a
  // link (no history): go to the list.
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push('/agen/sumber-jamaah');
  };
  const header = (title: string) => (
    <header className="sjd-header">
      <button type="button" onClick={goBack} aria-label="Kembali ke daftar sumber" className="sjd-icon-btn">
        <ArrowLeft size={20} />
      </button>
      <h1 className="sjd-header__title">{title}</h1>
    </header>
  );

  if (!item) {
    return (
      <MobileContainer>
        {header('Sumber jamaah')}
        <div className="sjd-page sjd-page--center">
          <h2 className="sjd-title">Sumber tidak ditemukan</h2>
          <p className="sjd-muted">Data sumber yang Anda cari tidak tersedia.</p>
          <Link href="/agen/sumber-jamaah" className="sjd-btn">
            Kembali ke daftar
          </Link>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer>
      {header(item.sumber)}

      <div className="sjd-page">
        <p className="sjd-muted">
          #{item.id} · {item.kategori}
        </p>

        <section className="sjd-section">
          <h2 className="sjd-label">Kenapa layak dicoba</h2>
          <p className="sjd-text">{item.kenapa_dicoba}</p>
        </section>

        <section className="sjd-section">
          <h2 className="sjd-label">Langkah pendekatan</h2>
          <p className="sjd-text">{item.cara_mulai}</p>
        </section>

        {/* The opener is the only framed block: it is meant to be copied or sent. */}
        <section className="sjd-section">
          {/* Copy sits next to the heading as a small text action, not a separate button row. */}
          <div className="sjd-label-row">
            <h2 className="sjd-label">Contoh pembuka obrolan</h2>
            <button type="button" onClick={() => handleCopy(item.contoh)} className={`sjd-copy${isCopied ? ' sjd-copy--done' : ''}`}>
              {isCopied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              <span>{isCopied ? 'Tersalin' : 'Salin'}</span>
            </button>
          </div>
          <div className="sjd-script">{item.contoh}</div>
        </section>

        {/* Next source as a titled row ("read next"), instead of bare previous/next links. */}
        {nextItem && (
          <Link href={`/agen/sumber-jamaah/${nextItem.id}`} replace className="sjd-next">
            <span className="sjd-next__text">
              <span className="sjd-muted">Sumber berikutnya</span>
              <span className="sjd-next__title">{nextItem.sumber}</span>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* Main action, stuck to the bottom: mark this source as tried (fills the progress on the list). */}
      <div className="sjd-bar">
        {markError && (
          <p className="sjd-bar__msg" role="status">
            {markError}
          </p>
        )}
        <button type="button" onClick={toggleCompleted} aria-pressed={isCompleted} className={`sjd-mark${isCompleted ? ' sjd-mark--done' : ''}`}>
          {isCompleted ? (
            <>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>Sudah dicoba</span>
              <span className="sjd-mark__undo">Batalkan</span>
            </>
          ) : (
            <span>Tandai sudah dicoba</span>
          )}
        </button>
      </div>
    </MobileContainer>
  );
}
