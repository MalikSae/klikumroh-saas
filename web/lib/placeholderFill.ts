// Pure placeholder filling for the agent WA scripts and the caption bank.
// Founder rule (5 Oct 2026): a placeholder is only ever replaced with real data from the system. When the
// value is missing, the sentence holding it is dropped (or the whole text hidden) - never a made-up fallback
// and never a raw {{...}} in the output. No imports so node tests can load this file directly.

const JAKARTA_TZ = 'Asia/Jakarta';

/** Placeholders the WA script texts may use; each one has a real data source on the script page. */
export const SCRIPT_PLACEHOLDERS = [
  'nama',
  'travel',
  'cs_name',
  'agent_name',
  'referral_link',
  'paket',
  'jumlah_jamaah',
  'harga',
  'tanggal',
  'bulan',
  'seat',
  'hotel',
  'maskapai',
  'durasi',
  'fasilitas_utama',
] as const;

/** Placeholders the caption texts may use (package facts + travel/agent info). */
export const CAPTION_PLACEHOLDERS = [
  'travel',
  'agent_name',
  'paket',
  'harga',
  'tanggal',
  'bulan',
  'tahun',
  'seat',
  'hotel',
  'maskapai',
  'rute',
  'durasi',
  'fasilitas_utama',
  'nomor_izin',
  'alamat',
] as const;

export type PlaceholderValues = Partial<Record<string, string | null | undefined>>;

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const HAS_PLACEHOLDER = /\{\{[^}]*\}\}/;

/** Placeholder keys used in a text, in order of appearance. */
export const placeholdersIn = (text: string): string[] => [...(text || '').matchAll(PLACEHOLDER_RE)].map((m) => m[1].toLowerCase());

const HONORIFIC = /^(Pak|Bapak|Bu|Ibu|Ustadz|Ustadzah|Mas|Mbak|Kak|Kakak)\b/i;

/**
 * {{nama}} has a natural fallback in Indonesian chat ("Kak"), so it never drops a sentence. A name that
 * already carries an honorific replaces "Kak {{nama}}" whole (no "Kak Bu Fatimah").
 */
const fillName = (text: string, rawName: string | null | undefined): string => {
  const name = (rawName || '').trim();
  let result = text;
  if (name) {
    if (HONORIFIC.test(name)) {
      result = result.replace(/Kak(?:ak)?\s+\{\{nama\}\}/gi, name);
    }
    result = result.replace(/\{\{nama\}\}/gi, name);
  } else {
    result = result.replace(/(Kak(?:ak)?)\s+\{\{nama\}\}/gi, '$1');
    result = result.replace(/\{\{nama\}\}/gi, 'Kak');
  }
  return result.replace(/\bKak\s+Kak\b/gi, 'Kak').replace(/\bKak\s+(Bu|Pak)\b/gi, '$1');
};

/** Splits one line into sentences at end punctuation followed by a space ("5.000" stays whole). */
const splitSentences = (line: string): string[] => line.split(/(?<=[.!?])\s+/);

export interface FillOptions {
  /** Placeholder keys that may appear; anything else is treated as unavailable. */
  allowed: readonly string[];
}

/**
 * Fills a template with real values. A sentence holding a placeholder that is not allowed or has no
 * value is dropped. Returns null (hide the text) when the opening sentence had to go or nothing is left,
 * because the rest of the message would no longer make sense without it.
 */
export const fillTemplate = (text: string, values: PlaceholderValues, options: FillOptions): string | null => {
  if (!text) return '';
  const allowed = new Set(options.allowed.map((k) => k.toLowerCase()));
  const valueOf = (key: string): string => {
    if (!allowed.has(key)) return '';
    const v = values[key];
    return typeof v === 'string' ? v.trim() : '';
  };

  const source = allowed.has('nama') ? fillName(text, values.nama) : text;

  let firstSentenceSeen = false;
  let firstSentenceDropped = false;
  const lines = source.split('\n').map((line) => {
    if (!line.trim()) return line;
    return splitSentences(line)
      .map((sentence) => {
        const isFirst = !firstSentenceSeen && Boolean(sentence.trim());
        if (isFirst) firstSentenceSeen = true;
        let missing = false;
        const filled = sentence.replace(PLACEHOLDER_RE, (_m, rawKey: string) => {
          const v = valueOf(rawKey.toLowerCase());
          if (!v) missing = true;
          return v;
        });
        // Safety net: a value that itself looks like a placeholder must not leak either.
        if (missing || HAS_PLACEHOLDER.test(filled)) {
          if (isFirst) firstSentenceDropped = true;
          return '';
        }
        return filled;
      })
      .filter((sentence) => sentence.trim())
      .join(' ');
  });

  if (firstSentenceDropped) return null;
  const result = lines
    .map((l) => l.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!result || HAS_PLACEHOLDER.test(result)) return null;
  return result;
};

// ---------------------------------------------------------------------------------------------------------
// Package facts from the public package API (GET /api/public/packages)

export interface PackageLike {
  id: number;
  name: string;
  price?: number | null;
  departure_date?: string | null;
  quota?: number | null;
  seats_taken?: number | null;
  hotel_info?: string | null;
  flight_info?: string | null;
  itinerary?: string | null;
  facilities_included?: string | null;
}

