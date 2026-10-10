// Guards the shell of the agent portal (web/app/agen) and the sub-page header of the travel's public site
// (web/components): one header, one page area, no copies.
//
// Why: every page used to draw its own <header> with its own CSS, and the copies drifted (back arrow 22 to
// 34px from the edge, back button 36 or 44px, titles at 16/44/52/56px, seven spinners). The shell now lives in
// web/components/agent (AgentPageHeader, AgentPage, AgentShell.css). This script fails when a page goes back
// to drawing its own, so the drift cannot return unnoticed.
//
// Rules, for every .tsx / .css under web/app/agen:
//   1. No <header> element in a page. Use <AgentPageHeader title=... onBack=... />.
//      (The brand band of the home page is the AgentHeader component, which is not a <header> tag here.)
//   2. No header or page-area class of its own in CSS: .xx-header, .xx-header__title, .xx-page.
//      Use components/agent/AgentShell.css; page-specific parts keep their own class names.
//   3. No own spinner keyframes (@keyframes xx-spin): reuse the shared one.
//   4. No buttons inside AgentPageHeader (it has no actions slot; the controls belong in the page content).
//   6. No own loading/error/empty block in CSS: .xx-state, .xx-center, .xx-empty. Use components/agent/AgentState.
//   7. No own button class in CSS: .xx-btn. Use <AgentButton variant size> (components/agent/AgentButton).
//   5. No PublicHeader (the public site's header) in the agent portal: login, sign-up and status are portal
//      pages too and use AgentPageHeader.
//
// Usage: node scripts/check-agent-shell.js            (scans web/app/agen)
//        node scripts/check-agent-shell.js some/dir   (scans the given folders instead)

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const targets = args.length > 0 ? args.map((a) => path.resolve(process.cwd(), a)) : [path.join(rootDir, 'web', 'app', 'agen')];

// Pages that legitimately keep a different top area:
//  - dashboard: the brand band (AgentHeader component), not a page header.
const ALLOW_DIRS = new Set(['dashboard']);

const violations = [];

function walk(dir, topLevel) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      const rel = path.relative(path.join(rootDir, 'web', 'app', 'agen'), full).split(path.sep)[0];
      walk(full, false);
      continue;
    }
    if (/\.(tsx|css)$/.test(entry.name)) check(full);
  }
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

