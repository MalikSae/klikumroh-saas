// Staff editor of the platform's legal pages: Syarat & Ketentuan and Kebijakan Privasi. A draft is saved freely;
// publishing shows it on the public page and fills the checkout's legal links (the backend does that).
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, RefreshCw, Save, Send, Undo2 } from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import {
  fetchLegalDocuments,
  publishLegalDocument,
  saveLegalDraft,
  unpublishLegalDocument,
  type LegalDocument,
} from '../../../services/staffApi';

const MAX_CONTENT = 200000;
const MAX_TITLE = 150;

// Where the public pages live (the web app): localhost:3000 in local development.
const publicOrigin = (): string =>
  ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:3000' : 'https://klikumroh.id';

const formatDay = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

const statusOf = (d: LegalDocument): { label: string; tone: 'green' | 'amber' | 'muted' } => {
  if (!d.published) return { label: 'Belum tayang', tone: 'muted' };
  return d.has_unpublished_changes ? { label: 'Tayang, ada perubahan belum terbit', tone: 'amber' } : { label: 'Tayang', tone: 'green' };
};

const TONE_STYLE: Record<'green' | 'amber' | 'muted', React.CSSProperties> = {
  green: { backgroundColor: 'var(--sa-green-bg)', color: 'var(--db-status-closing)', border: '1px solid var(--sa-green-border)' },
  amber: { backgroundColor: 'var(--sa-amber-bg)', color: 'var(--sa-amber-text)', border: '1px solid var(--sa-amber-border)' },
  muted: { backgroundColor: 'var(--sa-card)', color: 'var(--sa-text-muted)', border: '1px solid var(--sa-border)' },
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 'var(--db-text-input)',
  border: '1px solid var(--sa-border)',
  borderRadius: 'var(--sa-radius-sm)',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

export const AdminLegalView: React.FC = () => {
  const [docs, setDocs] = useState<LegalDocument[]>([]);
  const [slug, setSlug] = useState<string>('syarat-ketentuan');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const doc = docs.find((d) => d.slug === slug) ?? null;
  // Line endings differ between the textarea (\n) and the stored text; compare them the same way.
  const norm = (s: string) => s.replace(/\r\n/g, '\n');
  const dirty = doc !== null && (title.trim() !== doc.title.trim() || norm(content) !== norm(doc.draft_content));

  const load = useCallback(async (keepSlug?: string) => {
    setLoading(true);
    try {
      // Syarat & Ketentuan first, then Kebijakan Privasi, whatever order the API returns.
      const list = (await fetchLegalDocuments()).sort((a, b) => (a.slug === 'syarat-ketentuan' ? -1 : b.slug === 'syarat-ketentuan' ? 1 : 0));
      setDocs(list);
      const current = list.find((d) => d.slug === (keepSlug ?? 'syarat-ketentuan')) ?? list[0];
      if (current) {
        setSlug(current.slug);
        setTitle(current.title);
        setContent(current.draft_content);
      }
      setMessage(null);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal memuat dokumen legal' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const select = (next: LegalDocument) => {
    if (next.slug === slug) return;
    if (dirty && !window.confirm('Ada perubahan yang belum disimpan. Pindah dokumen dan buang perubahan itu?')) return;
    setSlug(next.slug);
    setTitle(next.title);
    setContent(next.draft_content);
    setMessage(null);
  };

  // Replaces one document in the list and puts its saved text in the form.
  const apply = (updated: LegalDocument) => {
    setDocs((all) => all.map((d) => (d.slug === updated.slug ? updated : d)));
    setTitle(updated.title);
    setContent(updated.draft_content);
  };

  const run = async (action: () => Promise<LegalDocument>, okText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      apply(await action());
      setMessage({ tone: 'ok', text: okText });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Terjadi kesalahan' });
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () => run(() => saveLegalDraft(slug, title, content), 'Draf disimpan. Halaman publik belum berubah sampai Anda menerbitkannya.');

  const publish = async () => {
    if (!doc) return;
    const ok = window.confirm(`Terbitkan "${title.trim() || doc.title}"? Isinya langsung tampil di ${publicOrigin()}/${doc.slug}.`);
    if (!ok) return;
    await run(async () => {
      if (dirty) await saveLegalDraft(slug, title, content); // what is on screen is what gets published
      return publishLegalDocument(slug);
    }, 'Dokumen diterbitkan dan tampil di halaman publik.');
  };

  const unpublish = async () => {
    if (!doc) return;
    if (!window.confirm(`Tarik "${doc.title}" dari tayang? Halamannya tidak lagi bisa dibuka, dan pendaftaran travel baru ditutup bila dokumen ini kosong.`)) return;
    await run(() => unpublishLegalDocument(slug), 'Dokumen ditarik dari tayang. Drafnya tetap tersimpan.');
  };

  const anyPublished = docs.some((d) => d.published);
  const bothPublished = docs.length > 0 && docs.every((d) => d.published);
  const emptyDraft = content.trim() === '';
  const nothingNew = doc !== null && doc.published && !doc.has_unpublished_changes && !dirty;

  return (
    <AdminLayout
      title="Dokumen Legal"
      subtitle="Syarat & Ketentuan dan Kebijakan Privasi yang tampil di situs KlikUmroh"
      headerActions={
        <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void load(slug)} disabled={loading || busy}>
          <RefreshCw size={14} className={loading ? 'db-spin' : ''} />
          <span>Segarkan</span>
        </button>
      }
    >
      {message && (
        <div
          role={message.tone === 'error' ? 'alert' : 'status'}
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            maxWidth: '860px',
            borderRadius: 'var(--sa-radius-sm)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            ...(message.tone === 'ok'
              ? { backgroundColor: 'var(--sa-green-bg)', border: '1px solid var(--sa-green-border)', color: 'var(--db-status-closing)' }
              : { backgroundColor: 'var(--sa-red-bg)', border: '1px solid var(--sa-red-border)', color: 'var(--sa-red-text)' }),
          }}
        >
          {message.tone === 'ok' ? <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> : <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />}
          <span>{message.text}</span>
        </div>
      )}

      {!loading && !bothPublished && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            maxWidth: '860px',
            borderRadius: 'var(--sa-radius-sm)',
            backgroundColor: 'var(--sa-amber-bg)',
            border: '1px solid var(--sa-amber-border)',
            color: 'var(--sa-amber-text)',
            fontSize: '13px',
          }}
        >
          {anyPublished ? 'Salah satu dokumen belum tayang.' : 'Belum ada dokumen yang tayang.'} Selama Syarat & Ketentuan dan Kebijakan Privasi belum
          sama-sama terbit, pendaftaran travel baru di checkout tetap ditutup.
        </div>
      )}

      {docs.length > 0 && doc && (
        <div style={{ maxWidth: '860px' }}>
          <div role="tablist" aria-label="Dokumen legal" style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {docs.map((d) => {
              const active = d.slug === slug;
              const st = statusOf(d);
              return (
                <button
                  key={d.slug}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`sa-btn ${active ? 'sa-btn--primary' : 'sa-btn--secondary'}`}
                  onClick={() => select(d)}
                >
                  <span>{d.slug === 'syarat-ketentuan' ? 'Syarat & Ketentuan' : 'Kebijakan Privasi'}</span>
                  <span aria-hidden="true" style={{ opacity: 0.75, fontSize: '12px' }}>
                    {d.published ? (d.has_unpublished_changes ? '• Perubahan' : '• Tayang') : '• Draf'}
                  </span>
                  <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                    {st.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="sa-panel" style={{ padding: '24px' }} role="tabpanel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <span style={{ ...TONE_STYLE[statusOf(doc).tone], padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600 }}>
                {statusOf(doc).label}
                {doc.published && doc.published_at ? ` · sejak ${formatDay(doc.published_at)}` : ''}
              </span>
              {doc.published && (
                <a
                  href={`${publicOrigin()}/${doc.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--sa-text)', fontWeight: 600 }}
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  Lihat halaman publik
                </a>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="legal-title" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Judul halaman:
              </label>
              <input id="legal-title" type="text" value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} style={{ ...fieldStyle, height: '38px', padding: '0 12px' }} />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label htmlFor="legal-content" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Isi dokumen:
              </label>
              <textarea
                id="legal-content"
                value={content}
                rows={22}
                onChange={(e) => setContent(e.target.value)}
                aria-describedby="legal-format-hint"
                spellCheck
                style={{ ...fieldStyle, lineHeight: 1.6, resize: 'vertical', minHeight: '320px' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--sa-text-muted)', marginBottom: '20px' }}>
              <span id="legal-format-hint">
                Format: <code>## Judul bagian</code> untuk subjudul, <code>- butir</code> untuk daftar, baris kosong untuk paragraf baru. Tidak ada HTML.
              </span>
              <span style={{ color: content.length > MAX_CONTENT ? 'var(--sa-red-text)' : undefined }}>
                {content.length.toLocaleString('id-ID')} / {MAX_CONTENT.toLocaleString('id-ID')} karakter
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--sa-border)', paddingTop: '16px' }}>
              <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void saveDraft()} disabled={busy || !dirty || content.length > MAX_CONTENT}>
                <Save size={14} />
                <span>{busy ? 'Menyimpan...' : 'Simpan draf'}</span>
              </button>
              <button
                type="button"
                className="sa-btn sa-btn--primary"
                onClick={() => void publish()}
                disabled={busy || emptyDraft || nothingNew || content.length > MAX_CONTENT}
                title={emptyDraft ? 'Isi dokumen masih kosong' : nothingNew ? 'Tidak ada perubahan untuk diterbitkan' : undefined}
              >
                <Send size={14} />
                <span>{doc.published ? 'Terbitkan perubahan' : 'Terbitkan'}</span>
              </button>
              {doc.published && (
                <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void unpublish()} disabled={busy} style={{ marginLeft: 'auto' }}>
                  <Undo2 size={14} />
                  <span>Tarik dari tayang</span>
                </button>
              )}
              {dirty && <span style={{ fontSize: '12px', color: 'var(--sa-amber-text)' }}>Ada perubahan yang belum disimpan</span>}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
