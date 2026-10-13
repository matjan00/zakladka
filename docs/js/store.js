// The single place that touches IndexedDB (database `zakladka`). Everything else goes through this API.
//
// All records except photo blobs are held in memory after init(), so screens read synchronously:
//   store.all('books'), store.get('books', id), store.where('reads', r => r.bookId === id)
// Writes are async and emit change events:
//   await store.put('quotes', {...})       → returns the saved record (id/created/updated filled in)
//   await store.del('sessions', id)
//   store.on(({store, type, id}) => ...)   → returns an unsubscribe function
// Photos (Blobs): putPhoto(blob) → id, getPhoto(id) → Blob, photoUrl(id) → object URL, delPhoto(id).
// Settings: setting(key), setSetting(key, value).
import { uid, todayStr, blobToDataUrl, dataUrlToBlob } from './util.js';

const DB_NAME = 'zakladka';
const DB_VERSION = 1;
const KEYS = { books: 'id', reads: 'id', sessions: 'id', quotes: 'id', libraryChecks: 'bookId', photos: 'id', settings: 'key' };
export const STORES = Object.keys(KEYS);
const CACHED = STORES.filter((s) => s !== 'photos');

export const DEFAULT_SETTINGS = {
  yearGoal: 24, // books per year
  theme: 'auto', // auto | light | dark
  shelfView: 'spines', // spines | list
  shelfSort: 'added', // added | title | author | rating | pages
};

export const STATUSES = [
  ['czytam', 'Czytam'],
  ['chce', 'Chcę przeczytać'],
  ['przeczytane', 'Przeczytane'],
  ['porzucone', 'Porzucone'],
];
export const STATUS_LABEL = Object.fromEntries(STATUSES);
export const FORMATS = [
  ['papier', 'Papier'],
  ['kindle', 'Kindle (Legimi)'],
  ['audiobook', 'Audiobook'],
];
export const FORMAT_LABEL = Object.fromEntries(FORMATS);

let db = null;
const cache = Object.fromEntries(CACHED.map((s) => [s, new Map()]));
const listeners = new Set();
let ready = null;

const req2p = (r) => new Promise((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));
const tx2p = (t) => new Promise((res, rej) => ((t.oncomplete = () => res()), (t.onerror = () => rej(t.error)), (t.onabort = () => rej(t.error))));

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const [name, keyPath] of Object.entries(KEYS)) {
        if (d.objectStoreNames.contains(name)) continue;
        const os = d.createObjectStore(name, { keyPath });
        if (['reads', 'sessions', 'quotes'].includes(name)) os.createIndex('bookId', 'bookId');
        if (name === 'books') os.createIndex('status', 'status');
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('IndexedDB zablokowane — zamknij inne karty z Zakładką.'));
  });
}

/** Open the database and load everything into memory. Call once before rendering. */
export function init() {
  if (ready) return ready;
  ready = (async () => {
    db = await openDb();
    db.onversionchange = () => db.close();
    const t = db.transaction(CACHED, 'readonly');
    await Promise.all(
      CACHED.map(async (s) => {
        const rows = await req2p(t.objectStore(s).getAll());
        for (const r of rows) cache[s].set(r[KEYS[s]], r);
      })
    );
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch {}
  })();
  return ready;
}

function emit(detail) {
  for (const fn of listeners) {
    try {
      fn(detail);
    } catch (e) {
      console.error(e);
    }
  }
  dispatchEvent(new CustomEvent('zakladka:change', { detail }));
}
export const on = (fn) => (listeners.add(fn), () => listeners.delete(fn));

// ---------- generic CRUD ----------
export const all = (s) => [...cache[s].values()];
export const get = (s, id) => cache[s].get(id) || null;
export const where = (s, fn) => all(s).filter(fn);

