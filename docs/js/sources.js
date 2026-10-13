// Book metadata lookup: Open Library (direct, CORS) + Biblioteka Narodowa (through the books-proxy).
// search(q) → merged, de-duplicated candidates:
//   { title, author, isbn, pages, year, genre, subjects:[], coverUrl, source: 'bn'|'ol'|'bn+ol', publisher }
// Also: byIsbn(isbn), libraryCheck(phrase) for the Nekla catalogue (needs the proxy), coverForIsbn(isbn).
import { PROXY_URL, sowaSearchUrl } from './config.js';
import { cleanIsbn, norm } from './util.js';

const OL_FIELDS = 'title,author_name,isbn,cover_i,number_of_pages_median,first_publish_year,subject,publisher';
export const hasProxy = () => !!PROXY_URL;

function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}
async function getJson(url, ms = 9000) {
  const t = withTimeout(ms);
  try {
    const r = await fetch(url, { signal: t.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    t.done();
  }
}

export const olCover = (b) =>
  b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : b.isbn ? `https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg` : '';
export const coverForIsbn = (isbn) => (cleanIsbn(isbn) ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn(isbn)}-M.jpg` : '');

// ---------- Open Library ----------
function fromOl(d) {
  const isbns = (d.isbn || []).map(cleanIsbn).filter(Boolean);
  // prefer a Polish ISBN (978-83…) when the work has many editions
  const isbn = isbns.find((i) => i.startsWith('97883')) || isbns[0] || '';
  const b = {
    title: String(d.title || '').trim(),
    author: (d.author_name || [])[0] || '',
    isbn,
    isbns,
    pages: d.number_of_pages_median || null,
    year: d.first_publish_year || null,
    genre: '',
    subjects: (d.subject || []).slice(0, 8),
    publisher: '', // OL lists publishers of every edition (often foreign) — BN fills this in
    source: 'ol',
  };
  // a Polish edition's own cover first (the work-level cover_i is often a foreign edition)
  b.coverUrl = isbn.startsWith('97883') ? coverForIsbn(isbn) : d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : isbn ? coverForIsbn(isbn) : '';
  return b;
}
export async function searchOl(q) {
  const isbn = cleanIsbn(q);
  const param = isbn ? `isbn=${isbn}` : `q=${encodeURIComponent(q)}`;
  const j = await getJson(`https://openlibrary.org/search.json?${param}&fields=${OL_FIELDS}&limit=10`);
  return (j.docs || []).map(fromOl).filter((b) => b.title);
}

// ---------- Biblioteka Narodowa ----------
/** "Ziemia obiecana / Władysław Stanisław Reymont ; il. …" → "Ziemia obiecana" ; trailing " :" removed. */
export function cleanBnTitle(t) {
  let s = String(t || '').split(' / ')[0];
  s = s.replace(/^[^()]*\([a-z]{2,4}\.\)\s*/, ''); // uniform title prefix: "Ziemia obiecana (pol.) Ziemia obiecana: powieść" 
  s = s.replace(/\s+([:;,.])/g, '$1').replace(/[\s:;,./]+$/, '').trim();
  return s.replace(/\s{2,}/g, ' ');
}
/** "Reymont, Władysław Stanisław (1867-1925)" → "Władysław Stanisław Reymont" — first person only. */
const NOT_A_NAME = /^(Wydawnictwo|Wydaw\.?|Wyd\.?|Instytut|Zakład|Spółka|Dom|Oficyna|Państwowy|Księgarnia|Nakład|Druk)$/i;
export function cleanBnAuthor(a) {
  const s = String(a || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // BN joins people like "Reymont, Władysław Stanisław (1867-1925) Popiel, Magdalena (1953- ) Zakład …":
  // the first "Surname, Given names" is the author; everyone after is a translator, illustrator or publisher.
  const m = s.match(/^([^,()]+),\s*([^()]*)/);
  if (!m) return s.replace(/\(.*?\)/g, '').replace(/[\s.,;:]+$/, '').trim();
  const given = [];
  for (const w of m[2].trim().split(' ')) {
    if (given.length >= 3 || NOT_A_NAME.test(w) || !/^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż'-]*\.?$/.test(w)) break;
    given.push(w);
  }
  return [given.join(' ').replace(/\.$/, ''), m[1].trim()].filter(Boolean).join(' ');
}
/** marc 300a "391, [9] stron :" / "25, [3] s. :" → 391 */
export function bnPages(marc) {
  const f = (marc?.fields || []).find((x) => x['300']);
  const a = f?.['300']?.subfields?.find((s) => s.a)?.a || '';
  if (/\bCD\b|płyt|audio|dysk/i.test(a)) return { pages: null, audio: true };
  const m = a.match(/(\d{1,5})(?:\s*,\s*\[\d+\])?\s*(?:s\.|stron|str\.|strony|k\.)/i) || a.match(/^(\d{1,5})\b/);
  return { pages: m ? Number(m[1]) : null, audio: false };
}
function fromBn(d) {
  if (d.kind && !/książka/i.test(d.kind)) return null;
  if (d.language && !/polski/i.test(d.language)) return null; // the owner reads Polish editions only
  const { pages, audio } = bnPages(d.marc);
  if (audio) return null;
  const isbn = cleanIsbn(String(d.isbnIssn || '').split(/\s+/)[0]);
  const genre = String(d.genre || '').split(/\s{2,}|(?<=[a-ząęółśżźćń])\s(?=[A-ZĄĆĘŁŃÓŚŹŻ])/)[0] || '';
  return {
    title: cleanBnTitle(d.title),
    author: cleanBnAuthor(d.author),
    isbn,
    isbns: isbn ? [isbn] : [],
    pages,
    year: Number(String(d.publicationYear || '').match(/\d{4}/)?.[0]) || null,
    genre: genre.trim(),
    subjects: String(d.subject || '').split(/\s{2,}/).filter(Boolean).slice(0, 6),
    publisher: String(d.publisher || '').replace(/[,;:\s]+$/, ''),
    coverUrl: isbn ? coverForIsbn(isbn) : '',
    source: 'bn',
    language: d.language || '',
  };
}
export async function searchBn(q) {
  if (!PROXY_URL) return [];
  const isbn = cleanIsbn(q);
  const qs = new URLSearchParams(isbn ? { isbnIssn: isbn, limit: '20' } : { title: q, limit: '20' }).toString();
  const j = await getJson(`${PROXY_URL}?bn=${encodeURIComponent(qs)}`);
  return (j.bibs || []).map(fromBn).filter((b) => b && b.title);
}

// ---------- merge ----------
const keyOf = (b) => `${norm(b.title).slice(0, 40)}|${norm(b.author).split(' ').at(-1) || ''}`;
function mergeInto(a, b) {
  for (const k of ['author', 'isbn', 'pages', 'year', 'genre', 'publisher']) if (!a[k] && b[k]) a[k] = b[k];
  if (!a.coverUrl && b.coverUrl) a.coverUrl = b.coverUrl;
  a.isbns = [...new Set([...(a.isbns || []), ...(b.isbns || [])])];
  a.subjects = a.subjects?.length ? a.subjects : b.subjects;
  if (a.source !== b.source && !a.source.includes('+')) a.source = 'bn+ol';
}
/** Merge BN (complete Polish data) with OL (covers): de-duplicate by ISBN, then by title + author surname. */
export function merge(bn, ol) {
  const out = [];
  const byIsbn = new Map();
  const byKey = new Map();
  for (const b of [...bn, ...ol]) {
    let target = (b.isbns || [b.isbn]).filter(Boolean).map((i) => byIsbn.get(i)).find(Boolean) || byKey.get(keyOf(b));
    if (target) mergeInto(target, b);
    else {
      target = { ...b };
      out.push(target);
      byKey.set(keyOf(target), target);
    }
    for (const i of b.isbns || [b.isbn]) if (i) byIsbn.set(i, target);
  }
  return out;
}

/**
 * Search everything available. Returns { results, errors: { bn?, ol? }, bnSkipped: boolean }.
 * Never throws: a failing source is reported in `errors` and the other one still answers.
 */
export async function search(q) {
  q = String(q || '').trim();
  if (!q) return { results: [], errors: {}, bnSkipped: !PROXY_URL };
  const [bn, ol] = await Promise.allSettled([searchBn(q), searchOl(q)]);
  const errors = {};
  if (bn.status === 'rejected') errors.bn = String(bn.reason?.message || bn.reason);
  if (ol.status === 'rejected') errors.ol = String(ol.reason?.message || ol.reason);
  const results = merge(bn.value || [], ol.value || []);
  // books with a Polish ISBN / from BN first; keep the original order otherwise
  results.sort((a, b) => (b.source !== 'ol') - (a.source !== 'ol') || (b.isbn?.startsWith('97883') ? 1 : 0) - (a.isbn?.startsWith('97883') ? 1 : 0));
  return { results: results.slice(0, 20), errors, bnSkipped: !PROXY_URL };
}
export const byIsbn = (isbn) => search(cleanIsbn(isbn) || isbn);

// ---------- Nekla library (SOWA) ----------
/**
 * Check the Nekla catalogue. With the proxy: { ok: true, results: [{title, author, available, statusText, recordUrl}], searchUrl }.
 * Without it: { ok: false, searchUrl } → show "Sprawdź w katalogu" as a link.
 */
export async function libraryCheck(phrase) {
  const searchUrl = sowaSearchUrl(phrase);
  if (!PROXY_URL) return { ok: false, searchUrl, results: [] };
  try {
    const j = await getJson(`${PROXY_URL}?sowa=${encodeURIComponent(String(phrase).slice(0, 140))}`, 12000);
    return { ok: true, searchUrl: j.searchUrl || searchUrl, results: j.results || [] };
  } catch (e) {
    return { ok: false, searchUrl, results: [], error: String(e.message || e) };
  }
}

// ---------- other books by an author (Co dalej? suggestions) ----------
/** Books by an author: BN (`author=`) when the proxy is configured, otherwise Open Library only. Never throws. */
export async function searchAuthor(name) {
  name = String(name || '').trim();
  if (!name) return { results: [], errors: {} };
  const bnP = PROXY_URL
    ? getJson(`${PROXY_URL}?bn=${encodeURIComponent(new URLSearchParams({ author: name, limit: '30' }).toString())}`).then((j) => (j.bibs || []).map(fromBn).filter((b) => b && b.title))
    : Promise.resolve([]);
  const olP = getJson(`https://openlibrary.org/search.json?author=${encodeURIComponent(name)}&fields=${OL_FIELDS}&limit=20`).then((j) => (j.docs || []).map(fromOl).filter((b) => b.title));
  const [bn, ol] = await Promise.allSettled([bnP, olP]);
  const errors = {};
  if (bn.status === 'rejected') errors.bn = String(bn.reason?.message || bn.reason);
  if (ol.status === 'rejected') errors.ol = String(ol.reason?.message || ol.reason);
  return { results: merge(bn.value || [], ol.value || []), errors };
}
