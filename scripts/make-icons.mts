// Draws the Convert mark and writes build/icon.png and build/icon.ico. Run: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { logoSvg } from '../src/shared/logo.ts';

const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function png(size: number): Promise<Buffer> {
  // A rounded dark tile behind the ring keeps the mark readable on any taskbar colour.
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#14151A"/></svg>`;
  const ring = await sharp(Buffer.from(logoSvg(size, '#7C5CFF')))
    .resize(Math.round(size * 0.82))
    .png()
    .toBuffer();
  return sharp(Buffer.from(tile))
    .composite([{ input: ring, gravity: 'center' }])
    .png()
    .toBuffer();
}

/** An ICO file is a small header plus PNG images, which Windows has supported since Vista. */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

mkdirSync('build', { recursive: true });
const images = await Promise.all(SIZES.map(async (size) => ({ size, data: await png(size) })));
writeFileSync('build/icon.ico', ico(images));
writeFileSync('build/icon.png', await png(512));
console.log('wrote build/icon.ico and build/icon.png');
