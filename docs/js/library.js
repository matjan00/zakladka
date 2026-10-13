// "Biblioteka w Nekli": availability of Chcę przeczytać / Czytam books in the Nekla public library catalogue (SOWA).
// Screen styled as a checkout card. Results are cached in store `libraryChecks` (keyPath bookId).
// Exports for other modules: checkOf(book), stateOf(book), badgeHTML(book), matchResults(book, results), sameBook(a, b).
import * as store from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { esc, norm, plN, dateShort, timeOf } from './util.js';
import { libraryCheck, hasProxy } from './sources.js';
import { sowaSearchUrl, LEGIMI_NEKLA_URL } from './config.js';

const GAP_MS = 1500; // gentle rate limit between catalogue requests

// ---------- fuzzy, diacritic-insensitive matching ----------
const STOP = new Set(['i', 'w', 'z', 'na', 'o', 'a', 'do', 'od', 'po', 'za', 'ze', 'we', 'to', 'sie', 'oraz', 'the', 'of', 'and']);
const toks = (s) => norm(s).split(' ').filter(Boolean);
const isNum = (t) => /^\d+$/.test(t);
function core(s) {
  const all = toks(s);
  const f = all.filter((t) => !STOP.has(t));
  return f.length ? f : all;
}
function prefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
/** Same word allowing Polish inflection ("Wiedźmin" ~ "Wiedźmina", "Kamienie" ~ "Kamienia"). */
function tokEq(a, b) {
  if (a === b) return true;
  if (isNum(a) || isNum(b) || a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 3) return false;
  const p = prefixLen(a, b);
  return p >= 4 && p >= Math.min(a.length, b.length) - 2;
}
/** 'exact' | 'sub' (catalogue title has an extra subtitle) | 'part' (our title has an extra subtitle) | false */
function titleMatchFull(bookTitle, candTitle) {
  const a = core(bookTitle), c = core(candTitle);
  if (!a.length || !c.length) return false;
  if (!a.filter(isNum).every((n) => c.includes(n))) return false; // "Tom 1" is not "Tom 2"
  const covA = a.filter((x) => c.some((y) => tokEq(x, y))).length / a.length;
  const covC = c.filter((y) => a.some((x) => tokEq(x, y))).length / c.length;
  if (covA === 1 && covC === 1) return 'exact';
  const extra = a.length === 1 ? 2 : a.length === 2 ? 3 : 5;
  if (covA === 1 && tokEq(a[0], c[0]) && c.length - a.length <= extra) return 'sub';
  if (covC === 1 && c.length >= 2 && c.length >= a.length * 0.5) return 'part';
  return false;
}
const SUBTITLE = /\s*[:–—]\s+|\s+-\s+/;
/** Also accept a catalogue title whose subtitle our shorter title lacks ("Chłopki" ~ "Chłopki: opowieść o naszych babkach"). */
function titleMatch(bookTitle, candTitle) {
  const full = titleMatchFull(bookTitle, candTitle);
  if (full === 'exact') return full;
  if (!SUBTITLE.test(bookTitle) && SUBTITLE.test(candTitle)) {
    const main = titleMatchFull(bookTitle, candTitle.split(SUBTITLE)[0]);
    if (main === 'exact') return 'exact';
  }
  return full;
}
/** Surnames of a (possibly multi-author) author string, normalised. */
export function surnames(author) {
  return String(author || '')
    .split(/;|&|\boraz\b|\bi\b/)
    .map((p) => (p.includes(',') ? toks(p.split(',')[0]).at(-1) : toks(p).at(-1)))
    .filter(Boolean);
}
export const surnameOf = (author) => surnames(author)[0] || '';
/** true / false when both sides name an author, null when we can't tell. */
function authorMatch(bookAuthor, candAuthor) {
  const s = surnames(bookAuthor);
  const c = toks(candAuthor);
  if (!s.length || !c.length) return null;
  return s.some((x) => c.some((y) => tokEq(x, y)));
}
/**
 * Our title runs word for word inside the catalogue title: at the start ("Wiedźmin" ~ "Wiedźmin. Ostatnie życzenie")
 * or, for two words or more, after a series name ("Ostatnie życzenie" ~ "Wiedźmin. Ostatnie życzenie").
 */
