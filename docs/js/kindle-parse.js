// Pure parsing for Kindle "My Clippings.txt" (Polish + English) and fuzzy matching to library books.
// No DOM, no store: also loaded by scripts/test-kindle.cjs under plain node.
import { norm, hash } from './util.js';

const PL_MONTHS = { stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6, lipca: 7, sierpnia: 8, wrzesnia: 9, pazdziernika: 10, listopada: 11, grudnia: 12 };
const EN_MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

/** Date text after "Dodano:" / "Added on" → timestamp (local time) or null. */
export function parseKindleDate(s) {
  const t = norm(s); // lowercase, diacritics gone
  let h = 0, mi = 0, se = 0;
  const timeSrc = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(s));
  if (timeSrc) {
    h = +timeSrc[1];
    mi = +timeSrc[2];
    se = +(timeSrc[3] || 0);
    const ap = (timeSrc[4] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
  }
  const words = t.split(' ');
  let month = 0;
  for (const w of words) {
    if (PL_MONTHS[w]) month = PL_MONTHS[w];
    else if (EN_MONTHS[w]) month = EN_MONTHS[w];
  }
  // remove the time part before looking for day / year
  const rest = String(s).replace(/\d{1,2}:\d{2}(?::\d{2})?\s*(am|pm)?/i, ' ');
  const nums = (rest.match(/\d+/g) || []).map(Number);
  const year = nums.find((n) => n >= 1990 && n <= 2100);
  const day = nums.find((n) => n >= 1 && n <= 31);
  if (!month || !year || !day) return null;
  const d = new Date(year, month - 1, day, h, mi, se);
  return Number.isNaN(+d) ? null : +d;
}

/** "Tytuł (Autor)" → { title, author }. Uses the LAST parenthesised group. "Nazwisko, Imię" → "Imię Nazwisko". */
export function splitTitleLine(line) {
  const raw = String(line || '').trim();
  const m = /^(.*)\(([^()]*)\)\s*$/.exec(raw);
  let title = raw, author = '';
  if (m && m[1].trim()) {
    title = m[1].trim();
    author = m[2].trim();
  }
  author = author
    .split(/\s*;\s*/)
    .map((a) => {
      const p = a.split(',').map((x) => x.trim());
      return p.length === 2 && p[0] && p[1] && !/\s/.test(p[0]) ? `${p[1]} ${p[0]}` : a;
    })
    .join(', ');
  return { title, author };
}

function metaKind(meta) {
  const n = norm(meta);
  if (/\b(zakladk\w*|bookmark)\b/.test(n)) return 'bookmark';
  if (/\b(notatk\w*|note)\b/.test(n)) return 'note';
  if (/\b(zakreslen\w*|highlight|clip\w*|wyroznieni\w*)\b/.test(n)) return 'highlight';
  return 'other';
}

