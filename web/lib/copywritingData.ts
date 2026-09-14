import attractionData from '../data/copywriting/attraction.json';
import educationData from '../data/copywriting/education.json';
import desireData from '../data/copywriting/desire.json';
import trustData from '../data/copywriting/trust.json';
import offerData from '../data/copywriting/offer.json';

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
  nama?: string;
  travel?: string;
  paket?: string;
  harga?: string;
  bulan?: string;
  tahun?: string;
  tanggal?: string;
  kota?: string;
  hotel?: string;
  jarak_hotel?: string;
  maskapai?: string;
  durasi?: string;
  dp?: string;
  fasilitas_utama?: string;
  link?: string;
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

export const replaceCopyPlaceholders = (text: string, values: CopyPlaceholderReplacements): string => {
  if (!text) return '';

  const travelDisplay = values.travel || 'Travel Umroh';
  const nameDisplay = values.nama || 'Bapak/Ibu';
  const paketDisplay = values.paket || 'Paket Umroh Pilihan';
  const hargaDisplay = values.harga || 'Harga Terbaik';
  const bulanDisplay = values.bulan || 'Musim Depan';
  const tahunDisplay = values.tahun || String(new Date().getFullYear());
  const tanggalDisplay = values.tanggal || 'Sesuai Jadwal';
  const kotaDisplay = values.kota || 'Indonesia';
  const hotelDisplay = values.hotel || 'Hotel Bintang Nyaman';
  const jarakHotelDisplay = values.jarak_hotel || 'Dekat Pelataran Masjid';
  const maskapaiDisplay = values.maskapai || 'Maskapai Ternama Direct';
  const durasiDisplay = values.durasi || '9 - 12 Hari';
  const dpDisplay = values.dp || 'Rp 5.000.000';
  const fasilitasDisplay = values.fasilitas_utama || 'Visa, tiket PP, hotel, makan 3x, & muthawwif';
  const linkDisplay = values.link || '';

  return text
    .replace(/\{\{travel\}\}/gi, travelDisplay)
    .replace(/\{\{nama\}\}/gi, nameDisplay)
    .replace(/\{\{paket\}\}/gi, paketDisplay)
    .replace(/\{\{harga\}\}/gi, hargaDisplay)
    .replace(/\{\{bulan\}\}/gi, bulanDisplay)
    .replace(/\{\{tahun\}\}/gi, tahunDisplay)
    .replace(/\{\{tanggal\}\}/gi, tanggalDisplay)
    .replace(/\{\{kota\}\}/gi, kotaDisplay)
    .replace(/\{\{hotel\}\}/gi, hotelDisplay)
    .replace(/\{\{jarak_hotel\}\}/gi, jarakHotelDisplay)
    .replace(/\{\{maskapai\}\}/gi, maskapaiDisplay)
    .replace(/\{\{durasi\}\}/gi, durasiDisplay)
    .replace(/\{\{dp\}\}/gi, dpDisplay)
    .replace(/\{\{fasilitas_utama\}\}/gi, fasilitasDisplay)
    .replace(/\{\{link\}\}/gi, linkDisplay);
};

export const assembleFullCaption = (copy: CopyItem, replacements: CopyPlaceholderReplacements): string => {
  const hook = replaceCopyPlaceholders(copy.hook, replacements);
  const body = replaceCopyPlaceholders(copy.body, replacements);
  const cta = replaceCopyPlaceholders(copy.cta, replacements);

  const parts: string[] = [];
  if (hook) parts.push(hook);
  if (body) parts.push(body);
  if (cta) parts.push(cta);

  if (replacements.link) {
    parts.push(`\nInfo detail & pendaftaran:\n${replacements.link}`);
  }

  return parts.join('\n\n');
};