function titleWithin(bookTitle, candTitle) {
  const a = core(bookTitle), c = core(candTitle);
  if (!a.length || a.length > c.length) return false;
  if (!a.filter(isNum).every((n) => c.includes(n))) return false;
  const runAt = (i) => a.every((x, j) => tokEq(x, c[i + j]));
  if (runAt(0)) return a.length > 1 || a[0].length >= 4;
  if (a.length < 2) return false;
  for (let i = 1; i + a.length <= c.length; i++) if (runAt(i)) return true;
  return false;
}
/** Is catalogue record / suggestion `cand` {title, author} the same work as `book`? Author surname must match when known. */
export function sameBook(book, cand) {
  const t = titleMatch(book.title, cand.title);
  const am = authorMatch(book.author, cand.author);
  if (!t) return am === true && titleWithin(book.title, cand.title);
  if (am === true) return true;
  if (am === false) return false;
  return t === 'exact'; // no author on one side: only an exact title counts
}
export const matchResults = (book, results) => (results || []).filter((r) => sameBook(book, r));

// ---------- cache ----------
const keyOf = (b) => `${norm(b.title)}|${surnameOf(b.author)}`;
/** The stored check for a book, ignored when title/author changed since. */
export function checkOf(b) {
  const c = b && store.get('libraryChecks', b.id);
  return c && c.key === keyOf(b) ? c : null;
}
export const stateOf = (b) => checkOf(b)?.state || 'none';

export const STATE = {
  dostepna: { label: 'Dostępna', cls: 'ok' },
  wypozyczona: { label: 'Wypożyczona', cls: 'warn' },
  jest: { label: 'W katalogu', cls: 'warn' },
  brak: { label: 'Brak w katalogu', cls: 'none' },
  none: { label: 'Nie sprawdzono', cls: 'unk' },
};

/** Small badge for the book detail (only for books on Czytam / Chcę przeczytać with a fresh check). */
export function badgeHTML(b) {
  if (!b || !['chce', 'czytam'].includes(b.status)) return '';
  const c = checkOf(b);
  if (!c) return '';
  const s = STATE[c.state] || STATE.none;
  return `<button class="lib-badge st-${s.cls}" data-go="biblioteka" aria-label="Biblioteka w Nekli: ${esc(s.label)}">${icon('library', 16)}<span>Nekla: ${esc(s.label.toLowerCase())}</span></button>`;
}

// ---------- checking ----------
let lastReqAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function throttle(cancelled) {
  const wait = lastReqAt + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  if (cancelled()) return false;
  lastReqAt = Date.now();
  return true;
}
/** Search phrases, most specific first: "title surname", "main title surname", "main title". */
export function queriesFor(b) {
  const sn = surnameOf(b.author);
  const main = String(b.title || '').split(/\s*[:–—]\s+|\s+-\s+|\.\s+/)[0].trim() || b.title;
  const list = [[b.title, sn], [main, sn], [main]].map((p) => p.filter(Boolean).join(' ').trim()).filter(Boolean);
  const seen = new Set();
  return list.filter((q) => (seen.has(norm(q)) ? false : (seen.add(norm(q)), true)));
}

/** Check one book against the catalogue and cache the answer. Resolves the saved record, { error } or null (cancelled). */
export async function checkBook(b, cancelled = () => false) {
  let last = null;
  const qs = queriesFor(b);
  for (const q of qs) {
    if (!(await throttle(cancelled))) return null;
    const res = await libraryCheck(q);
    if (!res.ok) return { error: res.error || 'Brak połączenia z katalogiem', searchUrl: res.searchUrl };
    last = res;
    const hits = matchResults(b, res.results);
    if (hits.length) return save(b, res, hits, q);
  }
  return save(b, last, [], qs[0]);
}
async function save(b, res, hits, q) {
  const avail = hits.find((h) => h.available === true);
  const best = avail || hits[0] || null;
  const state = !best ? 'brak' : avail ? 'dostepna' : best.available === false ? 'wypozyczona' : 'jest';
  return store.put('libraryChecks', {
    bookId: b.id,
    key: keyOf(b),
    state,
    checkedAt: Date.now(),
    query: q,
    searchUrl: res?.searchUrl || sowaSearchUrl(q),
    recordUrl: best?.recordUrl || '',
    matchTitle: best?.title || '',
    statusText: best?.statusText || '',
    copies: hits.length,
  });
}

