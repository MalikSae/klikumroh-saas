import { backendFetch } from './backendFetch';

// Published legal documents (Syarat & Ketentuan, Kebijakan Privasi), written in the internal dashboard.

export interface LegalDocument {
  slug: string;
  title: string;
  content: string;
  published_at: string;
}

const getBackendBaseUrl = (): string =>
  process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://127.0.0.1:8080';

/** The published document, or null when it is not published (404) or the API cannot be reached. */
export async function fetchLegalDocument(slug: string): Promise<LegalDocument | null> {
  try {
    const res = await backendFetch(`${getBackendBaseUrl()}/api/public/legal/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return null;
    const d = data as Partial<LegalDocument>;
    if (typeof d.title !== 'string' || typeof d.content !== 'string') return null;
    return { slug, title: d.title, content: d.content, published_at: typeof d.published_at === 'string' ? d.published_at : '' };
  } catch {
    return null;
  }
}
