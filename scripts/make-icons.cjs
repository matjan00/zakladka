// Generates the app icons (PNG) with no dependencies: node scripts/make-icons.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const out = path.join(__dirname, '..', 'docs', 'icons');

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Design: near-black rounded square, a coral progress ring (3/4 arc, round caps) with a dot in the middle.

// Design: deep bookcloth-green square, two thin gilt bands (like a cloth spine), and a vermilion silk ribbon
// bookmark hanging from the top edge with a forked (V-notch) end.
const CLOTH = [31, 74, 64], GILT = [201, 165, 90], RIBBON = [194, 62, 40], SHADE = [22, 54, 47];
function make(size, { maskable, rounded }) {
  const SS = 4;
  return png(size, (px, py) => {
    let rr = 0, gg = 0, bb = 0, aa = 0;
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size; // 0..1
        const cx = x - 0.5, cy = y - 0.5;
        const rad = 0.2, ax = Math.abs(cx) - (0.5 - rad), ay = Math.abs(cy) - (0.5 - rad);
        const inside = !rounded || (ax <= 0 || ay <= 0 ? true : Math.hypot(ax, ay) <= rad);
        if (!inside) continue;
        let col = CLOTH;
        // content box: maskable keeps everything inside the 80% safe circle
        const k = maskable ? 0.62 : 0.8, ox = (1 - k) / 2;
        const u = (x - ox) / k, v = (y - ox) / k; // 0..1 inside content box
        // gilt bands (horizontal), across the whole width like a spine
        const band = (c, h) => Math.abs(y - (ox + c * k)) <= h * k;
        if (band(0.16, 0.012) || band(0.205, 0.006)) col = GILT;
        if (band(0.84, 0.012) || band(0.795, 0.006)) col = GILT;
        // ribbon: from the very top edge down to v=0.78, between u 0.52..0.70, V-notch at the end
        const left = 0.53, right = 0.71, mid = (left + right) / 2, end = 0.76, notch = 0.085;
        if (u >= left && u <= right && y >= 0 && v <= end + notch) {
          const depth = end + notch - (Math.abs(u - mid) / ((right - left) / 2)) * notch; // V cut: centre is shortest
          const vEdge = end + (Math.abs(u - mid) / ((right - left) / 2)) * notch;
          if (v <= vEdge) col = u < left + 0.022 ? [168, 52, 34] : RIBBON;
        }
        // soft shadow to the right of the ribbon
        if (col === CLOTH && u > 0.71 && u < 0.745 && v < 0.8) col = SHADE;
        rr += col[0]; gg += col[1]; bb += col[2]; aa += 255;
      }
    const n = SS * SS;
    const a = aa / n;
    return a ? [Math.round(rr / (a / 255 * n)), Math.round(gg / (a / 255 * n)), Math.round(bb / (a / 255 * n)), Math.round(a)] : [0, 0, 0, 0];
  });
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), make(192, { rounded: true }));
fs.writeFileSync(path.join(out, 'icon-512.png'), make(512, { rounded: true }));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), make(512, { maskable: true, rounded: false }));
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), make(180, { rounded: false }));
console.log('icons written');