// ---------- screen ----------
const busy = new Set();
let batch = null; // { total, done, errors, cancelled }
let live = null; // { ctx } while the screen is open

const ORDER = { dostepna: 0, wypozyczona: 1, jest: 1, none: 2, brak: 3 };
const refresh = () => live?.ctx.refresh();

function rowHTML(b, proxy) {
  const c = checkOf(b);
  const st = STATE[c?.state || 'none'];
  const q = `${b.title} ${surnameOf(b.author)}`.trim();
  const isBusy = busy.has(b.id);
  return `<li class="lc-row" data-id="${esc(b.id)}">
    <div class="lc-main">
      <button class="lc-title t-book" data-book="${esc(b.id)}">${esc(b.title)}</button>
      <p class="lc-author">${esc(b.author || 'autor nieznany')}${b.status === 'czytam' ? ' <span class="lc-shelf">czytam</span>' : ''}</p>
    </div>
    ${proxy || c ? `<span class="lc-stamp st-${st.cls}${isBusy ? ' busy' : ''}" ${c?.statusText ? `title="${esc(c.statusText)}"` : ''}>${isBusy ? 'Sprawdzam…' : esc(st.label)}</span>` : '<span></span>'}
    <div class="lc-meta">
      ${proxy || c ? `<span class="lc-date num">${c ? `sprawdzono ${esc(dateShort(c.checkedAt))}, ${esc(timeOf(c.checkedAt))}` : 'jeszcze nie sprawdzano'}</span>` : ''}
      <span class="lc-links">
        ${c?.recordUrl ? `<a class="lc-link" href="${esc(c.recordUrl)}" target="_blank" rel="noopener">Rekord ${icon('external', 14)}</a>` : ''}
        ${proxy
          ? `<button class="lc-btn" data-check="${esc(b.id)}" ${isBusy || batch ? 'disabled' : ''} aria-label="Sprawdź: ${esc(b.title)}">${icon('refresh', 16)}${c ? 'Sprawdź ponownie' : 'Sprawdź'}</button>`
          : `<a class="lc-link" href="${esc(sowaSearchUrl(q))}" target="_blank" rel="noopener">Szukaj w katalogu ${icon('external', 14)}</a>`}
      </span>
    </div>
  </li>`;
}