export async function put(s, rec, { silent = false } = {}) {
  const key = KEYS[s];
  const now = Date.now();
  const r = { ...rec };
  if (s !== 'settings' && s !== 'libraryChecks') {
    if (!r[key]) r[key] = uid();
    if (!r.created) r.created = now;
    r.updated = now;
  }
  const t = db.transaction(s, 'readwrite');
  t.objectStore(s).put(r);
  await tx2p(t);
  if (cache[s]) cache[s].set(r[key], r);
  if (!silent) emit({ store: s, type: 'put', id: r[key] });
  return r;
}

export async function putMany(s, recs) {
  const key = KEYS[s];
  const t = db.transaction(s, 'readwrite');
  const os = t.objectStore(s);
  const now = Date.now();
  const out = recs.map((x) => {
    const r = { ...x };
    if (s !== 'settings' && s !== 'libraryChecks') {
      if (!r[key]) r[key] = uid();
      if (!r.created) r.created = now;
      r.updated = r.updated || now;
    }
    os.put(r);
    return r;
  });
  await tx2p(t);
  if (cache[s]) for (const r of out) cache[s].set(r[key], r);
  emit({ store: s, type: 'put', id: null });
  return out;
}

export async function del(s, id, { silent = false } = {}) {
  const t = db.transaction(s, 'readwrite');
  t.objectStore(s).delete(id);
  await tx2p(t);
  cache[s]?.delete(id);
  if (s === 'photos') dropUrl(id);
  if (!silent) emit({ store: s, type: 'delete', id });
}

// ---------- settings ----------
export const setting = (k) => (cache.settings.has(k) ? cache.settings.get(k).value : DEFAULT_SETTINGS[k]);
export const setSetting = (k, value) => put('settings', { key: k, value });

