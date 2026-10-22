const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const publicRoot = path.resolve(__dirname, '../public');
  // The approved Superdesign vector is the only source of the mark's geometry.
  const source = await fs.readFile(path.join(publicRoot, 'brand/qarzhy-focus.svg'), 'utf8');
  const mark = source.replace(/^<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    .replace(/<title>[\s\S]*?<\/title>/, '').replace(/#b5f36b/gi, '#08110f');
  const tile = rounded => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>Qarzhy — Фокус</title><rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="#b5f36b"/><g transform="translate(117.76 117.76) scale(2.7648)">${mark}</g></svg>`);
  // The whole mark fits inside the central 80% safe circle for adaptive masks.
  // Installable PNGs have an opaque square background; the OS owns its mask.
  await Promise.all([
    fs.writeFile(path.join(publicRoot, 'brand/qarzhy-focus-icon.svg'), tile(true)),
    ...[192, 512].map(size => sharp(tile(false)).resize(size, size).png().toFile(path.join(publicRoot, `icon-${size}.png`))),
    sharp(tile(false)).resize(180, 180).png().toFile(path.join(publicRoot, 'apple-touch-icon.png')),
    sharp(tile(true)).resize(32, 32).png().toFile(path.join(publicRoot, 'favicon-32.png')),
  ]);
  process.stdout.write('Generated Qarzhy Focus icons: SVG, 32, 180, 192 and 512 px.\n');
}

main().catch(error => {console.error(error.message); process.exitCode = 1;});
