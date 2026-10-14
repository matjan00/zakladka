// Import z Goodreads: instructions, file picker, preview (counts + duplicates), import, covers in the background.
import * as store from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { esc, plN, uid, parseYmd } from './util.js';
import { parseGoodreads, dedupe, missingFrom } from './goodreads-parse.js';
import { coverForIsbn } from './sources.js';

const MAX_BYTES = 30 * 1024 * 1024;
const SHELVES = [
  ['przeczytane', 'Przeczytane'],
  ['czytam', 'Czytam'],
  ['chce', 'Chcę przeczytać'],
];

// state lives at module level so a re-render (store change) doesn't lose the preview
let st = { stage: 'idle', file: '', parsed: [], fresh: [], dups: [], fill: true, error: '', result: null, covers: null };

/** Shelf books the file can complete: [{ book, g, patch, addRead, fields }] (only books with something to add). */
function fillable() {
  return st.dups
    .filter((g) => g.matchId && store.book(g.matchId))
    .map((g) => {
      const book = store.book(g.matchId);
      return { book, g, ...missingFrom(book, g, store.readsOf(book.id)) };
    })
    .filter((x) => x.fields.length);
}

export function render(el, ctx) {
  el.innerHTML = `
    <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Wróć">${icon('back')}</button><div class="grow"></div></div>
    <header class="screen-head"><h1 class="t-display">Import z Goodreads</h1></header>
    ${st.stage === 'preview' ? previewHTML() : st.stage === 'done' ? doneHTML() : stepsHTML()}`;

  el.onclick = async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const a = t.dataset.act;
    if (a === 'back') return history.length > 1 ? history.back() : ctx.go('polka');
    if (a === 'cancel') return ((st = { ...st, stage: 'idle' }), ctx.refresh());
    if (a === 'more') return ((st = { ...st, stage: 'idle', result: null }), ctx.refresh());
    if (a === 'shelf') return ctx.go('polka');
    if (a === 'fill') return ((st = { ...st, fill: !st.fill }), ctx.refresh());
    if (a === 'import') {
      t.disabled = true;
      try {
        await runImport();
      } catch (err) {
        console.error(err);
        ui.toast('Import się nie udał — spróbuj jeszcze raz');
        t.disabled = false;
      }
    }
  };
  el.onchange = async (e) => {
    if (!e.target.matches('[data-file]')) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) return ui.toast('Ten plik jest za duży jak eksport z Goodreads');
    const r = parseGoodreads(await file.text());
    if (r.error) {
      st = { ...st, stage: 'idle', error: r.error };
      return ctx.refresh();
    }
    const { fresh, dups } = dedupe(r.books, store.books());
    st = { ...st, stage: 'preview', file: file.name, parsed: r.books, fresh, dups, error: '' };
    ctx.refresh();
    scrollTo(0, 0);
  };
  const onCovers = () => st.stage === 'done' && ctx.refresh();
  addEventListener('zakladka:covers', onCovers);
  return () => removeEventListener('zakladka:covers', onCovers);
}

function stepsHTML() {
  return `
    <p class="t-read muted">Przeniesiesz tu całą historię z Goodreads: półki, oceny, daty przeczytania i recenzje. Nic nie zostanie usunięte z Goodreads, a książki, które już masz, nie zdublują się.</p>
    <section class="section">
      <h2>Jak pobrać plik z Goodreads</h2>
      <ol class="gr-steps">
        <li>Otwórz <a href="https://www.goodreads.com/review/import" target="_blank" rel="noopener">goodreads.com</a> i zaloguj się. Najłatwiej na komputerze; w telefonie wybierz w przeglądarce „Wersja na komputer”.</li>
        <li>W górnym menu kliknij <b>My Books</b>.</li>
        <li>Po lewej, pod listą półek, kliknij <b>Import and export</b> (albo wejdź prosto na <i>goodreads.com/review/import</i>).</li>
        <li>Kliknij przycisk <b>Export Library</b> i poczekaj chwilę — przy dużej bibliotece nawet kilka minut.</li>
        <li>Gdy pojawi się napis <i>Your export from…</i>, kliknij go. Pobierze się plik <b>goodreads_library_export.csv</b>.</li>
        <li>Wróć do Zakładki i wybierz ten plik poniżej.</li>
      </ol>
    </section>
    ${st.error ? `<p class="gr-error" role="alert">${esc(st.error)}</p>` : ''}
    <label class="btn primary wide" style="margin-top:20px">${icon('upload')}Wybierz plik CSV<input type="file" accept=".csv,text/csv,text/plain" hidden data-file></label>
    <p class="faint t-sm" style="margin-top:10px">Plik zostaje w telefonie — nigdzie go nie wysyłam.</p>`;
}

