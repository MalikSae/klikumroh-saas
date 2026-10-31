// The guide chapters, baked into the build by scripts/build-panduan.js (panduan/*.md ->
// data/panduan.generated.json). The standalone server has no panduan/ folder at runtime.
import generated from '../../data/panduan.generated.json';
import { parseMarkdown, plainText, type Block } from './markdown';

export type GuideStageKey = 'mulai' | 'tahap-1' | 'tahap-2' | 'tahap-3' | 'lanjutan' | 'bantuan';
export type GuideLabel = 'wajib' | 'disarankan' | 'opsional' | '';

export interface GuideChapter {
  slug: string;
  title: string;
  stage: GuideStageKey;
  label: GuideLabel;
  labelText: string;
  order: number;
  summary: string;
  menu: string;
  alias: string[];
  body: string;
  /** Pixel size of each screenshot the chapter uses, keyed by file name in public/panduan. */
  images: Record<string, { width: number; height: number }>;
}

export const GUIDE_STAGE_TITLES: Record<GuideStageKey, string> = {
  mulai: 'Mulai',
  'tahap-1': 'Tahap 1: Website siap dilihat jamaah',
  'tahap-2': 'Tahap 2: Siap rekrut agen',
  'tahap-3': 'Tahap 3: Jamaah mulai masuk',
  lanjutan: 'Lanjutan',
  bantuan: 'Bantuan',
};

const STAGE_ORDER: GuideStageKey[] = ['mulai', 'tahap-1', 'tahap-2', 'tahap-3', 'lanjutan', 'bantuan'];

/** The chapter that opens at /panduan itself. */
export const GUIDE_HOME_SLUG = 'mulai-dari-sini';

export const chapters = generated as GuideChapter[];

export const guideHref = (slug: string) => (slug === GUIDE_HOME_SLUG ? '/panduan' : `/panduan/${slug}`);

export const getChapter = (slug: string): GuideChapter | undefined => chapters.find((c) => c.slug === slug);

export const labelText = (c: Pick<GuideChapter, 'label' | 'labelText'>): string => {
  if (c.labelText) return c.labelText;
  if (c.label === 'wajib') return 'Wajib';
  if (c.label === 'disarankan') return 'Disarankan';
  if (c.label === 'opsional') return 'Opsional';
  return '';
};

export interface GuideStageGroup {
  key: GuideStageKey;
  title: string;
  chapters: GuideChapter[];
}

export function stageGroups(): GuideStageGroup[] {
  return STAGE_ORDER.map((key) => ({
    key,
    title: GUIDE_STAGE_TITLES[key],
    chapters: chapters.filter((c) => c.stage === key),
  })).filter((g) => g.chapters.length > 0);
}

export function neighbours(slug: string): { prev: GuideChapter | null; next: GuideChapter | null } {
  const i = chapters.findIndex((c) => c.slug === slug);
  return { prev: i > 0 ? chapters[i - 1] : null, next: i >= 0 && i < chapters.length - 1 ? chapters[i + 1] : null };
}

export function chapterBlocks(c: GuideChapter): Block[] {
  return parseMarkdown(c.body);
}

export interface SearchEntry {
  slug: string;
  title: string;
  label: string;
  summary: string;
  menu: string;
  alias: string[];
  headings: { id: string; text: string }[];
  text: string;
}

/** What the browser needs to search: one compact entry per chapter, no Markdown. */
export function searchEntries(): SearchEntry[] {
  return chapters.map((c) => ({
    slug: c.slug,
    title: c.title,
    label: labelText(c),
    summary: c.summary,
    menu: c.menu,
    alias: c.alias,
    headings: parseMarkdown(c.body).flatMap((b) => (b.type === 'heading' ? [{ id: b.id, text: b.text }] : [])),
    text: plainText(c.body),
  }));
}
