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

// Design (Czytelnia): a mahogany panel, a green-glass banker's lamp with a brass rim and stem,
// its warm light falling onto a green leather desk edged in brass.
const MAH = [74, 35, 23], MAH_D = [46, 20, 12], BRASS = [169, 133, 63], BRASS_HI = [222, 192, 122], GLOW = [244, 213, 138];
const DESK = [35, 64, 46];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
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
        // content box: maskable keeps everything inside the 80% safe circle
        const k = maskable ? 0.66 : 0.86, ox = (1 - k) / 2;
        const u = (x - ox) / k, v = (y - ox) / k;
        // wall: mahogany with a soft vertical shading and fine grain
        let col = mix(MAH, MAH_D, Math.min(1, Math.abs(cx) * 1.6));
        if (Math.sin(y * 210 + Math.sin(x * 9) * 2) > 0.92) col = mix(col, MAH_D, 0.35);
        // desk: green leather across the bottom, brass edge on top of it
        const deskTop = ox + 0.8 * k;
        if (y >= deskTop + 0.018 * k) col = mix(DESK, [17, 36, 26], (y - deskTop) * 3);
        else if (y >= deskTop) col = BRASS;
        // light cone from the shade down to the desk
        const rimV = 0.44, half = 0.4 + (v - rimV) * 0.5;
        if (v > rimV && Math.abs(u - 0.5) < half && y < deskTop + 0.2 * k) {
          const t = Math.max(0, 1 - (v - rimV) / 0.6) * (1 - Math.abs(u - 0.5) / half);
          col = mix(col, GLOW, 0.42 * t + (y >= deskTop ? 0.12 * (1 - Math.abs(u - 0.5) * 2) : 0));
        }
        // brass column and foot standing on the desk
        if (Math.abs(u - 0.5) < 0.026 && v > rimV && v < 0.8) col = mix(BRASS_HI, BRASS, Math.abs(u - 0.5) / 0.026);
        const fx = (u - 0.5) / 0.2, fy = (v - 0.8) / 0.045;
        if (fx * fx + fy * fy <= 1 && v <= 0.82) col = fy < -0.3 ? BRASS_HI : BRASS;
        // green glass shade: a long, low half-cylinder seen from the front
        const ex = (u - 0.5) / 0.44, ey = (v - rimV) / 0.24;
        if (v <= rimV && ex * ex + ey * ey <= 1) {
          const t = (v - (rimV - 0.24)) / 0.24; // 0 top .. 1 rim
          col = t < 0.5 ? mix([77, 178, 126], [30, 106, 68], t * 2) : mix([30, 106, 68], [12, 58, 35], (t - 0.5) * 2);
          const hx = (u - 0.38) / 0.22, hy = (v - (rimV - 0.15)) / 0.035;
          const h = 1 - (hx * hx + hy * hy);
          if (h > 0) col = mix(col, [200, 244, 218], 0.5 * Math.min(1, h * 2));
        }
        // brass rim
        if (Math.abs(u - 0.5) <= 0.46 && v > rimV - 0.012 && v < rimV + 0.03) col = v < rimV + 0.008 ? BRASS_HI : BRASS;
        // pull chain
        if (Math.abs(u - 0.74) < 0.006 && v > rimV + 0.03 && v < rimV + 0.15 && Math.floor(v * 140) % 2 === 0) col = BRASS_HI;
        if (Math.hypot(u - 0.74, v - (rimV + 0.16)) < 0.014) col = BRASS;
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
// favicon.ico: one 32×32 PNG wrapped in an ICO header
const fav = make(32, { rounded: true });
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head[6] = 32; head[7] = 32; head[8] = 0; head[9] = 0; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(fav.length, 14); head.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(out, '..', 'favicon.ico'), Buffer.concat([head, fav]));
console.log('icons written');
