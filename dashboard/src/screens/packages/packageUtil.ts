// Package status labels and the text formats the public website reads (see web/components/PackageDetailClientView.tsx).
import type { PackageItem } from '../../services/api';
import type { PillTone } from '../../ui';
import { todayWIB } from '../../utils/datetime';

export const PACKAGE_STATUS: Record<PackageItem['status'], { label: string; tone: PillTone }> = {
  draft: { label: 'Draf', tone: 'gray' },
  published: { label: 'Tayang', tone: 'green' },
  archived: { label: 'Diarsipkan', tone: 'amber' },
};

/** A published package whose departure date (WIB) is before today: off the website, no longer on sale. */
export const isDeparted = (p: Pick<PackageItem, 'status' | 'departure_date'>, today = todayWIB()) =>
  p.status === 'published' && !!p.departure_date && p.departure_date.slice(0, 10) < today;

/** Status label for lists and the editor: a departed package reads 'Sudah berangkat' instead of 'Tayang'. */
export const packageStatusLabel = (p: Pick<PackageItem, 'status' | 'departure_date'>): { label: string; tone: PillTone } =>
  isDeparted(p) ? { label: 'Sudah berangkat', tone: 'gray' } : PACKAGE_STATUS[p.status];

export interface Hotel {
  city: string;
  name: string;
  stars: number;
}

/** Hotels are stored as JSON [{city,name,stars}]; older rows are "Kota: Nama (Bintang 5)" lines. */
export function parseHotels(text?: string | null): Hotel[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((h) => ({ city: String(h.city || ''), name: String(h.name || ''), stars: Number(h.stars) >= 1 && Number(h.stars) <= 5 ? Number(h.stars) : 5 }));
    }
  } catch {
    /* legacy text below */
  }
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const star = line.match(/bintang\s*(\d)/i);
      const stars = star ? Math.min(5, Math.max(1, Number(star[1]))) : 5;
      const m = line.match(/^([^:]+):\s*(.*)/);
      const clean = (s: string) => s.replace(/\(?\s*bintang\s*\d\s*\)?/i, '').trim();
      return m ? { city: m[1].trim(), name: clean(m[2]), stars } : { city: '', name: clean(line), stars };
    });
}

export const serializeHotels = (hotels: Hotel[]) => {
  const rows = hotels.filter((h) => h.name.trim() || h.city.trim()).map((h) => ({ city: h.city.trim(), name: h.name.trim(), stars: h.stars }));
  return rows.length ? JSON.stringify(rows) : null;
};

export interface Flight {
  airline: string;
  route: string;
}

export function parseFlight(text?: string | null): Flight {
  if (!text) return { airline: '', route: '' };
  try {
    const d = JSON.parse(text);
    if (d && typeof d === 'object') return { airline: String(d.airline || ''), route: String(d.route || '') };
  } catch {
    /* legacy text below */
  }
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return { airline: lines[0] || '', route: lines.slice(1).join(' ') };
}

export const serializeFlight = (f: Flight) => (f.airline.trim() || f.route.trim() ? JSON.stringify({ airline: f.airline.trim(), route: f.route.trim() }) : null);

/** Itinerary is stored as lines "Hari 1: ..."; a line without the prefix continues the previous day. */
export function parseItinerary(text?: string | null): string[] {
  if (!text) return [];
  const days: string[] = [];
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line) => {
      const m = line.match(/^Hari\s*\d+\s*:\s*(.*)$/i);
      if (m) days.push(m[1]);
      else if (days.length) days[days.length - 1] += '\n' + line;
      else days.push(line);
    });
  return days;
}

export const serializeItinerary = (days: string[]) => {
  const rows = days.map((d) => d.trim()).filter(Boolean);
  return rows.length ? rows.map((d, i) => `Hari ${i + 1}: ${d}`).join('\n') : null;
};
