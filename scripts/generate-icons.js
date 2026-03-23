#!/usr/bin/env node
// Generates placeholder PNG icons for the extension.
// Run with: node scripts/generate-icons.js
// Replace icons/ with real artwork before publishing.

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ─── CRC32 ───────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, "ascii");
  return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]);
}

// ─── PNG builder ─────────────────────────────────────────────────────────────

/**
 * pixels: Uint8Array of length size*size*3 (RGB, row-major)
 */
function buildPNG(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = pngChunk(
    "IHDR",
    Buffer.concat([u32(size), u32(size), Buffer.from([8, 2, 0, 0, 0])])
  );

  // Prepend filter byte 0 (None) to each row
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0;
    pixels.copy(raw, y * (1 + size * 3) + 1, y * size * 3, (y + 1) * size * 3);
  }

  const idat = pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 }));
  const iend = pngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ─── Icon drawing ─────────────────────────────────────────────────────────────

// Brand colors
const BG  = [79, 70, 229];   // #4F46E5 indigo
const FG  = [255, 255, 255]; // white

// Pixel-art "R" glyph (7 wide × 9 tall)
const R_GLYPH = [
  [1,1,1,1,0,0,0],
  [1,0,0,0,1,0,0],
  [1,0,0,0,1,0,0],
  [1,1,1,1,0,0,0],
  [1,0,1,0,0,0,0],
  [1,0,0,1,0,0,0],
  [1,0,0,0,1,0,0],
  [0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0],
];

const GLYPH_W = 7;
const GLYPH_H = 9;

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 3);

  // Fill background
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3]     = BG[0];
    pixels[i * 3 + 1] = BG[1];
    pixels[i * 3 + 2] = BG[2];
  }

  if (size < 16) return pixels; // too small to draw glyph

  // Scale glyph to fit within ~60% of icon height, minimum 1px per glyph pixel
  const scale = Math.max(1, Math.floor((size * 0.6) / GLYPH_H));
  const glyphW = GLYPH_W * scale;
  const glyphH = GLYPH_H * scale;
  const offX = Math.floor((size - glyphW) / 2);
  const offY = Math.floor((size - glyphH) / 2);

  for (let gy = 0; gy < GLYPH_H; gy++) {
    for (let gx = 0; gx < GLYPH_W; gx++) {
      if (!R_GLYPH[gy][gx]) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = offX + gx * scale + sx;
          const py = offY + gy * scale + sy;
          if (px < 0 || px >= size || py < 0 || py >= size) continue;
          const idx = (py * size + px) * 3;
          pixels[idx]     = FG[0];
          pixels[idx + 1] = FG[1];
          pixels[idx + 2] = FG[2];
        }
      }
    }
  }

  return pixels;
}

// ─── Generate & write ─────────────────────────────────────────────────────────

const iconsDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const pixels = drawIcon(size);
  const png = buildPNG(size, pixels);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}