function parseMeta(meta) {
  const n = norm(meta);
  const page = /\b(?:strona|strony|stronie|page)\s+(\d+)/.exec(n);
  const loc = /\b(?:lokalizacj\w*|location|loc)\s+(\d+)(?:\s+(\d+))?/.exec(n);
  // "location 120-122" → norm turns the dash into a space; take the pair only when the raw text has a dash
  const rawLoc = /(?:lokalizacj\w*|location)\s+(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(meta);
  const start = rawLoc ? +rawLoc[1] : loc ? +loc[1] : null;
  const end = rawLoc ? (rawLoc[2] ? +rawLoc[2] : start) : start;
  const dm = /(?:Dodano:?|Added on)\s*(.*)$/i.exec(meta);
  return { kind: metaKind(meta), page: page ? +page[1] : null, locStart: start, locEnd: end, added: dm ? parseKindleDate(dm[1]) : null };
}

/**
 * Parse the whole file. Returns { entries, highlights, skipped:{bookmarks, orphanNotes, empty, dupInFile} }
 * highlights[] = { titleLine, title, author, text, page, loc, note, added, hash }
 */
export function parseClippings(raw) {
  const text = String(raw || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n={5,}\s*(?:\n|$)/).map((b) => b.trim()).filter(Boolean);
  const entries = [];
  const skipped = { bookmarks: 0, orphanNotes: 0, empty: 0, dupInFile: 0 };
  for (const b of blocks) {
    const lines = b.split('\n');
    const titleLine = lines.shift().replace(/^﻿/, '').trim();
    const metaLine = (lines.shift() || '').replace(/^\s*-\s*/, '').trim();
    if (!titleLine || !metaLine) continue;
    const body = lines.join('\n').trim();
    const meta = parseMeta(metaLine);
    entries.push({ titleLine, ...splitTitleLine(titleLine), ...meta, body });
  }

  const highlights = [];
  const notes = [];
  for (const e of entries) {
    if (e.kind === 'bookmark') skipped.bookmarks++;
    else if (e.kind === 'note') notes.push(e);
    else if (e.kind === 'highlight') {
      if (!e.body) skipped.empty++;
      else highlights.push({ ...e, text: e.body.replace(/\s*\n\s*/g, ' ').trim(), note: '' });
    }
  }

  // Kindle writes an extended highlight as a second entry with the same start: keep the longer one.
  const kept = [];
  for (const h of highlights) {
    const same = kept.findIndex((k) => k.titleLine === h.titleLine && k.locStart != null && k.locStart === h.locStart && (norm(k.text).includes(norm(h.text)) || norm(h.text).includes(norm(k.text))));
    if (same >= 0) {
      skipped.dupInFile++;
      if (h.text.length > kept[same].text.length) kept[same] = { ...h };
    } else kept.push(h);
  }

  // notes → nearest highlight of the same book (by location), within 50 locations
  for (const n of notes) {
    if (!n.body) continue;
    let best = null, bestD = Infinity;
    for (const h of kept) {
      if (h.titleLine !== n.titleLine || h.locStart == null || n.locStart == null) continue;
      const d = n.locStart < h.locStart ? h.locStart - n.locStart : n.locStart > h.locEnd ? n.locStart - h.locEnd : 0;
      if (d < bestD) (bestD = d), (best = h);
    }
    if (best && bestD <= 50) best.note = best.note ? `${best.note}\n${n.body}` : n.body;
    else skipped.orphanNotes++;
  }

  for (const h of kept) h.hash = quoteHash(h.titleLine, h.text);
  return { highlights: kept, skipped, total: entries.length };
}

export const quoteHash = (titleLine, text) => 'k' + hash(norm(titleLine) + '|' + norm(text)).toString(36);

// ---------- fuzzy book matching ----------
function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const ratio = (a, b) => (a || b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 0);
const tokens = (s) => norm(s).split(' ').filter(Boolean);

/** 0…1 similarity of two titles. Handles subtitles ("Dune: Diuna") and word order. */
export function titleSim(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  let s = ratio(na, nb);
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length >= 5 && (long.startsWith(short + ' ') || long.endsWith(' ' + short) || long.includes(' ' + short + ' '))) s = Math.max(s, 0.9);
  const ta = new Set(tokens(a)), tb = new Set(tokens(b));
  const inter = [...ta].filter((x) => tb.has(x)).length;
  const jac = inter / (ta.size + tb.size - inter || 1);
  return Math.max(s, jac);
}
/** 0…1 overlap of author names regardless of order / initials. */
export function authorSim(a, b) {
  const ta = tokens(a).filter((x) => x.length > 1), tb = tokens(b).filter((x) => x.length > 1);
  if (!ta.length || !tb.length) return 0;
  const hit = ta.filter((x) => tb.some((y) => y === x || ratio(x, y) >= 0.82)).length;
  return hit / Math.min(ta.length, tb.length);
}

/** Best library match for a Kindle title line: { book, score } or null. `books` = [{id,title,author}] */
export function matchBook(title, author, books) {
  let best = null;
  for (const b of books) {
    const t = titleSim(title, b.title);
    const a = author && b.author ? authorSim(author, b.author) : 0;
    const score = t + (a >= 0.5 ? 0.1 : 0);
    const ok = t >= 0.85 || (t >= 0.6 && a >= 0.5);
    if (ok && (!best || score > best.score)) best = { book: b, score };
  }
  return best;
}
