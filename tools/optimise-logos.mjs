// Re-encode the logo PNGs as indexed-colour, and downscale the one still oversized.
//
//   npm run optimise-logos          report what it would do
//   npm run optimise-logos -- -w    write the files
//
// Runs when a logo changes, not on every deploy, and the files it produces are committed.
// That is what makes this a tool rather than a build step: what the domain serves is
// still the file in site/, which is what lets the gate validate the real bytes and the
// preview serve the real thing.
//
// Written against zlib and nothing else. A library would quantize better, but it would be
// installed by `npm ci` on every deploy to be used roughly never, and the project's one
// dependency is the schema validator the gate genuinely needs.
//
// Every logo here is 8-bit RGBA and non-interlaced, so there is one code path and no
// guessing. A file that is not gets skipped and said so.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'site/logos');
const write = process.argv.includes('-w') || process.argv.includes('--write');

/** The largest a logo is ever drawn is 48 CSS px, so 128 covers 2.7x density. */
const MAX_EDGE = 128;

// ---------------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Every chunk of a PNG, in order. */
function chunks(buf) {
  const out = [];
  let o = 8;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    out.push({ type, data: buf.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

/** Undo PNG's per-row filtering. `bpp` is bytes per pixel. */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;      // left
      const b = prev ? prev[i] : 0;               // up
      const c = prev && i >= bpp ? prev[i - bpp] : 0; // up-left
      let v = row[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        // Paeth: whichever of the three neighbours the gradient predicts.
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`unknown row filter ${filter}`);
      cur[i] = v & 0xff;
    }
  }
  return out;
}

/** Decode one 8-bit RGBA non-interlaced PNG into { width, height, pixels }. */
function decode(buf) {
  const cs = chunks(buf);
  const ihdr = cs.find(c => c.type === 'IHDR').data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8], colour = ihdr[9], interlace = ihdr[12];
  // Colour type 3 is this tool's own output, so meeting one means there is nothing left
  // to do rather than something it cannot read — running twice must not read as a fault.
  if (colour === 3) return { done: true };
  if (depth !== 8 || colour !== 6 || interlace !== 0) return null;
  const idat = Buffer.concat(cs.filter(c => c.type === 'IDAT').map(c => c.data));
  return { width, height, pixels: unfilter(inflateSync(idat), width, height, 4) };
}

/** Choose the row filter that leaves the least for deflate to do. */
function filterRows(indices, width, height) {
  const out = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = indices.subarray(y * width, (y + 1) * width);
    const prev = y ? indices.subarray((y - 1) * width, y * width) : null;

    // Only None and Up are worth trying on indexed data: the byte values are palette
    // positions, so arithmetic between horizontal neighbours means nothing, while a
    // vertical run of the same index is common and Up turns it into zeroes.
    const none = row;
    let best = 0, bestSum = none.reduce((s, v) => s + (v < 128 ? v : 256 - v), 0);
    let up = null;
    if (prev) {
      up = Buffer.alloc(width);
      let sum = 0;
      for (let i = 0; i < width; i++) {
        up[i] = (row[i] - prev[i]) & 0xff;
        sum += up[i] < 128 ? up[i] : 256 - up[i];
      }
      if (sum < bestSum) best = 2;
    }
    out[y * (width + 1)] = best;
    (best === 2 ? up : none).copy(out, y * (width + 1) + 1);
  }
  return out;
}

/** Encode an indexed PNG. `palette` is an array of [r,g,b,a]. */
function encodeIndexed(width, height, indices, palette) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 3;  // colour type: palette
  // 10, 11, 12 stay zero: deflate, adaptive filtering, no interlace.

  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach(([r, g, b], i) => { plte[i * 3] = r; plte[i * 3 + 1] = g; plte[i * 3 + 2] = b; });

  // tRNS carries one alpha byte per palette entry and may stop at the last one that is
  // not fully opaque, so an opaque logo pays nothing for it.
  let lastTransparent = -1;
  palette.forEach(([, , , a], i) => { if (a < 255) lastTransparent = i; });
  const trns = lastTransparent >= 0
    ? Buffer.from(palette.slice(0, lastTransparent + 1).map(([, , , a]) => a))
    : null;

  const idat = deflateSync(filterRows(indices, width, height), { level: 9 });

  // Colour-space chunks are dropped: browsers treat an untagged PNG as sRGB, which is
  // what these are, and the bytes are better spent on the image.
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    ...(trns ? [chunk('tRNS', trns)] : []),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------------
// Resize and quantize
// ---------------------------------------------------------------------------------

/**
 * Box-average downscale by an integer factor.
 *
 * Restricted to integer factors on purpose: every logo here is square or 2x an exact
 * target, so a box average is both correct and the best available filter, and refusing
 * the general case keeps a resampler out of this file.
 */
function halveBy(img, factor) {
  const w = Math.round(img.width / factor), h = Math.round(img.height / factor);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * img.width + (x * factor + dx)) * 4;
          const al = img.pixels[i + 3];
          // Weight colour by alpha so transparent pixels do not drag the edges toward
          // whatever colour happens to sit underneath them.
          r += img.pixels[i] * al; g += img.pixels[i + 1] * al; b += img.pixels[i + 2] * al;
          a += al; n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a / n);
    }
  }
  return { width: w, height: h, pixels: out };
}

