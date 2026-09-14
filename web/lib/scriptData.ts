import greetingData from '../data/scripts-chat/greeting.json';
import identificationData from '../data/scripts-chat/identification.json';
import offerData from '../data/scripts-chat/offer.json';
import closingData from '../data/scripts-chat/closing.json';
import objectionData from '../data/scripts-chat/objection.json';
import followupData from '../data/scripts-chat/followups.json';
import cycleData from '../data/conversion-chat/conversion-cycle.json';

export interface StandardScriptItem {
  id: string;
  category: string;
  title: string;
  use_when?: string;
  prospect_example?: string;
  script: string;
  tags?: string[];
  next_stage?: string;
}

export interface ObjectionTGJPItem {
  id: string;
  category: string;
  title: string;
  prospect_examples?: string[];
  tgjp: {
    terima: string[];
    gali: string[];
    jawab: Array<{ reason: string; script: string }>;
    pastikan: string[];
  };
  tags?: string[];
}

export interface CycleStage {
  id: string;
  urutan: number;
  nama: string;
  tujuan: string;
  fokus?: string[];
  prinsip?: string | string[];
  framework?: string;
  framework_items?: Array<{ kode: string; nama: string; arti: string }>;
  detail_ref?: string;
}

export interface PlaceholderReplacements {
  nama?: string;
  travel?: string;
  cs_name?: string;
  agent_name?: string;
  referral_link?: string;
  paket?: string;
  harga?: string;
  dp?: string;
  seat?: string;
  bulan?: string;
  tanggal?: string;
  hotel?: string;
  jarak_hotel?: string;
  maskapai?: string;
  fasilitas_utama?: string;
  durasi?: string;
  rekening?: string;
  nama_rekening?: string;
}

export const replacePlaceholders = (text: string, values: PlaceholderReplacements): string => {
  if (!text) return '';

  const travelDisplay = values.travel || 'Travel Umroh';
  const csNameDisplay = values.agent_name || values.cs_name || 'Mitra Agen';
  const referralLinkDisplay = values.referral_link || '';
  const paketDisplay = values.paket || 'Paket Umroh';
  const hargaDisplay = values.harga || 'harga terbaik';
  const dpDisplay = values.dp || 'DP';
  const seatDisplay = values.seat || 'seat';
  const bulanDisplay = values.bulan || 'bulan keberangkatan';
  const tanggalDisplay = values.tanggal || 'tanggal keberangkatan';
  const hotelDisplay = values.hotel || 'hotel pilihan';
  const jarakHotelDisplay = values.jarak_hotel || 'jarak dekat dari masjid';
  const maskapaiDisplay = values.maskapai || 'maskapai terpercaya';
  const fasilitasDisplay = values.fasilitas_utama || 'fasilitas lengkap';
  const durasiDisplay = values.durasi || '9-12 hari';
  const rekeningDisplay = values.rekening || 'rekening resmi travel';
  const namaRekeningDisplay = values.nama_rekening || travelDisplay;

  let result = text;
  const rawNama = values.nama ? values.nama.trim() : '';

  if (rawNama) {
    if (/^(Pak|Bapak|Bu|Ibu|Ustadz|Ustadzah|Mas|Mbak|Kak|Kakak)\b/i.test(rawNama)) {
      result = result.replace(/Kak\s+\{\{nama\}\}/gi, rawNama);
      result = result.replace(/Kakak\s+\{\{nama\}\}/gi, rawNama);
    }
    result = result.replace(/\{\{nama\}\}/gi, rawNama);
  } else {
    result = result.replace(/Kak\s+\{\{nama\}\}/gi, 'Kak');
    result = result.replace(/Kakak\s+\{\{nama\}\}/gi, 'Kakak');
    result = result.replace(/\{\{nama\}\}/gi, 'Kak');
  }

  // Clean up any double greetings
  result = result
    .replace(/\bKak\s+Kak\b/gi, 'Kak')
    .replace(/\bKak\s+Bu\b/gi, 'Bu')
    .replace(/\bKak\s+Pak\b/gi, 'Pak');

  return result
    .replace(/\{\{travel\}\}/gi, travelDisplay)
    .replace(/\{\{cs_name\}\}/gi, csNameDisplay)
    .replace(/\{\{agent_name\}\}/gi, csNameDisplay)
    .replace(/\{\{referral_link\}\}/gi, referralLinkDisplay)
    .replace(/\{\{paket\}\}/gi, paketDisplay)
    .replace(/\{\{harga\}\}/gi, hargaDisplay)
    .replace(/\{\{dp\}\}/gi, dpDisplay)
    .replace(/\{\{seat\}\}/gi, seatDisplay)
    .replace(/\{\{bulan\}\}/gi, bulanDisplay)
    .replace(/\{\{tanggal\}\}/gi, tanggalDisplay)
    .replace(/\{\{hotel\}\}/gi, hotelDisplay)
    .replace(/\{\{jarak_hotel\}\}/gi, jarakHotelDisplay)
    .replace(/\{\{maskapai\}\}/gi, maskapaiDisplay)
    .replace(/\{\{fasilitas_utama\}\}/gi, fasilitasDisplay)
    .replace(/\{\{durasi\}\}/gi, durasiDisplay)
    .replace(/\{\{rekening\}\}/gi, rekeningDisplay)
    .replace(/\{\{nama_rekening\}\}/gi, namaRekeningDisplay);
};

export const getCycleStages = (): CycleStage[] => {
  return (cycleData.stages || []) as CycleStage[];
};

export const getGreetingScripts = (): StandardScriptItem[] => {
  return (greetingData.scripts || []) as StandardScriptItem[];
};

export const getIdentificationScripts = (): StandardScriptItem[] => {
  return (identificationData.scripts || []) as StandardScriptItem[];
};

export const getOfferScripts = (): StandardScriptItem[] => {
  return (offerData.scripts || []) as StandardScriptItem[];
};

export const getClosingScripts = (): StandardScriptItem[] => {
  return (closingData.scripts || []) as StandardScriptItem[];
};

export const getObjectionScripts = (): ObjectionTGJPItem[] => {
  return (objectionData.scripts || []) as ObjectionTGJPItem[];
};

export const getFollowupScripts = (): StandardScriptItem[] => {
  return (followupData.scripts || []) as StandardScriptItem[];
};
