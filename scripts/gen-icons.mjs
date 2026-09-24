// One-off placeholder-icon generator. No external deps: hand-builds a
// minimal PNG (8-bit RGBA, zlib-deflated) so the repo has valid installable
// PWA icons without needing an image toolchain. Safe to delete once real
// artwork replaces the icons in /public/icons.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * @param {number} size
 * @param {(x: number, y: number) => [number, number, number, number]} paint RGBA 0-255 per pixel
 */
function makePng(size, paint) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y);
      const off = rowStart + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Dragonbound placeholder mark: deep navy background, a gold diamond
// "dragon eye" facet, and a thin ember-orange ring. Simple enough to
// rasterize by hand, distinctive enough to not look like a blank square.
const BG = [11, 15, 26];
const GOLD = [212, 168, 83];
const EMBER = [201, 92, 58];

function paintIcon(x, y, size, maskable) {
  const cx = size / 2;
  const cy = size / 2;
  const nx = (x - cx) / (size / 2);
  const ny = (y - cy) / (size / 2);
  const dist = Math.sqrt(nx * nx + ny * ny);
  const safe = maskable ? 0.8 : 1.0; // keep art inside the safe zone for maskable icons

  if (dist > safe) return [...BG, 255];

  // diamond "eye" facet
  const diamond = Math.abs(nx) * 1.15 + Math.abs(ny) * 1.6;
  if (diamond < 0.42) return [...GOLD, 255];

  // thin ember ring
  if (dist > safe - 0.06 && dist < safe) return [...EMBER, 255];

  return [...BG, 255];
}

mkdirSync(new URL('../public/icons', import.meta.url), { recursive: true });

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-512-maskable.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
  { name: 'favicon-32.png', size: 32, maskable: false },
];

for (const t of targets) {
  const png = makePng(t.size, (x, y) => paintIcon(x, y, t.size, t.maskable));
  writeFileSync(new URL(`../public/icons/${t.name}`, import.meta.url), png);
  console.log(`wrote public/icons/${t.name} (${t.size}x${t.size})`);
}
