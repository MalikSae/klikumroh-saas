// Legal documents are written as plain text in the internal dashboard. This turns that text into blocks the
// page renders as React elements, so nothing the author types is ever treated as HTML.
//
//   ## Judul bagian      -> section heading
//   - butir daftar       -> list item (consecutive lines form one list)
//   baris biasa          -> paragraph (a blank line starts the next one, a single line break stays a line break)

export type LegalBlock =
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; lines: string[] };

export function parseLegalText(text: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list });
    list = [];
  };

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^#{2,3}\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', text: heading[1].trim() });
      continue;
    }
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item) {
      flushParagraph();
      list.push(item[1].trim());
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}
