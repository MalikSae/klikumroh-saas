const fs = require('fs');
const path = require('path');
const sharp = require('../web/node_modules/sharp');

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const dirEntrySize = 16;
  let offset = 6 + dirEntrySize * images.length;
  const entries = [];

  for (const img of images) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(img.buffer.length, 8); // bytes in res
    entry.writeUInt32LE(offset, 12); // image offset
    entries.push(entry);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((img) => img.buffer)]);
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const svgPath = path.join(rootDir, 'icon-klikumroh.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  console.log('Generating PNGs at multiple resolutions from icon-klikumroh.svg...');
  const [p16, p32, p48, p64, p180, p192, p512] = await Promise.all([
    sharp(svgBuffer).resize(16, 16).png().toBuffer(),
    sharp(svgBuffer).resize(32, 32).png().toBuffer(),
    sharp(svgBuffer).resize(48, 48).png().toBuffer(),
    sharp(svgBuffer).resize(64, 64).png().toBuffer(),
    sharp(svgBuffer).resize(180, 180).png().toBuffer(),
    sharp(svgBuffer).resize(192, 192).png().toBuffer(),
    sharp(svgBuffer).resize(512, 512).png().toBuffer(),
  ]);

  const icoBuffer = createIco([
    { width: 16, height: 16, buffer: p16 },
    { width: 32, height: 32, buffer: p32 },
    { width: 48, height: 48, buffer: p48 },
  ]);

  // Target 1: /web/public
  const webPublic = path.join(rootDir, 'web', 'public');
  fs.writeFileSync(path.join(webPublic, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(webPublic, 'favicon.png'), p32);
  fs.writeFileSync(path.join(webPublic, 'favicon.svg'), svgBuffer);
  fs.writeFileSync(path.join(webPublic, 'icon-klikumroh.svg'), svgBuffer);
  fs.writeFileSync(path.join(webPublic, 'apple-touch-icon.png'), p180);
  fs.writeFileSync(path.join(webPublic, 'icon-192x192.png'), p192);
  fs.writeFileSync(path.join(webPublic, 'icon-512x512.png'), p512);
  console.log('✓ Generated favicons in web/public');

  // Target 2: /dashboard/public
  const dashPublic = path.join(rootDir, 'dashboard', 'public');
  fs.writeFileSync(path.join(dashPublic, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(dashPublic, 'favicon.png'), p32);
  fs.writeFileSync(path.join(dashPublic, 'favicon.svg'), svgBuffer);
  fs.writeFileSync(path.join(dashPublic, 'icon-klikumroh.svg'), svgBuffer);
  fs.writeFileSync(path.join(dashPublic, 'favicon-16x16.png'), p16);
  fs.writeFileSync(path.join(dashPublic, 'favicon-32x32.png'), p32);
  fs.writeFileSync(path.join(dashPublic, 'favicon-48x48.png'), p48);
  fs.writeFileSync(path.join(dashPublic, 'favicon-64x64.png'), p64);
  fs.writeFileSync(path.join(dashPublic, 'favicon-192x192.png'), p192);
  fs.writeFileSync(path.join(dashPublic, 'favicon-512x512.png'), p512);
  console.log('✓ Generated favicons in dashboard/public');
}

main().catch((err) => {
  console.error('Failed to generate favicons:', err);
  process.exit(1);
});