export function render(el, ctx) {
  live = { ctx };
  const proxy = hasProxy();
  const list = store
    .books()
    .filter((b) => b.status === 'chce' || b.status === 'czytam')
    .sort((a, b) => ORDER[stateOf(a)] - ORDER[stateOf(b)] || (a.status === b.status ? 0 : a.status === 'chce' ? -1 : 1) || a.title.localeCompare(b.title, 'pl'));
  const n = (s) => list.filter((b) => stateOf(b) === s).length;
  const checked = list.filter((b) => checkOf(b)).length;
  const summary = checked
    ? [n('dostepna') && `${n('dostepna')} ${n('dostepna') === 1 ? 'dostępna' : 'dostępne'}`, n('wypozyczona') + n('jest') && `${n('wypozyczona') + n('jest')} wypożyczone`, n('brak') && `${n('brak')} bez wpisu`].filter(Boolean).join(' · ')
    : '';

  el.innerHTML = `
    <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Wróć">${icon('back')}</button><div class="grow"></div></div>
    <header class="screen-head"><h1 class="t-display">Biblioteka w Nekli</h1></header>
    <p class="t-read lib-intro">Zanim kupisz, zajrzyj na półkę w bibliotece. Sprawdzam katalog dla książek, które chcesz przeczytać i właśnie czytasz.</p>

    ${proxy ? '' : `<aside class="panel lib-note"><b>Na razie zaglądasz do katalogu sam</b><p class="muted">Automatyczne sprawdzanie ruszy po jednym kroku konfiguracji. Do tego czasu przy każdej książce jest link, który otwiera katalog biblioteki z już wpisanym tytułem.</p></aside>`}

    ${list.length ? `
    <section class="lib-card" aria-label="Karta wypożyczeń">
      <header class="lc-head">
        <div><span class="t-label">Biblioteka Publiczna Miasta i Gminy Nekla</span><h2>Karta wypożyczeń</h2></div>
        ${summary ? `<p class="lc-sum t-sm num">${esc(summary)}</p>` : ''}
      </header>
      ${proxy ? `<div class="lc-actions">${
        batch
          ? `<div class="lc-prog"><p class="t-sm num"><b>Sprawdzam ${Math.min(batch.done + 1, batch.total)} z ${batch.total}</b><span class="faint"> · po jednej, żeby nie męczyć katalogu</span></p>${ui.thread(batch.total ? batch.done / batch.total : 0)}</div><button class="btn" data-act="cancel">Anuluj</button>`
          : `<button class="btn primary wide" data-act="all">${icon('refresh', 19)}Sprawdź wszystkie (${list.length})</button>`
      }</div>` : ''}
      <ul class="lc-list">${list.map((b) => rowHTML(b, proxy)).join('')}</ul>
    </section>` : ui.empty({ title: 'Nie ma czego sprawdzać', text: 'Dodaj książki do „Chcę przeczytać”, a sprawdzę, czy czekają na półce w bibliotece.', action: 'Przejdź do półki', actionAttr: 'data-go="polka?polka=chce"' })}

    <section class="section lib-extra">
      <div class="panel lib-box">
        <h3 class="t-book">Legimi z biblioteki</h3>
        <p class="muted">Czytelnicy biblioteki w Nekli mogą dostać bezpłatne kody na Legimi, więc część e-booków i audiobooków przeczytasz bez wydatku.</p>
        <a class="btn" href="${esc(LEGIMI_NEKLA_URL)}" target="_blank" rel="noopener">Odbierz kod ${icon('external', 17)}</a>
      </div>
      <div class="panel lib-box">
        <h3 class="t-book">Kontakt z biblioteką</h3>
        <dl class="card-fields">
          <dt class="t-label">E-mail</dt><dd><a href="mailto:biblioteka@gminanekla.pl">biblioteka@gminanekla.pl</a></dd>
          <dt class="t-label">Telefon</dt><dd><a href="tel:+48614386430">61 43 86 430</a></dd>
        </dl>
      </div>
    </section>`;

  el.onclick = (e) => {
    const t = e.target.closest('[data-act],[data-check],[data-book]');
    if (!t) return;
    if (t.dataset.book) return ctx.go(`ksiazka/${t.dataset.book}`);
    if (t.dataset.check) return checkOne(t.dataset.check);
    const a = t.dataset.act;
    if (a === 'back') return history.length > 1 ? history.back() : ctx.go('polka');
    if (a === 'all') return checkAll(list);
    if (a === 'cancel' && batch) {
      batch.cancelled = true;
      ui.toast('Anuluję po bieżącym sprawdzeniu');
    }
  };
  // The shell also calls this before every re-render; only cancel when the screen was really left.
  return () => {
    live = null;
    queueMicrotask(() => {
      if (!live && batch) batch.cancelled = true;
    });
  };
}
/** While a batch runs, the loop redraws once per book itself. */
export function onChange(detail) {
  return detail.store === 'libraryChecks' && !!batch;
}

async function checkOne(id) {
  const b = store.book(id);
  if (!b || busy.has(id) || batch) return;
  busy.add(id);
  refresh();
  const r = await checkBook(b);
  busy.delete(id);
  refresh();
  if (r?.error) ui.toast('Nie udało się sprawdzić katalogu. Spróbuj za chwilę.');
}

async function checkAll(list) {
  if (batch) return;
  const my = (batch = { total: list.length, done: 0, errors: 0, cancelled: false });
  refresh();
  for (const item of list) {
    if (my.cancelled) break;
    const b = store.book(item.id);
    if (!b) continue;
    busy.add(b.id);
    refresh();
    const r = await checkBook(b, () => my.cancelled);
    busy.delete(b.id);
    if (r?.error) {
      if (++my.errors >= 2) break; // two failures in a row: the catalogue is out of reach, stop politely
    } else my.errors = 0;
    if (r && !r.error) my.done++;
  }
  const stopped = my.cancelled, failed = my.errors >= 2, done = my.done;
  batch = null;
  refresh();
  ui.toast(failed ? 'Katalog nie odpowiada. Spróbuj później.' : stopped ? `Przerwano po ${plN(done, 'książce', 'książkach', 'książkach')}` : `Sprawdzono ${plN(done, 'książkę', 'książki', 'książek')}`);
}
