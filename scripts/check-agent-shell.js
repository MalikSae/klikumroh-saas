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
      if (!ALLOW_DIRS.has(rel) || !full.startsWith(path.join(rootDir, 'web', 'app', 'agen'))) walk(full, false);
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
    while ((m = re.exec(src))) {
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
    while ((m = re.exec(noComments))) {
      violations.push(`${rel}:${lineOf(noComments, m.index + m[1].length)}  own .${m[2]}-${m[3]}: the header and page area come from components/agent/AgentShell.css`);
    }
    const kf = /@keyframes\s+([a-z]{1,4})-spin\b/g;
    while ((m = kf.exec(noComments))) {
      violations.push(`${rel}:${lineOf(noComments, m.index)}  own spinner @keyframes ${m[1]}-spin: use the shared one`);
    }
  }
}

for (const t of targets) walk(t, true);

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
console.log('Agent Shell Lint Passed: no own header, page area or spinner in web/app/agen.');