// ---------- photos ----------
const urls = new Map();
function dropUrl(id) {
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
}
export async function putPhoto(blob, meta = {}) {
  const rec = { id: uid(), blob, type: blob.type || 'image/jpeg', created: Date.now(), ...meta };
  const t = db.transaction('photos', 'readwrite');
  t.objectStore('photos').put(rec);
  await tx2p(t);
  emit({ store: 'photos', type: 'put', id: rec.id });
  return rec.id;
}
export async function getPhoto(id) {
  if (!id) return null;
  const rec = await req2p(db.transaction('photos').objectStore('photos').get(id));
  return rec?.blob || null;
}
/** Object URL for a stored photo (cached per session). Resolves null when missing. */
export async function photoUrl(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  const b = await getPhoto(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urls.set(id, u);
  return u;
}
export const cachedPhotoUrl = (id) => urls.get(id) || null;
export const delPhoto = (id) => del('photos', id);

// ---------- books ----------
export function newBook(p = {}) {
  return {
    id: uid(),
    title: '',
    author: '',
    pages: null,
    genre: '',
    year: null,
    isbn: '',
    publisher: '',
    format: 'papier',
    status: 'chce',
    tags: [],
    rating: null, // 0.5 … 5
    review: '',
    notes: '',
    currentPage: 0,
    coverUrl: '', // remote cover (Open Library)
    coverPhotoId: '', // own photo in `photos`
    subjects: [],
    source: 'manual', // manual | ol | bn | goodreads
    ...p,
  };
}
export const books = () => all('books');
export const book = (id) => get('books', id);
export const readsOf = (bookId) => where('reads', (r) => r.bookId === bookId).sort((a, b) => String(a.started || '').localeCompare(String(b.started || '')));
export const openRead = (bookId) => readsOf(bookId).find((r) => !r.finished) || null;
export const lastRead = (bookId) => readsOf(bookId).at(-1) || null;
export const progressOf = (b) => (b && b.pages ? Math.max(0, Math.min(1, (Number(b.currentPage) || 0) / b.pages)) : 0);

export async function addBook(p) {
  const b = await put('books', newBook(p));
  if (b.status === 'czytam') await put('reads', { bookId: b.id, started: todayStr(), finished: null });
  if (b.status === 'przeczytane' && !p._noRead) await put('reads', { bookId: b.id, started: null, finished: todayStr() });
  return b;
}
export async function updateBook(id, patch, opts) {
  const b = book(id);
  if (!b) return null;
  return put('books', { ...b, ...patch }, opts);
}

/** Change shelf and keep the reading history in step (opening/closing a read). */
export async function setStatus(id, status) {
  const b = book(id);
  if (!b || b.status === status) return b;
  const open = openRead(id);
  const today = todayStr();
  if (status === 'czytam' && !open) await put('reads', { bookId: id, started: today, finished: null }, { silent: true });
  if (status === 'przeczytane') {
    if (open) await put('reads', { ...open, finished: today }, { silent: true });
    else await put('reads', { bookId: id, started: null, finished: today }, { silent: true });
  }
  if (status === 'porzucone' && open) await put('reads', { ...open, finished: today, abandoned: true }, { silent: true });
  const patch = { status };
  if (status === 'przeczytane' && b.pages) patch.currentPage = b.pages;
  return updateBook(id, patch);
}

/** Delete a book and everything that belongs to it (reads, sessions, quotes, library check, photos). */
export async function deleteBook(id) {
  const b = book(id);
  if (!b) return;
  const t = db.transaction(['books', 'reads', 'sessions', 'quotes', 'libraryChecks', 'photos'], 'readwrite');
  const photoIds = new Set([b.coverPhotoId].filter(Boolean));
  for (const s of ['reads', 'sessions', 'quotes']) {
    for (const r of where(s, (x) => x.bookId === id)) {
      t.objectStore(s).delete(r.id);
      if (r.photoId) photoIds.add(r.photoId);
    }
  }
  t.objectStore('libraryChecks').delete(id);
  for (const p of photoIds) t.objectStore('photos').delete(p);
  t.objectStore('books').delete(id);
  await tx2p(t);
  for (const s of ['reads', 'sessions', 'quotes']) for (const r of where(s, (x) => x.bookId === id)) cache[s].delete(r.id);
  cache.libraryChecks.delete(id);
  cache.books.delete(id);
  photoIds.forEach(dropUrl);
  emit({ store: 'books', type: 'delete', id });
}

/** All tags used on books, most used first. */
export function allTags() {
  const n = new Map();
  for (const b of books()) for (const t of b.tags || []) n.set(t, (n.get(t) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pl')).map((x) => x[0]);
}

// ---------- backup ----------
export async function exportAll() {
  const data = {};
  for (const s of CACHED) data[s] = all(s);
  const photos = await req2p(db.transaction('photos').objectStore('photos').getAll());
  data.photos = await Promise.all(photos.map(async (p) => ({ ...p, blob: undefined, data: await blobToDataUrl(p.blob) })));
  return { app: 'zakladka', format: 1, exported: new Date().toISOString(), data };
}

/** Replace everything with a backup made by exportAll(). Throws on a file that is not a Zakładka backup. */
export async function importAll(json) {
  if (!json || json.app !== 'zakladka' || typeof json.data !== 'object') throw new Error('To nie jest kopia zapasowa Zakładki.');
  const d = json.data;
  const photos = [];
  for (const p of Array.isArray(d.photos) ? d.photos : []) {
    if (!p?.id || typeof p.data !== 'string') continue;
    const { data, ...rest } = p;
    photos.push({ ...rest, blob: await dataUrlToBlob(data) });
  }
  const t = db.transaction(STORES, 'readwrite');
  for (const s of STORES) t.objectStore(s).clear();
  for (const s of CACHED) for (const r of Array.isArray(d[s]) ? d[s] : []) if (r && r[KEYS[s]] != null) t.objectStore(s).put(r);
  for (const p of photos) t.objectStore('photos').put(p);
  await tx2p(t);
  for (const s of CACHED) {
    cache[s].clear();
    for (const r of Array.isArray(d[s]) ? d[s] : []) if (r && r[KEYS[s]] != null) cache[s].set(r[KEYS[s]], r);
  }
  [...urls.keys()].forEach(dropUrl);
  emit({ store: '*', type: 'reset', id: null });
  return { books: cache.books.size, photos: photos.length };
}