function previewHTML() {
  const count = (list, s) => list.filter((b) => b.status === s).length;
  const withReview = st.fresh.filter((b) => b.review).length;
  const withRating = st.fresh.filter((b) => b.rating).length;
  const sample = st.fresh.slice(0, 6);
  const fill = fillable();
  const doFill = st.fill && fill.length;
  const fieldsAll = [...new Set(fill.flatMap((x) => x.fields))].slice(0, 4).join(', ');
  const action = st.fresh.length ? `Importuj ${plN(st.fresh.length, 'książkę', 'książki', 'książek')}` : doFill ? `Uzupełnij ${plN(fill.length, 'książkę', 'książki', 'książek')}` : '';
  return `
    <p class="faint t-sm">Plik: ${esc(st.file)}</p>
    <section class="section" style="margin-top:12px">
      <h2>${st.fresh.length ? `Do zaimportowania: ${plN(st.fresh.length, 'książka', 'książki', 'książek')}` : 'Nie ma nowych książek'}</h2>
      ${st.dups.length ? `<p class="muted" style="margin-top:6px">${plN(st.dups.length, 'książkę', 'książki', 'książek')} już masz na półce — nie zdublują się.</p>` : ''}
      ${fill.length ? `<label class="check gr-fill"><input type="checkbox" data-act="fill" ${st.fill ? 'checked' : ''}>
        <span>Uzupełnij brakujące dane w ${plN(fill.length, 'książce', 'książkach', 'książkach')} z półki <span class="faint t-sm">(${esc(fieldsAll)}). Nic, co już wpisałeś, nie zostanie nadpisane.</span></span></label>` : ''}
    </section>
    ${st.fresh.length ? `<dl class="card-fields" style="margin-top:16px">
      ${SHELVES.filter(([k]) => count(st.fresh, k)).map(([k, l]) => `<dt class="t-label">${l}</dt><dd>${count(st.fresh, k)}</dd>`).join('')}
      <dt class="t-label">Z oceną</dt><dd>${withRating}</dd>
      <dt class="t-label">Z recenzją</dt><dd>${withReview}</dd>
    </dl>
    <ul class="list gr-sample">${sample.map((b) => `<li class="row"><span class="grow"><span class="t-book">${esc(b.title)}</span><br><span class="faint t-sm">${esc(b.author)}</span></span><span class="faint t-sm">${esc(SHELVES.find((s) => s[0] === b.status)?.[1] || '')}</span></li>`).join('')}</ul>
    ${st.fresh.length > sample.length ? `<p class="faint t-sm">…i ${st.fresh.length - sample.length} więcej</p>` : ''}` : ''}
    <div class="btn-row" style="margin-top:24px"><button class="btn" data-act="cancel">Wróć</button>${action ? `<button class="btn primary" data-act="import">${action}</button>` : ''}</div>`;
}

