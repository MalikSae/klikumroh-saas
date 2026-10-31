import assert from 'node:assert';
import fs from 'node:fs';
import { parseMarkdown, parseInline, plainText } from '../lib/panduan/markdown.ts';
import { search, queryTokens } from '../lib/panduan/search.ts';

const chapters = JSON.parse(fs.readFileSync(new URL('../data/panduan.generated.json', import.meta.url), 'utf8'));
const entries = chapters.map((c) => {
  const blocks = parseMarkdown(c.body);
  return {
    slug: c.slug,
    title: c.title,
    label: c.labelText || c.label,
    summary: c.summary,
    menu: c.menu,
    alias: c.alias,
    headings: blocks.flatMap((b) => (b.type === 'heading' ? [{ id: b.id, text: b.text }] : [])),
    text: plainText(c.body),
  };
});

let failed = 0;
const t = (name, fn) => {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
};

t('parseInline: bold, code, slug link', () => {
  const r = parseInline('Buka **Paket**, isi `harga` lalu [lihat bab](slug:paket-pertama).');
  assert.deepStrictEqual(r.map((x) => x.type), ['text', 'bold', 'text', 'code', 'text', 'link', 'text']);
  assert.strictEqual(r[5].href, 'slug:paket-pertama');
});

t('parseMarkdown: numbered list with nested bullets and an image slot', () => {
  const md = '## Langkah\n\n1. Buka **Paket**.\n2. Isi:\n   - **Nama**\n   - **Harga**\n\n{{gambar: layar paket}}\n3. Simpan.\n';
  const b = parseMarkdown(md);
  assert.strictEqual(b[0].type, 'heading');
  assert.strictEqual(b[1].type, 'list');
  assert.strictEqual(b[1].ordered, true);
  assert.strictEqual(b[1].items[1].children[0].type, 'list');
  assert.strictEqual(b[1].items[1].children[0].items.length, 2);
});

t('parseMarkdown: table has head and rows', () => {
  const b = parseMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n');
  assert.strictEqual(b[0].type, 'table');
  assert.strictEqual(b[0].rows.length, 2);
});

t('parseMarkdown: duplicate headings get distinct ids', () => {
  const b = parseMarkdown('## Langkah\n\n## Langkah\n');
  assert.notStrictEqual(b[0].id, b[1].id);
});

