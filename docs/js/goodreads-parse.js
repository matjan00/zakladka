// Pure parsing of a Goodreads library export (goodreads_library_export.csv). No DOM, no store (node-testable).
import { norm, cleanIsbn } from './util.js';

/** RFC-4180-ish CSV: quoted fields, "" escapes, newlines inside quotes, CRLF, BOM. Returns array of rows (arrays). */
export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', q = false, i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') (field += '"'), (i += 2);
        else (q = false), i++;
      } else (field += c), i++;
    } else if (c === '"' && field === '') (q = true), i++;
    else if (c === ',') (row.push(field), (field = ''), i++);
    else if (c === '\n' || c === '\r') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += c === '\r' && s[i + 1] === '\n' ? 2 : 1;
    } else (field += c), i++;
  }
  if (field !== '' || row.length) (row.push(field), rows.push(row));
  return rows.filter((r) => r.length > 1 || (r[0] ?? '') !== '');
}

/** `="9788375780635"` / `=""` → digits. */
export const unwrapIsbn = (s) => String(s ?? '').replace(/^=?"?/, '').replace(/"$/, '').replace(/[^0-9Xx]/g, '').toUpperCase();

const num = (v) => {
  const n = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
/** "2023/05/14" → "2023-05-14" (also accepts 2023-05-14); '' when empty. */
export function gdate(s) {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(String(s || '').trim());
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}
const SHELF = { read: 'przeczytane', 'currently-reading': 'czytam', 'to-read': 'chce' };
const cleanTitle = (t) => String(t || '').replace(/\s*\([^()]*#\d+[^()]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
// Goodreads strips line breaks from reviews and leaves <br/> tags
const cleanReview = (t) => String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

function formatOf(binding) {
  const b = norm(binding);
  if (/audio/.test(b)) return 'audiobook';
  if (/kindle|ebook|e book|digital/.test(b)) return 'kindle';
  return 'papier';
}

/**
 * Text of the CSV → { books, errors }.
 * book = { title, author, isbn, pages, year, publisher, format, status, tags, rating, review, dateRead, dateAdded, readCount, source:'goodreads' }
 */
export function parseGoodreads(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { books: [], error: 'Plik jest pusty.' };
  const head = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  if (idx['Title'] == null || idx['Author'] == null) return { books: [], error: 'To nie wygląda na eksport z Goodreads (brak kolumn Title i Author).' };
  const col = (r, name) => (idx[name] != null ? (r[idx[name]] ?? '').trim() : '');
  const books = [];
  for (const r of rows.slice(1)) {
    const title = cleanTitle(col(r, 'Title'));
    if (!title) continue;
    const shelf = col(r, 'Exclusive Shelf');
    const status = SHELF[shelf] || 'chce';
    const isbn = cleanIsbn(unwrapIsbn(col(r, 'ISBN13'))) || cleanIsbn(unwrapIsbn(col(r, 'ISBN')));
    const rating = Number(col(r, 'My Rating')) || null;
    const tags = [
      ...new Set(
        col(r, 'Bookshelves')
          .split(',')
          .map((t) => t.trim().toLowerCase().replace(/-+/g, ' '))
          .filter((t) => t && !SHELF[t.replace(/ /g, '-')])
      ),
    ];
    const readCount = num(col(r, 'Read Count')) || (status === 'przeczytane' ? 1 : 0);
    books.push({
      title,
      author: col(r, 'Author'),
      isbn,
      pages: num(col(r, 'Number of Pages')),
      year: num(col(r, 'Year Published')) || num(col(r, 'Original Publication Year')),
      publisher: col(r, 'Publisher'),
      format: formatOf(col(r, 'Binding')),
      status,
      tags,
      rating,
      review: cleanReview(col(r, 'My Review')),
      dateRead: gdate(col(r, 'Date Read')),
      dateAdded: gdate(col(r, 'Date Added')),
      readCount,
      source: 'goodreads',
    });
  }
  return { books, error: books.length ? '' : 'W pliku nie ma żadnych książek.' };
}

export const bookKey = (b) => norm(b.title) + '|' + norm(b.author);

/**
 * Split parsed books into new ones and ones already on the shelf (by ISBN or title+author) or repeated in the file.
 * A duplicate of a shelf book carries `matchId` (that book's id); a repeat inside the file has none.
 */
export function dedupe(parsed, existing) {
  const byIsbn = new Map(existing.filter((b) => cleanIsbn(b.isbn)).map((b) => [cleanIsbn(b.isbn), b.id]));
  const byKey = new Map(existing.map((b) => [bookKey(b), b.id]));
  const seenIsbn = new Set(), seenKey = new Set();
  const fresh = [], dups = [];
  for (const b of parsed) {
    const k = bookKey(b);
    const onShelf = (b.isbn && byIsbn.has(b.isbn)) || byKey.has(k);
    if (onShelf) dups.push({ ...b, matchId: b.isbn && byIsbn.has(b.isbn) ? byIsbn.get(b.isbn) : byKey.get(k) });
    else if ((b.isbn && seenIsbn.has(b.isbn)) || seenKey.has(k)) dups.push(b);
    else {
      fresh.push(b);
      seenKey.add(k);
      if (b.isbn) seenIsbn.add(b.isbn);
    }
  }
  return { fresh, dups };
}

/**
 * What a Goodreads row can add to a book already on the shelf without overwriting anything:
 * only empty fields are filled. `reads` = that book's reading history. Returns { patch, addRead, fields }.
 */
export function missingFrom(book, g, reads = []) {
  const patch = {};
  const fields = [];
  const empty = (v) => v == null || v === '' || v === 0 || (Array.isArray(v) && !v.length);
  const take = (key, label, val = g[key]) => {
    if (empty(book[key]) && !empty(val)) (patch[key] = val), fields.push(label);
  };
  take('rating', 'ocena');
  take('pages', 'strony');
  take('year', 'rok');
  take('publisher', 'wydawca');
  take('isbn', 'ISBN');
  take('review', 'recenzja');
  take('tags', 'tagi');
  if (g.readCount > 1 && !(Number(book.readCount) > 1)) (patch.readCount = g.readCount), fields.push('liczba czytań');
  const finished = reads.filter((r) => r.finished && !r.abandoned);
  const addRead = g.status === 'przeczytane' && g.dateRead && !finished.length && book.status === 'przeczytane' ? { bookId: book.id, started: null, finished: g.dateRead } : null;
  if (addRead) fields.push('data przeczytania');
  return { patch, addRead, fields };
}