/**
 * Median cut over RGBA.
 *
 * Alpha is quantized with the colour rather than separately, because a palette PNG has
 * one alpha per palette entry: an entry is an (r,g,b,a) quadruple or the transparency
 * does not survive.
 */
function quantize(img, max = 256) {
  const counts = new Map();
  for (let i = 0; i < img.pixels.length; i += 4) {
    // Fully transparent pixels have no colour worth keeping distinct.
    const key = img.pixels[i + 3] === 0
      ? 0
      : (img.pixels[i] << 24) | (img.pixels[i + 1] << 16) | (img.pixels[i + 2] << 8) | img.pixels[i + 3];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const colours = [...counts].map(([k, n]) => [
    (k >>> 24) & 0xff, (k >>> 16) & 0xff, (k >>> 8) & 0xff, k & 0xff, n,
  ]);

  let boxes = [colours];
  while (boxes.length < max) {
    // Split the box whose longest axis is longest, weighted by how many pixels it holds:
    // a wide box nobody looks at matters less than a narrow one covering half the image.
    let pick = -1, score = -1, axis = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let c = 0; c < 4; c++) {
        let lo = 255, hi = 0;
        for (const col of box) {
          if (col[c] < lo) lo = col[c];
          if (col[c] > hi) hi = col[c];
        }
        const weight = box.reduce((s, col) => s + col[4], 0);
        const s = (hi - lo) * Math.log2(1 + weight);
        if (s > score) { score = s; pick = i; axis = c; }
      }
    });
    if (pick < 0) break;
    const box = boxes[pick].slice().sort((a, b) => a[axis] - b[axis]);
    const half = Math.max(1, Math.floor(box.length / 2));
    boxes.splice(pick, 1, box.slice(0, half), box.slice(half));
  }

  const palette = boxes.filter(b => b.length).map(box => {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (const c of box) { r += c[0] * c[4]; g += c[1] * c[4]; b += c[2] * c[4]; a += c[3] * c[4]; n += c[4]; }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n)];
  });

  // Map every pixel to its nearest entry, and measure the damage while doing it.
  const indices = Buffer.alloc(img.width * img.height);
  let squared = 0;
  const cache = new Map();
  for (let p = 0; p < indices.length; p++) {
    const i = p * 4;
    const key = (img.pixels[i] << 24) | (img.pixels[i + 1] << 16) | (img.pixels[i + 2] << 8) | img.pixels[i + 3];
    let hit = cache.get(key);
    if (hit === undefined) {
      let best = 0, bestD = Infinity;
      for (let q = 0; q < palette.length; q++) {
        const dr = palette[q][0] - img.pixels[i], dg = palette[q][1] - img.pixels[i + 1];
        const db = palette[q][2] - img.pixels[i + 2], da = palette[q][3] - img.pixels[i + 3];
        // Alpha weighted heavily: a wrong edge opacity is far more visible than a
        // slightly wrong hue in the middle of a mark.
        const d = dr * dr + dg * dg + db * db + 3 * da * da;
        if (d < bestD) { bestD = d; best = q; }
      }
      hit = { index: best, error: bestD };
      cache.set(key, hit);
    }
    indices[p] = hit.index;
    squared += hit.error;
  }
  return { indices, palette, rmse: Math.sqrt(squared / (indices.length * 4)) };
}

// ---------------------------------------------------------------------------------

let changed = 0;
const rows = [];

for (const name of readdirSync(dir).filter(f => f.endsWith('.png')).sort()) {
  const path = join(dir, name);
  const before = statSync(path).size;
  const decoded = decode(readFileSync(path));
  if (decoded?.done) {
    rows.push(`${name.padEnd(18)} ${(before / 1024).toFixed(1).padStart(6)}KB   already indexed`);
    continue;
  }
  if (!decoded) {
    rows.push(`${name.padEnd(18)} skipped — not 8-bit RGBA, and this tool reads nothing else`);
    continue;
  }

  let img = decoded;
  let note = '';
  const factor = Math.round(Math.max(img.width, img.height) / MAX_EDGE);
  if (factor > 1) {
    img = halveBy(img, factor);
    note = ` resized ${decoded.width}x${decoded.height}→${img.width}x${img.height}`;
  }

  const { indices, palette, rmse } = quantize(img);
  const out = encodeIndexed(img.width, img.height, indices, palette);

  // Never write a bigger file. A logo already smaller than anything this produces has
  // nothing to gain, and saying so is more useful than a silent no-op.
  if (out.length >= before && factor === 1) {
    rows.push(`${name.padEnd(18)} kept    ${(before / 1024).toFixed(1)}KB — re-encoding gains nothing`);
    continue;
  }

  if (write) writeFileSync(path, out);
  changed++;
  rows.push(
    `${name.padEnd(18)} ${(before / 1024).toFixed(1).padStart(6)}KB → ${(out.length / 1024).toFixed(1).padStart(5)}KB  ` +
    `${palette.length} colours, rmse ${rmse.toFixed(2)}${note}`
  );
}

console.log(rows.join('\n'));
console.log(
  write
    ? `\n${changed} file(s) written. Update width/height in the catalogue for anything resized, then run npm run validate.`
    : `\n${changed} file(s) would change. Pass -w to write them.`
);
