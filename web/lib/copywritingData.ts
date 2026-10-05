import attractionData from '../data/copywriting/attraction.json';
import educationData from '../data/copywriting/education.json';
import desireData from '../data/copywriting/desire.json';
import trustData from '../data/copywriting/trust.json';
import offerData from '../data/copywriting/offer.json';
import { fillTemplate, CAPTION_PLACEHOLDERS } from './placeholderFill';

export interface CopyItem {
  id: string;
  goal: 'attraction' | 'education' | 'desire' | 'trust' | 'offer' | string;
  funnel: string | string[];
  audience?: string[];
  angle?: string;
  topic?: string;
  pillar?: string;
  channel?: string[];
  format?: 'short' | 'medium' | 'long' | string;
  title: string;
  hook: string;
  body: string;
  cta: string;
  tags?: string[];
  requires_verified_data?: boolean;
}

export interface CopyGoalCategory {
  id: string;
  key: string;
  name: string;
  shortName: string;
  count: number;
  badgeLabel: string;
  desc: string;
  funnelStage: string;
}

export interface CopyPlaceholderReplacements {
  travel?: string;
  agent_name?: string;
  nomor_izin?: string;
  alamat?: string;
  /** Referral link appended under the caption; not a placeholder inside the texts. */
  link?: string;
  // Package facts (see packageFacts): paket, harga, tanggal, bulan, tahun, seat, hotel, maskapai, rute, durasi, fasilitas_utama.
  [packageFact: string]: string | undefined;
}

const allRawCopies: CopyItem[] = [
  ...((attractionData.copies as unknown as CopyItem[]) || []),
  ...((educationData.copies as unknown as CopyItem[]) || []),
  ...((desireData.copies as unknown as CopyItem[]) || []),
  ...((trustData.copies as unknown as CopyItem[]) || []),
  ...((offerData.copies as unknown as CopyItem[]) || []),
];

export const getAllCopies = (): CopyItem[] => {
  return allRawCopies;
};

export const getCopywritingCategories = (): CopyGoalCategory[] => {
  const attractionCount = (attractionData.copies || []).length;
  const educationCount = (educationData.copies || []).length;
  const desireCount = (desireData.copies || []).length;
  const trustCount = (trustData.copies || []).length;
  const offerCount = (offerData.copies || []).length;

  return [
    {
      id: 'attraction',
      key: 'attraction',
      name: 'Tarik Perhatian (Attraction)',
      shortName: 'Attraction',
      count: attractionCount,
      badgeLabel: 'Attraction',
      desc: 'Materi pembuka untuk menarik audiens cold yang belum siap menerima penawaran langsung.',
      funnelStage: 'Cold Funnel',
    },
    {
      id: 'education',
      key: 'education',
      name: 'Edukasi Jamaah (Education)',
      shortName: 'Edukasi',
      count: educationCount,
      badgeLabel: 'Edukasi',
      desc: 'Tips memilih paket, jarak hotel, perbandingan harga, dan persiapan ibadah.',
      funnelStage: 'Cold / Warm',
    },
    {
      id: 'desire',
      key: 'desire',
      name: 'Sentuh Kerinduan (Desire)',
      shortName: 'Kerinduan',
      count: desireCount,
      badgeLabel: 'Desire',
      desc: 'Membangkitkan hasrat emosional dan spiritual untuk segera ke Tanah Suci.',
      funnelStage: 'Warm Funnel',
    },
    {
      id: 'trust',
      key: 'trust',
      name: 'Bukti & Amanah (Trust)',
      shortName: 'Kepercayaan',
      count: trustCount,
      badgeLabel: 'Trust',
      desc: 'Membangun keyakinan calon jamaah lewat legalitas resmi, transparansi, dan rekam jejak travel.',
      funnelStage: 'Warm Funnel',
    },
    {
      id: 'offer',
      key: 'offer',
      name: 'Penawaran Paket (Offer)',
      shortName: 'Penawaran',
      count: offerCount,
      badgeLabel: 'Offer',
      desc: 'Penawaran paket konkrit, slot kursi terbatas, dan ajakan booking konsultasi.',
      funnelStage: 'Hot Funnel',
    },
  ];
};

/**
 * Fills a caption part with real data only: null when it cannot be shown (opening sentence needs a missing
 * value); other sentences with a missing value are dropped. Never a made-up fallback, never a raw {{...}}.
 */
export const replaceCopyPlaceholders = (text: string, values: CopyPlaceholderReplacements): string | null =>
  fillTemplate(text, values, { allowed: CAPTION_PLACEHOLDERS });

/** Hook, body and CTA filled for one caption, or null when any non-empty part cannot be shown. */
export const fillCaptionParts = (
  copy: Pick<CopyItem, 'hook' | 'body' | 'cta'>,
  replacements: CopyPlaceholderReplacements
): { hook: string; body: string; cta: string } | null => {
  const hook = copy.hook ? replaceCopyPlaceholders(copy.hook, replacements) : '';
  const body = copy.body ? replaceCopyPlaceholders(copy.body, replacements) : '';
  const cta = copy.cta ? replaceCopyPlaceholders(copy.cta, replacements) : '';
  if (hook === null || body === null || cta === null) return null;
  return { hook, body, cta };
};

export const assembleFullCaption = (copy: CopyItem, replacements: CopyPlaceholderReplacements): string | null => {
  const filled = fillCaptionParts(copy, replacements);
  if (!filled) return null;

  const parts = [filled.hook, filled.body, filled.cta].filter(Boolean);
  if (replacements.link) {
    parts.push(`\nInfo detail & pendaftaran:\n${replacements.link}`);
  }

  return parts.join('\n\n');
};
