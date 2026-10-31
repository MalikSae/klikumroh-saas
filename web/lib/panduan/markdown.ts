// Parser for the small Markdown subset the guide chapters use (panduan/README.md): headings, paragraphs,
// ordered/unordered lists with nesting, one table shape, and the {{gambar: ...}} placeholder. It returns
// plain data; components/panduan/PanduanContent.tsx turns it into elements, so no HTML string is built
// and nothing in a chapter can inject markup.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export interface ListItem {
  inline: Inline[];
  children: Block[];
}

export type Block =
  | { type: 'heading'; level: 2 | 3; id: string; text: string }
  | { type: 'paragraph'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { type: 'image'; caption: string; src?: string };

const IMAGE_LINE = /^\{\{\s*gambar:\s*(.*?)\s*\}\}$/;
const BULLET = /^(\s*)([-*])\s+(.*)$/;
const NUMBERED = /^(\s*)(\d+)[.)]\s+(.*)$/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const m of src.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: 'text', text: src.slice(last, at) });
    if (m[1] !== undefined) out.push({ type: 'bold', text: m[1] });
    else if (m[2] !== undefined) out.push({ type: 'code', text: m[2] });
    else out.push({ type: 'link', text: m[3], href: m[4] });
    last = at + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', text: src.slice(last) });
  return out;
}

/** Plain text of a piece of Markdown, for headings and the search index. */
export function plainText(src: string): string {
  return src
    .replace(/\{\{\s*gambar:[^}]*\}\}/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, '')
    .replace(/^\|?\s*:?-{2,}.*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function headingId(text: string, used: Set<string>): string {
  const base =
    plainText(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'bagian';
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

const indentOf = (line: string) => line.length - line.trimStart().length;

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const used = new Set<string>();
  return parseBlocks(lines, used);
}

function parseBlocks(lines: string[], used: Set<string>): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const image = line.trim().match(IMAGE_LINE);
    if (image) {
      // {{gambar: berkas.png | keterangan}} is a screenshot; {{gambar: keterangan}} is a slot still waiting for one.
      const [first, ...rest] = image[1].split(' | ');
      blocks.push(rest.length > 0 ? { type: 'image', src: first.trim(), caption: rest.join(' | ') } : { type: 'image', caption: image[1] });
      i++;
      continue;
    }
    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      const text = plainText(heading[2]);
      blocks.push({ type: 'heading', level: heading[1].length as 2 | 3, id: headingId(text, used), text });
      i++;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const head = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const start = i;
      const base = indentOf(line);
      const ordered = NUMBERED.test(line);
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() === '') {
          // A blank line belongs to the list only when the next non-blank line is still part of it.
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === '') j++;
          if (j < lines.length && indentOf(lines[j]) > base) {
            i = j;
            continue;
          }
          if (j < lines.length && indentOf(lines[j]) === base && (ordered ? NUMBERED : BULLET).test(lines[j])) {
            i = j;
            continue;
          }
          break;
        }
        if (indentOf(next) > base) {
          i++;
          continue;
        }
        if (indentOf(next) === base && (ordered ? NUMBERED : BULLET).test(next)) {
          i++;
          continue;
        }
        break;
      }
      blocks.push(parseList(lines.slice(start, i), base, ordered, used));
      continue;
    }
    // Paragraph: consecutive plain lines.
    const para: string[] = [line.trim()];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{2,3}\s/.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i]) &&
      !IMAGE_LINE.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: 'paragraph', inline: parseInline(para.join(' ')) });
  }
  return blocks;
}

function parseList(lines: string[], base: number, ordered: boolean, used: Set<string>): Block {
  const marker = ordered ? NUMBERED : BULLET;
  const items: ListItem[] = [];
  let current: { head: string; rest: string[] } | null = null;
  for (const line of lines) {
    if (indentOf(line) === base && marker.test(line)) {
      if (current) items.push(finishItem(current, used));
      current = { head: (line.match(marker) as RegExpMatchArray)[3], rest: [] };
    } else if (current) {
      current.rest.push(line);
    }
  }
  if (current) items.push(finishItem(current, used));
  return { type: 'list', ordered, items };
}

function finishItem(item: { head: string; rest: string[] }, used: Set<string>): ListItem {
  // Continuation lines are indented under the item: strip the common indent, then parse them as blocks
  // (a nested list, an image placeholder, or a follow-up paragraph).
  const indents = item.rest.filter((l) => l.trim() !== '').map(indentOf);
  const cut = indents.length ? Math.min(...indents) : 0;
  const children = parseBlocks(item.rest.map((l) => l.slice(Math.min(cut, indentOf(l)))), used);
  return { inline: parseInline(item.head), children };
}