export interface ParsedHotel {
  city: string;
  name: string;
  stars: number;
}

export interface ParsedFlight {
  airline: string;
  route: string;
}

const validStars = (s: unknown): number => (typeof s === 'number' && s >= 1 && s <= 5 ? Math.round(s) : 0);

/** hotel_info is JSON [{city,name,stars}] (dashboard editor); older rows may be plain lines "Makkah: Hilton (Bintang 5)". */
export const parseHotelInfo = (text?: string | null): ParsedHotel[] => {
  if (!text || !text.trim()) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item: { city?: unknown; name?: unknown; stars?: unknown }) => ({
          city: typeof item?.city === 'string' ? item.city.trim() : '',
          name: typeof item?.name === 'string' ? item.name.trim() : '',
          stars: validStars(item?.stars),
        }))
        .filter((h) => h.name);
    }
    return [];
  } catch {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const starMatch = line.match(/bintang\s*(\d)/i);
        const stars = starMatch ? validStars(Number(starMatch[1])) : 0;
        const m = line.match(/^([^:]+):\s*(.*)$/);
        const rawName = m ? m[2] : line;
        const name = rawName.replace(/\(?\s*bintang\s*\d\s*\)?/i, '').trim();
        return { city: m ? m[1].trim() : '', name, stars };
      })
      .filter((h) => h.name);
  }
};

/** flight_info is JSON {airline, route}; older rows may be plain text (first line airline, rest route). */
export const parseFlightInfo = (text?: string | null): ParsedFlight => {
  const empty = { airline: '', route: '' };
  if (!text || !text.trim()) return empty;
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return {
        airline: typeof data.airline === 'string' ? data.airline.trim() : '',
        route: typeof data.route === 'string' ? data.route.trim() : '',
      };
    }
    return empty;
  } catch {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    return { airline: lines[0] || '', route: lines.slice(1).join(', ') };
  }
};

/** "Hilton Makkah (bintang 5)" for each hotel, joined in Indonesian ("A, B dan C"). */
export const hotelLabel = (hotels: ParsedHotel[]): string => {
  const parts = hotels.map((h) => (h.stars ? `${h.name} (bintang ${h.stars})` : h.name));
  if (parts.length <= 1) return parts[0] || '';
  return `${parts.slice(0, -1).join(', ')} dan ${parts[parts.length - 1]}`;
};

/** Airline without a parenthetical note, e.g. "Saudia (Direct)" -> "Saudia". */
export const airlineLabel = (flight: ParsedFlight): string => flight.airline.replace(/\(.*?\)/g, '').replace(/\s{2,}/g, ' ').trim();

/** Number of days from the itinerary ("Hari 1: ...", "Hari 9: ..."), or 0 when there is no day list. */
export const itineraryDays = (text?: string | null): number => {
  if (!text) return 0;
  let max = 0;
  for (const m of text.matchAll(/^\s*Hari\s*(\d+)\s*:/gim)) max = Math.max(max, Number(m[1]));
  return max;
};

/** First facilities from the included list, joined with commas. */
export const mainFacilities = (text?: string | null, limit = 3): string => {
  if (!text) return '';
  return text
    .split('\n')
    .map((l) => l.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, limit)
    .join(', ');
};

/** Rupiah with dot separators, e.g. "Rp 28.500.000"; '' when there is no positive price. */
export const rupiah = (price?: number | null): string => {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return '';
  return `Rp ${Math.round(price).toLocaleString('id-ID')}`;
};

const jakartaDate = (value: string | null | undefined, options: Intl.DateTimeFormatOptions): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { ...options, timeZone: JAKARTA_TZ });
};

/** Remaining seats as a plain number string; '' when there is no quota or nothing is left. */
export const remainingSeats = (pkg: PackageLike): string => {
  if (typeof pkg.quota !== 'number' || pkg.quota <= 0) return '';
  const left = pkg.quota - (typeof pkg.seats_taken === 'number' ? pkg.seats_taken : 0);
  return left > 0 ? String(left) : '';
};

/** Every package fact a script or caption may mention, '' where the package has no real value. */
export const packageFacts = (pkg: PackageLike | null | undefined): Record<string, string> => {
  if (!pkg) return {};
  const flight = parseFlightInfo(pkg.flight_info);
  const days = itineraryDays(pkg.itinerary);
  return {
    paket: (pkg.name || '').trim(),
    harga: rupiah(pkg.price),
    tanggal: jakartaDate(pkg.departure_date, { day: 'numeric', month: 'long', year: 'numeric' }),
    bulan: jakartaDate(pkg.departure_date, { month: 'long', year: 'numeric' }),
    tahun: jakartaDate(pkg.departure_date, { year: 'numeric' }),
    seat: remainingSeats(pkg),
    hotel: hotelLabel(parseHotelInfo(pkg.hotel_info)),
    maskapai: airlineLabel(flight),
    rute: flight.route,
    durasi: days > 0 ? `${days} hari` : '',
    fasilitas_utama: mainFacilities(pkg.facilities_included),
  };
};
