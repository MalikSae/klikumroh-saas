// Panduan rekrutmen agen: guide pages for travels on an active 12-month plan. Other travels get an offer
// to upgrade (the API answers 403 "playbook_locked"), not an error.
import React, { useCallback, useEffect, useState } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  PlaybookLockedError,
  fetchPlaybookIndex,
  fetchPlaybookChecks,
  fetchTenantContactLegal,
  fetchPlaybookPage,
  setPlaybookCheck,
  type PlaybookPage,
  type PlaybookSummary,
} from '../../services/api';
import { Banner, Button, Card, EmptyState, RowLink, errorText } from '../../ui';
import { useFrame } from '../../app/AppFrame';
import { PlaybookBlocks } from './blocks';
import './playbook.css';

const LockedOffer: React.FC = () => (
  <Card>
    <EmptyState
      icon={<BookOpen />}
      title="Panduan rekrutmen agen"
      description="Panduan bertahap untuk membangun jaringan agen ini tersedia untuk paket langganan 12 bulan yang aktif."
      action={
        <Button variant="primary" to="/settings/subscription">
          Lihat paket langganan
        </Button>
      }
    />
  </Card>
);

type LoadState<T> = { status: 'loading' } | { status: 'locked' } | { status: 'error'; message: string } | { status: 'ok'; data: T };

// "load" must be stable (module function or useCallback); a new function reloads. The caller remounts
// (key) when it needs the loading state again, so no state is set synchronously in the effect.
function useLoad<T>(load: () => Promise<T>, fallback: string): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setState({ status: 'ok', data }))
      .catch((e) => {
        if (cancelled) return;
        setState(e instanceof PlaybookLockedError ? { status: 'locked' } : { status: 'error', message: errorText(e, fallback) });
      });
    return () => {
      cancelled = true;
    };
  }, [load, fallback]);
  return state;
}

const PlaybookIndex: React.FC = () => {
  const state = useLoad<PlaybookSummary[]>(fetchPlaybookIndex, 'Gagal memuat panduan rekrutmen');
  if (state.status === 'locked') return <LockedOffer />;
  if (state.status === 'error') return <Banner tone="danger">{state.message}</Banner>;
  return (
    <Card title="Panduan rekrutmen agen" description="Langkah bertahap membangun jaringan agen. Angka di dalamnya adalah kerangka perencanaan, bukan jaminan hasil.">
      {state.status === 'loading' ? (
        <p className="pb-text pb-pad ku-muted">Memuat...</p>
      ) : state.data.length === 0 ? (
        <EmptyState compact title="Belum ada halaman panduan" />
      ) : (
        <ul className="ku-rowlist">
          {state.data.map((p) => (
            <RowLink key={p.slug} to={`/playbook/${p.slug}`} title={p.title} meta={p.summary} aside={<ChevronRight className="ku-icon--sm" aria-hidden="true" />} />
          ))}
        </ul>
      )}
    </Card>
  );
};

interface LoadedPage {
  page: PlaybookPage;
  checked: string[];
}

// The page body: the checks are saved on the server for the whole team of the travel. A tap shows at once and
// is undone (with a message) if the server refuses it.
const PlaybookPageBody: React.FC<{ slug: string; data: LoadedPage }> = ({ slug, data }) => {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(data.checked));
  const [error, setError] = useState<string | null>(null);
  // The travel's own details for the message templates. The PPIU number is optional: if it cannot be loaded
  // its placeholder simply stays for the reader to fill.
  const sub = useFrame()?.subscription;
  const [ppiu, setPpiu] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTenantContactLegal()
      .then((c) => alive && setPpiu(c.ppiu_number ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  // The travel's own address (custom domain when it has one): the same link as the buttons elsewhere.
  const site = useFrame()?.siteUrl;
  const vars = { name: sub?.tenant_name, recruitLink: site ? `${site}/agen/daftar` : null, ppiu };
  const toggle = (itemId: string, on: boolean) => {
    setError(null);
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
    setPlaybookCheck(slug, itemId, on).catch((e) => {
      setChecked((prev) => {
        const next = new Set(prev);
        if (on) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
      setError(errorText(e, 'Gagal menyimpan centangan'));
    });
  };
  return (
    <Card title={data.page.title} description={data.page.summary}>
      <div className="pb-pad">
        {error && <Banner tone="danger">{error}</Banner>}
        <PlaybookBlocks blocks={data.page.blocks} checks={{ checked, onToggle: toggle }} vars={vars} />
      </div>
    </Card>
  );
};

const PlaybookPageView: React.FC = () => {
  const { slug = '' } = useParams();
  // The checks never block the page: if they cannot be loaded the page opens with nothing checked.
  const load = useCallback(
    () =>
      Promise.all([fetchPlaybookPage(slug), fetchPlaybookChecks(slug).catch(() => [] as string[])]).then(
        ([page, checked]): LoadedPage => ({ page, checked }),
      ),
    [slug],
  );
  const state = useLoad<LoadedPage>(load, 'Gagal memuat halaman panduan');
  if (state.status === 'locked') return <LockedOffer />;
  return (
    <div className="pb-page">
      <Button variant="ghost" size="sm" to="/playbook" icon={<ChevronLeft className="ku-icon--sm" />}>
        Semua panduan
      </Button>
      {state.status === 'error' && <Banner tone="danger">{state.message}</Banner>}
      {state.status === 'loading' && <p className="pb-text ku-muted">Memuat...</p>}
      {state.status === 'ok' && <PlaybookPageBody slug={slug} data={state.data} />}
    </div>
  );
};

// Remounts the page when the slug changes, so it starts in the loading state.
const PlaybookPageRoute: React.FC = () => {
  const { slug = '' } = useParams();
  return <PlaybookPageView key={slug} />;
};

export const PlaybookScreen: React.FC = () => (
  <div className="pb">
    <Routes>
      <Route index element={<PlaybookIndex />} />
      <Route path=":slug" element={<PlaybookPageRoute />} />
    </Routes>
  </div>
);