function check(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(rootDir, file).replace(/\\/g, '/');

  if (file.endsWith('.tsx')) {
    const re = /<header\b/g;
    let m;
    const headerAllowed = ALLOW_DIRS.has(path.relative(path.join(rootDir, 'web', 'app', 'agen'), file).split(path.sep)[0]);
    while (!headerAllowed && (m = re.exec(src))) {
      violations.push(`${rel}:${lineOf(src, m.index)}  own <header>: use <AgentPageHeader title=... onBack=... />`);
    }
    const pub = /import\s*\{[^}]*\bPublicHeader\b[^}]*\}\s*from/g;
    while ((m = pub.exec(src))) {
      violations.push(`${rel}:${lineOf(src, m.index)}  PublicHeader is the public site's header: use <AgentPageHeader title=... onBack=... />`);
    }
    // actions on the shared header
    const hdr = /<AgentPageHeader\b[^>]*\bactions=/g;
    while ((m = hdr.exec(src))) {
      violations.push(`${rel}:${lineOf(src, m.index)}  AgentPageHeader has no actions: put the control in the page content`);
    }
  } else {
    const noComments = src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    const re = /(^|[\s,}])\.([a-z]{1,4})-(header|header__title|page)\s*[,{]/g;
    let m;
    // the home page keeps its brand band: its own header classes are allowed there
    const bandAllowed = ALLOW_DIRS.has(path.relative(path.join(rootDir, 'web', 'app', 'agen'), file).split(path.sep)[0]);
    while (!bandAllowed && (m = re.exec(noComments))) {
      violations.push(`${rel}:${lineOf(noComments, m.index + m[1].length)}  own .${m[2]}-${m[3]}: the header and page area come from components/agent/AgentShell.css`);
    }
    const st = /(^|[\s,}])\.([a-z]{1,4})-(state|center|empty)(--[\w-]+)?\s*[,{]/g;
    while ((m = st.exec(noComments))) {
      violations.push(`${rel}:${lineOf(noComments, m.index + m[1].length)}  own .${m[2]}-${m[3]}: loading, error and empty blocks come from components/agent/AgentState`);
    }
    const bt = /(^|[\s,}])\.([a-z]{1,4})-btn(--[\w-]+)?\s*[,{:]/g;
    while ((m = bt.exec(noComments))) {
      violations.push(`${rel}:${lineOf(noComments, m.index + m[1].length)}  own .${m[2]}-btn: buttons come from components/agent/AgentButton`);
    }
    const widgets =
      /(^|[\s,}])\.([a-z]{1,4})-(search|search__input|search__clear|search__icon|chips|chip|chip--active|chip--on|pager|pager__btn|pager__info|sheet|sheet__panel|sheet__grip|sheet__head)\s*[,{:]/g;
    while ((m = widgets.exec(noComments))) {
      violations.push(
        `${rel}:${lineOf(noComments, m.index + m[1].length)}  own .${m[2]}-${m[3]}: use AgentSearch, AgentChips, AgentPager or AgentSheet`
      );
    }
    // A card surface (radius or shadow) on a page class named *-card or *-panel: use <AgentCard>.
    const rules = /(^|\n)([^{}\n][^{}]*)\{([^{}]*)\}/g;
    while ((m = rules.exec(noComments))) {
      const sel = m[2].trim();
      if (!/(^|[\s,])\.[a-z]{1,4}-(card|panel)\s*(,|$)/.test(sel)) continue;
      if (/border-radius|box-shadow/.test(m[3])) {
        violations.push(`${rel}:${lineOf(noComments, m.index + m[1].length)}  card surface on ${sel}: use <AgentCard> (components/agent/AgentCard)`);
      }
    }
    const heads = /(^|[\s,}])\.[a-z]{1,4}-(card|panel)__(head|titles?|toggle)\s*[,{:]/g;
    while ((m = heads.exec(noComments))) {
      violations.push(`${rel}:${lineOf(noComments, m.index + m[1].length)}  own card head: use <AgentCardHead> (components/agent/AgentCardHead)`);
    }
    const kf = /@keyframes\s+([a-z]{1,4})-spin\b/g;
    while ((m = kf.exec(noComments))) {
      violations.push(`${rel}:${lineOf(noComments, m.index)}  own spinner @keyframes ${m[1]}-spin: use the shared one`);
    }
  }
}

for (const t of targets) walk(t, true);

// Margins inside a card: a class used inside an <AgentCard> must not carry margin-top/margin-bottom or a negative
// margin of its own. The card spaces its children with its 12px gap; a pair that must sit closer is wrapped in an
// element with its own gap. A deliberate exception takes the comment  /* card-margin-ok: reason */  on the line.
function collectCardClasses(src) {
  const classes = new Set();
  const open = /<AgentCard\b/g;
  let m;
  while ((m = open.exec(src))) {
    // balanced end of this AgentCard element
    const tag = /<AgentCard\b|<\/AgentCard>/g;
    tag.lastIndex = m.index + 1;
    let depth = 1, t, end = -1;
    while ((t = tag.exec(src))) {
      if (t[0].startsWith('</')) {
        depth--;
        if (depth === 0) { end = t.index; break; }
      } else depth++;
    }
    if (end < 0) continue;
    // the attributes of the opening tag are the card's own (its className is the card, not a child)
    let braces = 0;
    let bodyStart = m.index;
    for (; bodyStart < end; bodyStart++) {
      const ch = src[bodyStart];
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '>' && braces === 0) break;
    }
    for (const cn of src.slice(bodyStart, end).matchAll(/className=(?:"([^"]+)"|\{\`([^\`]+)\`\})/g)) {
      for (const tok of (cn[1] || cn[2]).split(/\s+/)) {
        if (/^[a-z0-9_-]+$/i.test(tok)) classes.add(tok);
      }
    }
  }
  return classes;
}