t('every chapter parses clean (no stray markup left in text)', () => {
  for (const c of chapters) {
    const walk = (blocks) => {
      for (const b of blocks) {
        const texts = [];
        const addInline = (parts) => parts.forEach((p) => texts.push(p.text));
        if (b.type === 'paragraph') addInline(b.inline);
        if (b.type === 'list') b.items.forEach((it) => { addInline(it.inline); walk(it.children); });
        if (b.type === 'table') [b.head, ...b.rows].flat().forEach(addInline);
        for (const x of texts) assert.ok(!/\*\*|\{\{|\]\(slug:/.test(x), `${c.slug}: sisa markup "${x.slice(0, 60)}"`);
      }
    };
    walk(parseMarkdown(c.body));
  }
});

t('every chapter keeps its image slots as image blocks', () => {
  for (const c of chapters) {
    const slots = (c.body.match(/\{\{gambar:/g) || []).length;
    const count = (blocks) => blocks.reduce((n, b) => n + (b.type === 'image' ? 1 : 0) + (b.type === 'list' ? b.items.reduce((m, it) => m + count(it.children), 0) : 0), 0);
    assert.strictEqual(count(parseMarkdown(c.body)), slots, `${c.slug}: penanda gambar hilang`);
  }
});

t('parseMarkdown: {{gambar: berkas | keterangan}} is a screenshot, {{gambar: keterangan}} a waiting slot', () => {
  const [shot, slot] = parseMarkdown('{{gambar: paket-1.png | Editor paket | bagian harga}}\n\n{{gambar: layar yang belum difoto}}\n');
  assert.deepStrictEqual(shot, { type: 'image', src: 'paket-1.png', caption: 'Editor paket | bagian harga' });
  assert.deepStrictEqual(slot, { type: 'image', caption: 'layar yang belum difoto' });
});

t('every screenshot a chapter points to has a size and a file', () => {
  let count = 0;
  for (const c of chapters) {
    const walk = (blocks) => blocks.forEach((b) => {
      if (b.type === 'image' && b.src) {
        count++;
        assert.ok(c.images[b.src]?.width > 0 && c.images[b.src]?.height > 0, `${c.slug}: ukuran ${b.src} hilang`);
        assert.ok(fs.existsSync(new URL(`../public/panduan/${b.src}`, import.meta.url)), `${c.slug}: ${b.src} tidak ada`);
      }
      if (b.type === 'list') b.items.forEach((it) => walk(it.children));
    });
    walk(parseMarkdown(c.body));
  }
  assert.ok(count >= 20, `hanya ${count} gambar`);
});

t('queryTokens drops filler words but keeps a lone filler', () => {
  assert.deepStrictEqual(queryTokens('cara tambah paket'), ['tambah', 'paket']);
  assert.deepStrictEqual(queryTokens('cara'), ['cara']);
});

const top = (q, n = 3) => search(entries, q).slice(0, n).map((h) => h.slug);
const expectTop = (q, slug, n = 3) => t(`search "${q}" -> ${slug} in top ${n}`, () => assert.ok(top(q, n).includes(slug), `dapat: ${top(q, n).join(', ') || '(kosong)'}`));

expectTop('domain', 'domain-sendiri', 1);
expectTop('dns', 'domain-sendiri', 2);
expectTop('cloudflare', 'domain-sendiri', 1);
expectTop('logo', 'logo-dan-warna', 1);
expectTop('ganti warna', 'logo-dan-warna', 1);
expectTop('bayar', 'langganan-dan-pembayaran', 2);
expectTop('kupon', 'langganan-dan-pembayaran', 2);
expectTop('tambah paket', 'paket-pertama', 2);
expectTop('komisi agen', 'komisi-per-paket', 3);
expectTop('tarik saldo', 'pencairan-komisi', 2);
expectTop('setujui agen', 'terima-agen', 2);
expectTop('follow up', 'tindak-lanjut-cepat', 2);
expectTop('website tidak muncul di google', 'kalau-begini-cek-ini', 4);
expectTop('Pencairan', 'pencairan-komisi', 1); // case-insensitive
expectTop('prospék', 'prospek-masuk', 3); // accent-insensitive

t('search: gibberish returns nothing', () => assert.strictEqual(search(entries, 'zzqxj').length, 0));
t('search: empty query returns nothing', () => assert.strictEqual(search(entries, '   ').length, 0));
t('search: section anchor exists in the chapter when given', () => {
  for (const q of ['langkah', 'cek hasilnya', 'kalau bermasalah']) {
    for (const h of search(entries, q)) {
      if (!h.anchor) continue;
      const e = entries.find((x) => x.slug === h.slug);
      assert.ok(e.headings.some((x) => x.id === h.anchor), `${h.slug}#${h.anchor}`);
    }
  }
});

// /panduan is KlikUmroh's own page: a travel's domain must send it to the platform with path + query kept,
// and the platform host must serve it.
{
  const { NextRequest } = await import('next/server.js');
  const { proxy } = await import('../proxy.ts');
  const prevOrigin = process.env.PLATFORM_ORIGIN;
  const prevFetch = globalThis.fetch;
  process.env.PLATFORM_ORIGIN = 'https://klikumroh.id';
  globalThis.fetch = async () => {
    throw new Error('backend must not be called for a platform-only path');
  };
  const req = (url) => new NextRequest(url, { headers: { host: new URL(url).host } });
  try {
    for (const path of ['/panduan', '/panduan/domain-sendiri', '/panduan/domain-sendiri?x=1#dns']) {
      try {
        const res = await proxy(req(`http://namatravel.com${path.split('#')[0]}`));
        assert.strictEqual(res.status, 307);
        assert.strictEqual(res.headers.get('location'), `https://klikumroh.id${path.split('#')[0]}`);
        console.log(`PASS  travel host ${path} -> platform, path + query kept`);
      } catch (e) {
        failed++;
        console.log(`FAIL  travel host ${path}\n      ${e.message}`);
      }
    }
    try {
      const own = await proxy(req('http://klikumroh.id/panduan/domain-sendiri'));
      assert.strictEqual(own.headers.get('location'), null);
      const look = await proxy(req('http://namatravel.com/panduanku'));
      assert.notStrictEqual(look.headers.get('location'), 'https://klikumroh.id/panduanku');
      console.log('PASS  platform host serves /panduan; look-alike /panduanku is not platform-only');
    } catch (e) {
      failed++;
      console.log(`FAIL  platform host / look-alike\n      ${e.message}`);
    }
  } finally {
    if (prevOrigin === undefined) delete process.env.PLATFORM_ORIGIN;
    else process.env.PLATFORM_ORIGIN = prevOrigin;
    globalThis.fetch = prevFetch;
  }
}

if (failed) {
  console.log(`\n${failed} test gagal`);
  process.exit(1);
}
console.log('\nSemua test panduan lolos');
