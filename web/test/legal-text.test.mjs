import assert from 'node:assert';
import { parseLegalText } from '../lib/legalText.ts';

// Legal text: headings (## ), lists (- ), paragraphs (blank line between), \r\n from a browser textarea.
const blocks = parseLegalText('## Pasal 1\r\nBaris satu\r\nBaris dua\r\n\r\nParagraf kedua\r\n\r\n- butir a\r\n- butir b\r\nSetelah daftar\r\n### Sub bagian');
assert.deepStrictEqual(blocks, [
  { type: 'heading', text: 'Pasal 1' },
  { type: 'paragraph', lines: ['Baris satu', 'Baris dua'] },
  { type: 'paragraph', lines: ['Paragraf kedua'] },
  { type: 'list', items: ['butir a', 'butir b'] },
  { type: 'paragraph', lines: ['Setelah daftar'] },
  { type: 'heading', text: 'Sub bagian' },
]);

// Empty or blank text gives no blocks.
assert.deepStrictEqual(parseLegalText(''), []);
assert.deepStrictEqual(parseLegalText('   \n\n  '), []);

// HTML is kept as plain text: the page renders it as React text, never as markup.
const html = parseLegalText('<script>alert(1)</script>\n<b>tebal</b>');
assert.deepStrictEqual(html, [{ type: 'paragraph', lines: ['<script>alert(1)</script>', '<b>tebal</b>'] }]);

// A lone "#" or "##" without text is not a heading; "-" without text is not a list item.
assert.deepStrictEqual(parseLegalText('##\n-'), [{ type: 'paragraph', lines: ['##', '-'] }]);

console.log('legal-text: all assertions passed');
