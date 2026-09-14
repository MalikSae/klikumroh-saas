const fs = require('fs');
const path = require('path');

// Determine directories to scan
const args = process.argv.slice(2);
let targetDirs = [];

if (args.length > 0) {
  targetDirs = args.map((arg) => path.resolve(process.cwd(), arg));
} else {
  // Default to scanning both component folders from workspace root
  const rootDir = path.resolve(__dirname, '..');
  targetDirs = [
    path.join(rootDir, 'dashboard', 'src', 'components'),
    path.join(rootDir, 'web', 'components'),
  ];
}

const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_COLOR_REGEX = /rgba?\s*\([^)]*\)/gi;

const IGNORED_FILES = ['index.css', 'globals.css'];

let violations = [];

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (['.tsx', '.ts', '.css'].includes(ext) && !IGNORED_FILES.includes(entry.name)) {
        checkFile(fullPath);
      }
    }
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, lineIndex) => {
    // Skip single-line comments in css or tsx if they are explanation
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      return;
    }

    const hexMatches = line.match(HEX_COLOR_REGEX);
    if (hexMatches) {
      hexMatches.forEach((match) => {
        violations.push({
          file: filePath,
          line: lineIndex + 1,
          type: 'HEX Color',
          value: match,
          snippet: line.trim(),
        });
      });
    }

    const rgbMatches = line.match(RGB_COLOR_REGEX);
    if (rgbMatches) {
      rgbMatches.forEach((match) => {
        violations.push({
          file: filePath,
          line: lineIndex + 1,
          type: 'RGB/RGBA Color',
          value: match,
          snippet: line.trim(),
        });
      });
    }
  });
}

for (const dir of targetDirs) {
  scanDirectory(dir);
}

if (violations.length > 0) {
  console.error('\n❌ HARDCODED COLOR VIOLATIONS FOUND:');
  console.error('All component styling MUST use CSS tokens (var(--db-*) or var(--tw-*)).\n');
  violations.forEach((v) => {
    console.error(`  - [${v.type}] ${path.relative(process.cwd(), v.file)}:${v.line}`);
    console.error(`    Found: "${v.value}" in -> ${v.snippet}`);
  });
  console.error(`\nTotal violations: ${violations.length}\n`);
  process.exit(1);
} else {
  console.log('✅ Token Lint Passed: 0 hardcoded colors found in components.');
  process.exit(0);
}
