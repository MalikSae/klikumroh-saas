import greetingData from '../data/scripts-chat/greeting.json';
import identificationData from '../data/scripts-chat/identification.json';
import offerData from '../data/scripts-chat/offer.json';
import closingData from '../data/scripts-chat/closing.json';
import objectionData from '../data/scripts-chat/objection.json';
import followupData from '../data/scripts-chat/followups.json';
import cycleData from '../data/conversion-chat/conversion-cycle.json';
import { fillTemplate, SCRIPT_PLACEHOLDERS } from './placeholderFill';

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
  jumlah_jamaah?: string;
  // Package facts (see packageFacts): paket, harga, tanggal, bulan, seat, hotel, maskapai, durasi, fasilitas_utama.
  [packageFact: string]: string | undefined;
}

/**
 * Fills a script with real data only. Returns null when the script cannot be shown for this context
 * (its opening sentence needs a value that is missing); other sentences with a missing value are dropped.
 */
export const replacePlaceholders = (text: string, values: PlaceholderReplacements): string | null => {
  const agent = values.agent_name || values.cs_name;
  return fillTemplate(text, { ...values, agent_name: agent, cs_name: agent }, { allowed: SCRIPT_PLACEHOLDERS });
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