function doneHTML() {
  const r = st.result;
  const c = st.covers;
  const title = r.books ? `Zaimportowano ${plN(r.books, 'książkę', 'książki', 'książek')}` : `Uzupełniono ${plN(r.filled, 'książkę', 'książki', 'książek')}`;
  const text = [
    r.books && r.filled ? `${plN(r.filled, 'książka', 'książki', 'książek')} z półki ${ui.pl(r.filled, 'dostała', 'dostały', 'dostało')} brakujące dane.` : '',
    r.dups && !r.filled ? `${plN(r.dups, 'książka', 'książki', 'książek')} ${ui.pl(r.dups, 'była', 'były', 'było')} już na półce.` : '',
  ].filter(Boolean).join(' ') || 'Wszystko wylądowało na półkach.';
  return `${ui.empty({ title, text })}
    ${c && c.total ? `<p class="faint t-sm center" role="status">${c.done < c.total ? `Dociągam okładki… ${c.done} z ${c.total}` : `Okładki: znalazłem ${c.found} z ${c.total}. Reszta dostanie zaprojektowaną obwolutę.`}</p>` : ''}
    <div class="btn-row" style="margin-top:20px"><button class="btn" data-act="more">Wczytaj inny plik</button><button class="btn primary" data-act="shelf">Zobacz półkę</button></div>`;
}

async function runImport() {
  const now = Date.now();
  const books = [], reads = [];
  for (const g of st.fresh) {
    const id = uid();
    const added = g.dateAdded ? +parseYmd(g.dateAdded) : now;
    books.push(
      store.newBook({
        id,
        title: g.title,
        author: g.author,
        isbn: g.isbn,
        pages: g.pages,
        year: g.year,
        publisher: g.publisher,
        format: g.format,
        status: g.status,
        tags: g.tags,
        rating: g.rating,
        review: g.review,
        readCount: g.readCount || undefined,
        currentPage: g.status === 'przeczytane' ? g.pages || 0 : 0,
        coverUrl: '',
        source: 'goodreads',
        created: added,
      })
    );
    if (g.status === 'przeczytane' && g.dateRead) reads.push({ bookId: id, started: null, finished: g.dateRead });
    if (g.status === 'czytam') reads.push({ bookId: id, started: g.dateAdded || new Date().toISOString().slice(0, 10), finished: null });
  }
  // books already on the shelf: fill only what is empty there
  const fill = st.fill ? fillable() : [];
  const patched = fill.filter((x) => Object.keys(x.patch).length).map((x) => ({ ...x.book, ...x.patch, updated: Date.now() }));
  for (const x of fill) if (x.addRead) reads.push(x.addRead);
  if (books.length) await store.putMany('books', books);
  if (patched.length) await store.putMany('books', patched);
  if (reads.length) await store.putMany('reads', reads);
  const withIsbn = books.filter((b) => b.isbn);
  st = { ...st, stage: 'done', result: { books: books.length, dups: st.dups.length, filled: fill.length }, covers: { total: withIsbn.length, done: 0, found: 0 } };
  fetchCovers(withIsbn.map((b) => ({ id: b.id, isbn: b.isbn })));
  ui.toast(books.length ? `Zaimportowano ${plN(books.length, 'książkę', 'książki', 'książek')}` : `Uzupełniono ${plN(fill.length, 'książkę', 'książki', 'książek')}`);
}

// ---------- covers in the background (never blocks the UI) ----------
function probe(url) {
  return new Promise((res) => {
    const im = new Image();
    const t = setTimeout(() => ((im.src = ''), res(false)), 8000);
    im.onload = () => (clearTimeout(t), res(im.naturalWidth > 1));
    im.onerror = () => (clearTimeout(t), res(false));
    im.src = url;
  });
}
async function fetchCovers(items) {
  const progress = st.covers;
  const queue = [...items];
  const worker = async () => {
    while (queue.length) {
      const { id, isbn } = queue.shift();
      const url = coverForIsbn(isbn);
      let ok = false;
      try {
        ok = !!url && (await probe(url)); // a missing cover is a 1x1 gif (no 404 in the console)
      } catch {}
      if (progress) progress.done++;
      if (ok) {
        if (progress) progress.found++;
        const b = store.book(id);
        if (b && !b.coverUrl && !b.coverPhotoId) await store.updateBook(id, { coverUrl: url });
      } else dispatchEvent(new CustomEvent('zakladka:covers'));
      await new Promise((r) => setTimeout(r, 120));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  dispatchEvent(new CustomEvent('zakladka:covers'));
}