function cardMarginCheck(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  const tsx = files.filter((e) => e.isFile() && e.name.endsWith('.tsx'));
  const css = files.filter((e) => e.isFile() && e.name.endsWith('.css'));
  if (tsx.length && css.length) {
    const used = new Set();
    for (const e of tsx) collectCardClasses(fs.readFileSync(path.join(dir, e.name), 'utf8')).forEach((k) => used.add(k));
    for (const e of css) {
      const file = path.join(dir, e.name);
      const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      const rel = path.relative(rootDir, file).replace(/\\/g, '/');
      const rules = /([^{}]+)\{([^{}]*)\}/g;
      let r;
      while ((r = rules.exec(text))) {
        const sels = r[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((x) => x.trim());
        const hit = sels.find((s) => /^\.([a-z0-9_-]+)$/i.test(s) && used.has(s.slice(1)));
        if (!hit) continue;
        for (const d of r[2].split(';')) {
          const mm = d.match(/^\s*(margin(?:-top|-bottom|-block)?)\s*:\s*([^;]+)$/);
          if (!mm || /card-margin-ok/.test(d)) continue;
          const v = mm[2].trim();
          const risky = mm[1] !== 'margin' ? !/^0(px)?$/.test(v) : /(^|\s)-/.test(v) || /^(?!0(px)?(\s+0(px)?)*$)[^\s]+(\s+(?!0)[^\s]+){0,3}$/.test(v) && v.split(/\s+/).some((p, i, a) => (a.length === 1 ? i === 0 : i === 0 || (a.length === 3 && i === 2) || (a.length === 4 && (i === 0 || i === 2))) && !/^0(px)?$/.test(p) && !/auto/.test(p));
          if (risky) {
            const line = text.slice(0, r.index + r[0].indexOf(d)).split('\n').length;
            violations.push(`${rel}:${line}  ${hit} is inside an AgentCard and sets ${d.trim()}: the card gap spaces children (or add /* card-margin-ok: reason */)`);
          }
        }
      }
    }
  }
  for (const e of files) if (e.isDirectory() && e.name !== 'node_modules') cardMarginCheck(path.join(dir, e.name));
}
if (args.length === 0) cardMarginCheck(path.join(rootDir, 'web', 'app', 'agen'));

// Public travel site: the root-level components of web/components are its pages (catalogue, package detail, ...).
// Their sub-page header is PublicPageHeader. Allowed own <header>: the brand header of the home page
// (components/home), the shell components themselves, and the platform's marketing/checkout views (not travel pages).
if (args.length === 0) {
  const compDir = path.join(rootDir, 'web', 'components');
  const allowedFiles = new Set(['PublicPageHeader.tsx']);
  for (const entry of fs.existsSync(compDir) ? fs.readdirSync(compDir, { withFileTypes: true }) : []) {
    if (!entry.isFile() || !entry.name.endsWith('.tsx') || allowedFiles.has(entry.name)) continue;
    const full = path.join(compDir, entry.name);
    const src = fs.readFileSync(full, 'utf8');
    const rel = path.relative(rootDir, full).replace(/\\/g, '/');
    const re = /<header\b/g;
    let m;
    while ((m = re.exec(src))) {
      violations.push(`${rel}:${lineOf(src, m.index)}  own <header> on the public travel site: use <PublicPageHeader title=... onBack=... />`);
    }
    if (/import\s*\{[^}]*\bPublicHeader\b[^}]*\}\s*from/.test(src)) {
      violations.push(`${rel}  PublicHeader was removed: use <PublicPageHeader title=... onBack=... />`);
    }
  }
}

if (violations.length > 0) {
  console.error('Agent portal shell violations:\n');
  for (const v of violations) console.error('  ' + v);
  console.error(`\n${violations.length} violation(s). See web/components/agent/AgentShell.css for the standard.`);
  process.exit(1);
}
console.log('Agent Shell Lint Passed: no own header, page area, spinner, state block or button in web/app/agen.');
