// Runtime audit of the cards on the page that is open (run it in the browser console, or through the in-app
// browser's javascript tool). It measures what the CSS guards cannot: the real distances inside each .ag-card.
//
// Rules (docs: UI-STANDARDS.md "Kartu" and "Jarak isi kartu"):
//   1. padding of the card: 16 all round; variants list 0/16, flush 0.
//   2. the first child starts at the card's top padding, the last child ends at its bottom padding
//      (no margin pushes content, no negative margin pulls it).
//   3. children are spaced by the card gap (12) only: no child has its own margin-top / margin-bottom.
//   4. the card head is as tall as its text: title line (22) or title + meta line (<= 22 + 16 + gap);
//      the title starts 16px below the card top.
//   5. the head ends 16px before the card's right edge (the scroller variant bleeds below the head, not in it).
//
// Usage:  copy the whole file into the console (it ends with an expression that returns the report), or
//         const report = await window.eval(fs.readFileSync('scripts/audit-cards.browser.js','utf8')).
// A page with no violations returns { cards: N, violations: [] }.
(() => {
  const px = (v) => Math.round(parseFloat(v) || 0);
  const violations = [];
  const cards = [...document.querySelectorAll('.ag-card')].filter((c) => c.getBoundingClientRect().height > 0);
  const name = (el) => (typeof el.className === 'string' && el.className ? el.className.split(' ').filter((c) => !c.startsWith('ag-card')).join('.') || 'ag-card' : el.tagName.toLowerCase());

  cards.forEach((card, i) => {
    const label = `card #${i + 1} (${name(card)})`;
    const cs = getComputedStyle(card);
    const r = card.getBoundingClientRect();
    const variant = ['list', 'flush', 'tint', 'scroll'].find((v) => card.classList.contains(`ag-card--${v}`)) || 'default';
    const pad = [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)];
    const expected = variant === 'list' ? [0, 16, 0, 16] : variant === 'flush' ? [0, 0, 0, 0] : [16, 16, 16, 16];
    // pages may widen the side padding of a tile grid (documented exception: 8px); only the vertical is checked there
    const sideOk = (a, b) => a === b || (name(card).includes('ag-menu') && a === 8);
    if (pad[0] !== expected[0] || pad[2] !== expected[2] || !sideOk(pad[1], expected[1]) || !sideOk(pad[3], expected[3])) {
      violations.push(`${label}: padding ${pad.join('/')} (expected ${expected.join('/')})`);
    }

    const kids = [...card.children].filter((k) => {
      const kr = k.getBoundingClientRect();
      return kr.height > 0 && getComputedStyle(k).position !== 'absolute';
    });
    if (!kids.length) return;
    const first = kids[0].getBoundingClientRect();
    const last = kids.reduce((m, k) => Math.max(m, k.getBoundingClientRect().bottom), -Infinity);
    if (variant !== 'flush' && variant !== 'list') {
      const top = Math.round(first.top - r.top);
      const bottom = Math.round(r.bottom - last);
      if (top !== pad[0]) violations.push(`${label}: content starts ${top}px from the top (padding ${pad[0]})`);
      if (bottom !== pad[2]) violations.push(`${label}: content ends ${bottom}px from the bottom (padding ${pad[2]})`);
    }

    // data-card-spacing="tight": a deliberate exception (the balance card: label, amount and footer sit close)
    const tight = card.dataset.cardSpacing === 'tight';
    const gap = px(cs.rowGap);
    if (!tight && variant !== 'flush' && variant !== 'list' && !card.classList.contains('ag-menu') && gap !== 12) {
      violations.push(`${label}: gap ${gap}px (expected 12, or mark the card data-card-spacing="tight")`);
    }

    kids.forEach((k) => {
      const ks = getComputedStyle(k);
      if (!tight && (px(ks.marginTop) !== 0 || px(ks.marginBottom) !== 0)) {
        violations.push(`${label}: child ${name(k)} has margin ${ks.marginTop}/${ks.marginBottom}`);
      }
    });

    const head = card.querySelector(':scope > .ag-card-head');
    if (head) {
      const hr = head.getBoundingClientRect();
      const title = head.querySelector('.ag-card-head__title');
      const meta = head.querySelector('.ag-card-head__meta');
      const textHeight = Math.round(title.getBoundingClientRect().height + (meta ? meta.getBoundingClientRect().height : 0));
      // the head may be taller only because the text is (a long title wraps); controls never add height
      if (Math.round(hr.height) > textHeight + 1) {
        violations.push(`${label}: head is ${Math.round(hr.height)}px but its text is ${textHeight}px (a control is making it taller)`);
      }
      const rightInset = Math.round(r.right - hr.right);
      if (rightInset !== pad[1] && variant !== 'flush') violations.push(`${label}: head ends ${rightInset}px from the right edge (padding ${pad[1]})`);
    }
  });

  return { url: location.pathname, cards: cards.length, violations };
})();
