const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let targetDirs = [];

const rootDir = path.resolve(__dirname, '..');

if (args.length > 0) {
  targetDirs = args.map((arg) => path.resolve(process.cwd(), arg));
} else {
  targetDirs = [
    path.join(rootDir, 'components'),
    path.join(rootDir, 'app'),
  ];
}

// Regex matching emoji and geometric/arrow symbols misused as icons
const EMOJI_SYMBOL_REGEX = /[\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2600}-\u{27BF}\u{1F300}-\u{1FAFF}]/gu;

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
      if (ext === '.tsx') {
        checkFile(fullPath);
      }
    }
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, lineIndex) => {
    EMOJI_SYMBOL_REGEX.lastIndex = 0;
    
    const matches = line.match(EMOJI_SYMBOL_REGEX);
    if (matches) {
      matches.forEach((char) => {
        const hexCode = 'U+' + char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        violations.push({
          file: filePath,
          line: lineIndex + 1,
          char: char,
          hexCode: hexCode,
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
  console.error('\n❌ EMOJI / UNICODE SYMBOL VIOLATIONS FOUND:');
  console.error('AGENTS.md Section 3.4 forbids using emojis or unicode symbols as icons/placeholders.');
  console.error('Please use `lucide-react` icons instead.\n');
  
  violations.forEach((v) => {
    console.error(`  - [${v.hexCode} '${v.char}'] ${path.relative(rootDir, v.file)}:${v.line}`);
    console.error(`    Line: ${v.snippet}`);
  });
  
  console.error(`\nTotal violations: ${violations.length}\n`);
  process.exit(1);
} else {
  console.log('✅ No-Emoji Lint Passed: 0 emoji or unicode symbols found in marketing TSX files.');
  process.exit(0);
}
