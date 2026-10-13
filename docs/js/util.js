// Small helpers shared by every module.
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());
export const parseYmd = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);

// Polish dates
const fmtLong = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });
export const dateLong = (s) => (s ? fmtLong.format(typeof s === 'string' ? parseYmd(s) : new Date(s)) : '');
export const dateShort = (s) => (s ? fmtShort.format(typeof s === 'string' ? parseYmd(s) : new Date(s)) : '');
export const timeOf = (ts) => fmtTime.format(new Date(ts));

/** Polish plural: pl(5, 'książka', 'książki', 'książek') → 'książek'. */
export function pl(n, one, few, many) {
  n = Math.abs(Math.trunc(Number(n) || 0));
  if (n === 1) return one;
  const d = n % 10, t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}
/** "5 książek" */
export const plN = (n, one, few, many) => `${n} ${pl(n, one, few, many)}`;

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

/** Normalise for search / fuzzy matching: lowercase, no diacritics, single spaces. */
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Only digits/X of an ISBN, '' when not plausible. Converts ISBN-10 → ISBN-13. */
export function cleanIsbn(s) {
  const raw = String(s ?? '').toUpperCase().replace(/[^0-9X]/g, '');
  if (raw.length === 13) return raw;
  if (raw.length === 10) {
    const core = '978' + raw.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
    return core + ((10 - (sum % 10)) % 10);
  }
  return '';
}

/** 32-bit string hash (FNV-1a) — used to pick a jacket design per title. */
export function hash(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const blobToDataUrl = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
export const dataUrlToBlob = async (url) => (await fetch(url)).blob();

/** Downscale a photo (File/Blob) to a JPEG blob no wider than `max` px. */
export async function shrinkImage(file, max = 900, quality = 0.85) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', quality));
}
