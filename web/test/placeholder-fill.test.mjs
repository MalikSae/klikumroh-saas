import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SCRIPT_PLACEHOLDERS,
  CAPTION_PLACEHOLDERS,
  fillTemplate,
  placeholdersIn,
  packageFacts,
  parseHotelInfo,
  parseFlightInfo,
  hotelLabel,
  itineraryDays,
  matchesQuery,
  fillCaption,
  shownCaptions,
  shownCaptionCounts,
} from '../lib/placeholderFill.ts';

const dataDir = (sub) => fileURLToPath(new URL(`../data/${sub}/`, import.meta.url));
const readJsonDir = (sub) =>
  readdirSync(dataDir(sub))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: `${sub}/${f}`, json: JSON.parse(readFileSync(dataDir(sub) + f, 'utf8')) }));

/** Every string in a JSON value, with its path. */
const strings = (value, path = '', out = []) => {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') for (const k of Object.keys(value)) strings(value[k], `${path}.${k}`, out);
  return out;
};

const scriptFiles = readJsonDir('scripts-chat');
const captionFiles = readJsonDir('copywriting');

// Data scan: no placeholder without a real data source may remain anywhere in the source texts.
test('scripts-chat data only uses supported placeholders', () => {
  const bad = [];
  for (const { file, json } of scriptFiles) {
    for (const { path, text } of strings(json)) {
      for (const key of placeholdersIn(text)) if (!SCRIPT_PLACEHOLDERS.includes(key)) bad.push(`${file}${path}: {{${key}}}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('copywriting data only uses supported placeholders', () => {
  const bad = [];
  for (const { file, json } of captionFiles) {
    for (const { path, text } of strings(json)) {
      for (const key of placeholdersIn(text)) if (!CAPTION_PLACEHOLDERS.includes(key)) bad.push(`${file}${path}: {{${key}}}`);
    }
  }
  assert.deepEqual(bad, []);
});

const fullScriptValues = {
  nama: 'Bu Fatimah',
  travel: 'Travel Amanah',
  agent_name: 'Rina',
  cs_name: 'Rina',
  referral_link: 'https://amanah.klikumroh.id/ref/RINA1',
  paket: 'Umroh Hemat 9 Hari',
  jumlah_jamaah: '3',
  harga: 'Rp 28.500.000',
  tanggal: '12 Januari 2027',
  bulan: 'Januari 2027',
  seat: '4',
  hotel: 'Hilton Makkah (bintang 5)',
  maskapai: 'Saudia',
  durasi: '9 hari',
  fasilitas_utama: 'Visa, tiket PP, hotel',
};

const scriptTexts = scriptFiles.flatMap(({ json }) =>
  (json.scripts || []).flatMap((s) =>
    s.tgjp ? [...s.tgjp.terima, ...s.tgjp.gali, ...s.tgjp.jawab.map((j) => j.script), ...s.tgjp.pastikan] : [s.script]
  )
);

// Safety net: whatever data is (or is not) available, no raw {{...}} reaches the agent.
test('every script fills cleanly with full data and never leaks a placeholder without data', () => {
  assert.ok(scriptTexts.length > 100);
  for (const text of scriptTexts) {
    const full = fillTemplate(text, fullScriptValues, { allowed: SCRIPT_PLACEHOLDERS });
    assert.ok(full !== null, `hidden with full data: ${text}`);
    assert.doesNotMatch(full, /\{\{|\}\}/);
    const empty = fillTemplate(text, {}, { allowed: SCRIPT_PLACEHOLDERS });
    if (empty !== null) assert.doesNotMatch(empty, /\{\{|\}\}/);
  }
});

test('every caption part never leaks a placeholder', () => {
  const parts = captionFiles.flatMap(({ json }) => (json.copies || []).flatMap((c) => [c.hook, c.body, c.cta].filter(Boolean)));
  for (const text of parts) {
    for (const values of [{}, { travel: 'Travel Amanah', paket: 'Umroh Hemat', harga: 'Rp 28.500.000' }]) {
      const out = fillTemplate(text, values, { allowed: CAPTION_PLACEHOLDERS });
      if (out !== null) assert.doesNotMatch(out, /\{\{|\}\}/);
    }
  }
});

test('missing value drops its sentence; missing value in the opening hides the text', () => {
  const opts = { allowed: SCRIPT_PLACEHOLDERS };
  assert.equal(
    fillTemplate('Halo Kak {{nama}}. Saat ini tersisa {{seat}} seat. Kabari saya ya.', { nama: 'Andi' }, opts),
    'Halo Kak Andi. Kabari saya ya.'
  );
  assert.equal(fillTemplate('Untuk tanggal {{tanggal}}, tersisa {{seat}} seat, Kak. Kabari ya.', { tanggal: '' }, opts), null);
  assert.equal(fillTemplate('Saat ini tersisa {{seat}} seat.', { seat: '4' }, opts), 'Saat ini tersisa 4 seat.');
  // Unknown placeholder is never output, even with a value.
  assert.equal(fillTemplate('Halo. DP {{dp}} ya.', { dp: 'Rp 5.000.000' }, opts), 'Halo.');
  // A value that itself looks like a placeholder must not leak.
  assert.equal(fillTemplate('Halo. Paket {{paket}}.', { paket: '{{harga}}' }, opts), 'Halo.');
  // Numbers with dots in the template do not break the sentence split.
  assert.equal(fillTemplate('Mulai Rp 5.000 saja. Paket {{paket}}.', {}, opts), 'Mulai Rp 5.000 saja.');
});

test('{{nama}}: honorific replaces "Kak", empty name falls back to "Kak"', () => {
  const opts = { allowed: SCRIPT_PLACEHOLDERS };
  assert.equal(fillTemplate('Kak {{nama}}, apa kabar?', { nama: 'Bu Fatimah' }, opts), 'Bu Fatimah, apa kabar?');
  assert.equal(fillTemplate('Kak {{nama}}, apa kabar?', { nama: '' }, opts), 'Kak, apa kabar?');
  assert.equal(fillTemplate('Kak {{nama}}, apa kabar?', { nama: 'Andi' }, opts), 'Kak Andi, apa kabar?');
});

test('hotel_info / flight_info JSON are parsed into readable labels', () => {
  const hotels = parseHotelInfo(JSON.stringify([
    { city: 'Makkah', name: 'Hilton Makkah', stars: 5 },
    { city: 'Madinah', name: 'Dar Al Taqwa', stars: 4 },
  ]));
  assert.equal(hotelLabel(hotels), 'Hilton Makkah (bintang 5) dan Dar Al Taqwa (bintang 4)');
  assert.equal(hotelLabel(parseHotelInfo('Makkah: Hilton (Bintang 5)')), 'Hilton (bintang 5)');
  assert.equal(hotelLabel(parseHotelInfo('')), '');
  assert.deepEqual(parseFlightInfo('{"airline":"Saudia","route":"CGK - JED"}'), { airline: 'Saudia', route: 'CGK - JED' });
  assert.equal(itineraryDays('Hari 1: Berangkat\nHari 2: Tiba\nHari 9: Pulang'), 9);
  assert.equal(itineraryDays('Rencana menyusul'), 0);
});

test('packageFacts: real values only, seat is a number, date in WIB', () => {
  const facts = packageFacts({
    id: 1,
    name: 'Umroh Hemat',
    price: 28500000,
    // 31 Dec 2026 20:00 UTC = 1 Jan 2027 03:00 WIB
    departure_date: '2026-12-31T20:00:00Z',
    quota: 45,
    seats_taken: 41,
    hotel_info: '[{"city":"Makkah","name":"Hilton Makkah","stars":5}]',
    flight_info: '{"airline":"Saudia (Direct)","route":"CGK - JED"}',
    itinerary: 'Hari 1: A\nHari 9: B',
    facilities_included: '- Visa\n- Tiket PP\n- Hotel\n- Makan',
  });
  assert.equal(facts.harga, 'Rp 28.500.000');
  assert.equal(facts.tanggal, '1 Januari 2027');
  assert.equal(facts.bulan, 'Januari 2027');
  assert.equal(facts.tahun, '2027');
  assert.equal(facts.seat, '4');
  assert.equal(facts.hotel, 'Hilton Makkah (bintang 5)');
  assert.equal(facts.maskapai, 'Saudia');
  assert.equal(facts.rute, 'CGK - JED');
  assert.equal(facts.durasi, '9 hari');
  assert.equal(facts.fasilitas_utama, 'Visa, Tiket PP, Hotel');

  const bare = packageFacts({ id: 2, name: 'Paket B', price: null, departure_date: null, quota: 10, seats_taken: 10 });
  for (const key of ['harga', 'tanggal', 'bulan', 'tahun', 'seat', 'hotel', 'maskapai', 'rute', 'durasi', 'fasilitas_utama']) {
    assert.equal(bare[key], '', key);
  }
  assert.deepEqual(packageFacts(null), {});
});

// Bank caption: the chip counts must equal the captions the page actually shows (founder decision, 5 Oct 2026).
const allCaptions = captionFiles.flatMap(({ json }) => json.copies || []);
const captionValueSets = {
  nothing: {},
  bare: { travel: 'Travel Amanah', agent_name: 'Rina', ...packageFacts({ id: 2, name: 'Paket B', price: null }) },
  full: {
    travel: 'Travel Amanah',
    agent_name: 'Rina',
    nomor_izin: 'PPIU 123/2020',
    alamat: 'Jl. Merdeka 1, Bandung',
    ...packageFacts({
      id: 1,
      name: 'Umroh Hemat',
      price: 28500000,
      departure_date: '2027-01-12T00:00:00+07:00',
      quota: 45,
      seats_taken: 41,
      hotel_info: '[{"city":"Makkah","name":"Hilton Makkah","stars":5}]',
      flight_info: '{"airline":"Saudia","route":"CGK - JED"}',
      itinerary: 'Hari 1: A\nHari 9: B',
      facilities_included: '- Visa\n- Tiket PP',
    }),
  },
};

test('caption counts equal the captions shown per category, for every package data set and search', () => {
  const goals = [...new Set(allCaptions.map((c) => c.goal))];
  const favorites = allCaptions.filter((_, i) => i % 7 === 0).map((c) => c.id).concat(['id-yang-sudah-dihapus']);
  for (const [label, values] of Object.entries(captionValueSets)) {
    for (const query of ['', 'hotel', 'ORANG TUA', 'tidak-ada-kata-ini']) {
      const shown = shownCaptions(allCaptions, values, query);
      const counts = shownCaptionCounts(shown, favorites);
      for (const goal of goals) {
        // What the page lists for this chip, computed independently from the raw data.
        const listed = allCaptions.filter((c) => {
          if (c.goal !== goal) return false;
          const parts = fillCaption(c, values);
          return parts !== null && matchesQuery(query, [c.title, parts.hook, parts.body, parts.cta, c.tags]);
        });
        assert.equal(counts.byGoal[goal] || 0, listed.length, `${label} / "${query}" / ${goal}`);
      }
      const listedFavorites = shown.filter(({ copy }) => favorites.includes(copy.id)).length;
      assert.equal(counts.favorites, listedFavorites, `${label} / "${query}" / favorites`);
      const sum = Object.values(counts.byGoal).reduce((a, b) => a + b, 0);
      assert.equal(sum, shown.length, `${label} / "${query}" / total`);
      for (const { parts } of shown) assert.doesNotMatch(`${parts.hook}${parts.body}${parts.cta}`, /\{\{|\}\}/);
    }
  }
});

test('caption counts drop below the static JSON totals when package data is missing', () => {
  const staticTotal = allCaptions.length;
  const bareShown = shownCaptions(allCaptions, captionValueSets.bare, '').length;
  const fullShown = shownCaptions(allCaptions, captionValueSets.full, '').length;
  assert.ok(bareShown < staticTotal, `bare ${bareShown} < ${staticTotal}`);
  assert.ok(fullShown >= bareShown, `full ${fullShown} >= bare ${bareShown}`);
  // A saved caption that cannot be shown for this package is not counted under "Tersimpan".
  const hiddenForBare = allCaptions.find((c) => fillCaption(c, captionValueSets.bare) === null);
  assert.ok(hiddenForBare);
  assert.equal(shownCaptionCounts(shownCaptions(allCaptions, captionValueSets.bare, ''), [hiddenForBare.id]).favorites, 0);
});

test('matchesQuery: case-insensitive over strings and string lists, empty query matches all', () => {
  assert.equal(matchesQuery('', ['x']), true);
  assert.equal(matchesQuery('  ', [null]), true);
  assert.equal(matchesQuery('DP', ['Bayar dp sekarang']), true);
  assert.equal(matchesQuery('lansia', [undefined, ['umum', 'Lansia']]), true);
  assert.equal(matchesQuery('mahal', ['murah', ['hemat']]), false);
});
