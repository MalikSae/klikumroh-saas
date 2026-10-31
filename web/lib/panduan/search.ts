// Keyword search over the guide, run in the browser against the entries the server sends down. No
// outside service: nothing a travel admin types leaves the page. Matching ignores case and accents, treats
// every typed word as a prefix, and ranks alias and title above headings, summary and body, so a layman's
// word ("pixel", "bayar", "dns") lands on the right chapter through its `alias` list.
import type { SearchEntry } from './content';

export interface SearchHit {
  slug: string;
  title: string;
  label: string;
  /** Anchor of the best matching section, '' when the chapter as a whole matches. */
  anchor: string;
  section: string;
  snippet: string;
  score: number;
}

// Words that carry no meaning in a "how do I" question; dropped from the query unless nothing else is left.
const STOPWORDS = new Set([
  'a', 'ada', 'agar', 'apa', 'atau', 'bagaimana', 'bisa', 'cara', 'dan', 'dari', 'di', 'dong', 'itu', 'ini',
  'ke', 'kok', 'lagi', 'mau', 'nya', 'pada', 'saya', 'sih', 'untuk', 'yang', 'yg', 'dengan', 'bila', 'kalau',
]);

export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const tokens = (s: string): string[] => normalize(s).split(' ').filter(Boolean);

export function queryTokens(query: string): string[] {
  const all = tokens(query);
  const kept = all.filter((t) => !STOPWORDS.has(t));
  return kept.length ? kept : all;
}

/** Does every query token start some word of `field`? Returns how many tokens matched (a whole word counts double). */
function fieldScore(field: string, qs: string[]): number {
  const words = tokens(field);
  let score = 0;
  for (const q of qs) {
    let best = 0;
    for (const w of words) {
      if (w === q) {
        best = 2;
        break;
      }
      if (w.startsWith(q)) best = Math.max(best, 1);
    }
    score += best;
  }
  return score;
}

const matchesAll = (field: string, qs: string[]): boolean => {
  const words = tokens(field);
  return qs.every((q) => words.some((w) => w.startsWith(q)));
};

function snippetFor(text: string, qs: string[]): string {
  const norm = normalize(text);
  let at = -1;
  for (const q of qs) {
    const i = norm.indexOf(q);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, 120);
  // normalize() can shift offsets when punctuation collapses; searching the original keeps it close enough.
  const start = Math.max(0, Math.min(at, text.length) - 40);
  const cut = text.slice(start, start + 140).trim();
  return `${start > 0 ? '... ' : ''}${cut}${start + 140 < text.length ? ' ...' : ''}`;
}

export function search(entries: SearchEntry[], query: string, limit = 8): SearchHit[] {
  const qs = queryTokens(query);
  if (qs.length === 0) return [];

  const score = (e: SearchEntry, strict: boolean) => {
    const aliasText = e.alias.join(' ');
    const fields: [string, number][] = [
      [aliasText, 6],
      [e.title, 5],
      [e.menu, 3],
      [e.headings.map((h) => h.text).join(' '), 3],
      [e.summary, 2],
      [e.text, 1],
    ];
    const joined = fields.map(([f]) => f).join(' ');
    if (strict && !matchesAll(joined, qs)) return 0;
    return fields.reduce((sum, [f, w]) => sum + w * fieldScore(f, qs), 0);
  };

  let ranked = entries.map((e) => ({ e, s: score(e, true) })).filter((x) => x.s > 0);
  // A question with one unknown word still gets the chapters that match the other words.
  if (ranked.length === 0 && qs.length > 1) ranked = entries.map((e) => ({ e, s: score(e, false) })).filter((x) => x.s > 0);
  ranked.sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title));

  return ranked.slice(0, limit).map(({ e, s }) => {
    let bestHeading: { id: string; text: string } | null = null;
    let bestScore = 0;
    for (const h of e.headings) {
      const hs = fieldScore(h.text, qs);
      if (hs > bestScore) {
        bestScore = hs;
        bestHeading = h;
      }
    }
    // Deep-link to a section only when it matches at least as many words as the title does.
    const titleScore = fieldScore(e.title, qs) + fieldScore(e.alias.join(' '), qs);
    const useSection = bestHeading !== null && bestScore > 0 && bestScore >= titleScore;
    return {
      slug: e.slug,
      title: e.title,
      label: e.label,
      anchor: useSection && bestHeading ? bestHeading.id : '',
      section: useSection && bestHeading ? bestHeading.text : '',
      snippet: snippetFor(e.text, qs),
      score: s,
    };
  });
}
