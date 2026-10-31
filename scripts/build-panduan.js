#!/usr/bin/env node
// Bakes the guide chapters (panduan/NN-slug.md) into web/data/panduan.generated.json.
// Production runs the standalone Next.js server, which has no panduan/ folder at runtime, so the text
// must travel inside the build. Runs before `next dev` and `next build` (web/package.json), and fails
// loudly on a broken chapter so a bad link never reaches the site.
//   node scripts/build-panduan.js          write the file
//   node scripts/build-panduan.js --check  exit 1 when the committed file is stale
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'panduan');
const OUT = path.join(ROOT, 'web', 'data', 'panduan.generated.json');
const IMAGES = path.join(ROOT, 'web', 'public', 'panduan');

const STAGES = ['mulai', 'tahap-1', 'tahap-2', 'tahap-3', 'lanjutan', 'bantuan'];
const LABELS = ['wajib', 'disarankan', 'opsional'];

// Pixel size of a PNG or JPEG, read from its header (the page reserves the space before the image loads).
function imageSize(buf, name) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  throw new Error(`${name}: bukan PNG atau JPEG yang valid`);
}

// {{gambar: berkas.png | keterangan}} points to web/public/panduan/berkas.png; without a file name it stays a placeholder.
function chapterImages(c) {
  const images = {};
  for (const m of c.body.matchAll(/\{\{\s*gambar:\s*(.*?)\s*\}\}/g)) {
    const [first, ...rest] = m[1].split(' | ');
    if (rest.length === 0) continue;
    if (!/^[a-z0-9-]+\.(png|jpe?g)$/.test(first)) throw new Error(`${c.file}: nama berkas gambar tidak valid "${first}"`);
    const file = path.join(IMAGES, first);
    if (!fs.existsSync(file)) throw new Error(`${c.file}: gambar ${first} tidak ada di web/public/panduan`);
    images[first] = imageSize(fs.readFileSync(file), first);
  }
  return images;
}

function parseChapter(file) {
  const raw = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error(`${file}: frontmatter hilang`);
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  const alias = (fm.alias || '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    slug: fm.slug,
    title: fm.title,
    stage: fm.stage,
    label: fm.label || '',
    labelText: fm.label_text || '',
    order: Number(fm.order),
    summary: fm.summary,
    menu: fm.menu || '',
    alias,
    body: raw.slice(m[0].length).trim(),
    file,
  };
}

function build() {
  const files = fs.readdirSync(SRC).filter((f) => /^\d\d-.+\.md$/.test(f)).sort();
  const chapters = files.map(parseChapter);
  const slugs = new Set();
  for (const c of chapters) {
    const where = c.file;
    if (!c.slug || !/^[a-z0-9-]+$/.test(c.slug)) throw new Error(`${where}: slug tidak valid`);
    if (where.replace(/^\d\d-/, '').replace(/\.md$/, '') !== c.slug) throw new Error(`${where}: slug tidak sama dengan nama file`);
    if (slugs.has(c.slug)) throw new Error(`${where}: slug ganda ${c.slug}`);
    slugs.add(c.slug);
    if (!c.title) throw new Error(`${where}: title kosong`);
    if (!c.summary) throw new Error(`${where}: summary kosong`);
    if (!STAGES.includes(c.stage)) throw new Error(`${where}: stage tidak dikenal "${c.stage}"`);
    if (c.label && !LABELS.includes(c.label)) throw new Error(`${where}: label tidak dikenal "${c.label}"`);
    if (c.stage !== 'bantuan' && c.stage !== 'mulai' && !c.label) throw new Error(`${where}: label wajib diisi`);
    if (Number.isNaN(c.order)) throw new Error(`${where}: order bukan angka`);
    if (c.alias.length === 0) throw new Error(`${where}: alias kosong`);
  }
  for (const c of chapters) {
    for (const link of c.body.matchAll(/\]\(slug:([^)]+)\)/g)) {
      if (!slugs.has(link[1])) throw new Error(`${c.file}: tautan ke bab "${link[1]}" tidak ada`);
    }
  }
  for (const c of chapters) c.images = chapterImages(c);
  chapters.sort((a, b) => a.order - b.order);
  return chapters.map(({ file, ...rest }) => rest);
}

const json = JSON.stringify(build(), null, 1) + '\n';
if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== json) {
    console.error('web/data/panduan.generated.json sudah usang. Jalankan: node scripts/build-panduan.js');
    process.exit(1);
  }
  console.log('panduan.generated.json up to date');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log(`panduan: ${JSON.parse(json).length} bab -> web/data/panduan.generated.json`);
}
