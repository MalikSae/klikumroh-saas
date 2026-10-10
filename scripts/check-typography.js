// Typography lint for the web app (design-tokens.json > typography is the source of truth).
//
// Zones and rules:
//   strict zone  web/components/agent/*.css and web/components/AgentBottomNavbar.css
//       No literal font sizes. Use a role (font: var(--tw-type-row-title)) or a scale size (var(--tw-fs-lg)).
//   scale zone   web/app/agen/**/*.css
//       A literal font size must be on the scale (typography.fontSize). New work should still prefer a role.
//   everywhere in both zones
//       No size below the minimum (10px, founder decision 11 Okt 2026), only the weights of typography.fontWeight (400, 600, 700).
//   web/app/typography.css must be up to date with design-tokens.json (run scripts/build-type-tokens.js).
//
// Usage: node scripts/check-typography.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'design-tokens.json'), 'utf8'));
const scale = new Set(Object.entries(tokens.typography.fontSize).filter(([k]) => !k.startsWith('_')).map(([, v]) => parseFloat(v)));
const MIN = Math.min(...scale);
const weights = new Set(Object.entries(tokens.typography.fontWeight).filter(([k]) => !k.startsWith('_')).map(([, v]) => v));

const violations = [];
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

function walk(dir, fn, filter) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, fn, filter);
    else if (filter(e.name)) fn(full);
  }
}

function check(file, strict) {
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const text = src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const rel = path.relative(root, file).replace(/\\/g, '/');
  let m;
  // font-size: 13px   and   font: 600 13px/1.4 family
  const sizeRe = /font-size:\s*([0-9.]+)px|font:\s*[^;{}]*?\b([0-9.]+)px/g;
  while ((m = sizeRe.exec(text))) {
    const px = parseFloat(m[1] || m[2]);
    const at = `${rel}:${lineOf(text, m.index)}`;
    if (px < MIN) violations.push(`${at}  ${px}px is below the minimum of ${MIN}px`);
    else if (strict) violations.push(`${at}  literal ${px}px: use a role (var(--tw-type-*)) or a scale size (var(--tw-fs-*))`);
    else if (!scale.has(px)) violations.push(`${at}  ${px}px is not on the scale (${[...scale].join(', ')})`);
  }
  const weightRe = /font-weight:\s*([0-9]{3})\b|font:\s*([0-9]{3})\b/g;
  while ((m = weightRe.exec(text))) {
    const w = m[1] || m[2];
    if (!weights.has(w)) {
      violations.push(`${rel}:${lineOf(text, m.index)}  font-weight ${w} is not allowed (${[...weights].join(", ")} only)`);
    }
  }
}

walk(path.join(root, 'web', 'components', 'agent'), (f) => check(f, true), (n) => n.endsWith('.css'));
walk(path.join(root, 'web', 'app', 'agen'), (f) => check(f, false), (n) => n.endsWith('.css'));
// The portal's bottom tab bar lives outside both folders but is part of the portal.
check(path.join(root, 'web', 'components', 'AgentBottomNavbar.css'), true);

const gen = spawnSync(process.execPath, [path.join(__dirname, 'build-type-tokens.js'), '--check'], { encoding: 'utf8' });
if (gen.status !== 0) violations.push((gen.stderr || gen.stdout || 'typography.css is out of date').trim());

if (violations.length > 0) {
  console.error('Typography violations:\n');
  for (const v of violations) console.error('  ' + v);
  console.error(`\n${violations.length} violation(s). Roles live in design-tokens.json > typography.roles.`);
  process.exit(1);
}
console.log('Typography Lint Passed: scale, minimum size and weights are respected; typography.css is current.');
