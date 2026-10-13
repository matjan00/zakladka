// Półka (library), adding books (search / barcode / manual), book detail & edit.
// Exports: render (shelf), renderDetail (#/ksiazka/<id>), openAdd(), openEdit(id), openPageSheet(id).
import * as store from './store.js';
import { STATUSES, STATUS_LABEL, FORMATS, FORMAT_LABEL } from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import * as sources from './sources.js';
import { sowaSearchUrl } from './config.js';
import { badgeHTML as libBadge } from './library.js';
import { go } from './app.js';
import { esc, pl, plN, norm, cleanIsbn, dateLong, dateShort, todayStr, daysBetween, debounce, shrinkImage } from './util.js';

const SORTS = [
  ['added', 'Ostatnio dodane'],
  ['title', 'Tytuł'],
  ['author', 'Autor'],
  ['rating', 'Ocena'],
  ['pages', 'Liczba stron'],
];
const surname = (a) => String(a || '').trim().split(/\s+/).at(-1) || '';
const coll = new Intl.Collator('pl', { sensitivity: 'base' });

// shelf state for this session (remembered while the app is open)
const view = { q: '', tag: '' };

function sorted(list, by) {
  const L = [...list];
  if (by === 'title') return L.sort((a, b) => coll.compare(a.title, b.title));
  if (by === 'author') return L.sort((a, b) => coll.compare(surname(a.author), surname(b.author)) || coll.compare(a.title, b.title));
  if (by === 'rating') return L.sort((a, b) => (b.rating || 0) - (a.rating || 0) || coll.compare(a.title, b.title));
  if (by === 'pages') return L.sort((a, b) => (b.pages || 0) - (a.pages || 0));
  return L.sort((a, b) => (b.created || 0) - (a.created || 0));
}

const SHELF_EMPTY = {
  all: ['Półka czeka na pierwszą książkę', 'Dodaj to, co czytasz teraz — wyszukaj tytuł, zeskanuj kod kreskowy albo wpisz ręcznie.'],
  czytam: ['Nic teraz nie czytasz', 'Wybierz coś z „Chcę przeczytać” albo dodaj nową książkę.'],
  chce: ['Lista marzeń jest pusta', 'Zapisuj tu książki, które chcesz kiedyś przeczytać — podpowiemy, od czego zacząć.'],
  przeczytane: ['Jeszcze żadnej przeczytanej', 'Kiedy skończysz książkę, trafi tutaj z pieczątką ex libris.'],
  porzucone: ['Żadnych porzuconych', 'Czasem książka nie jest na teraz. To nic złego — tu będą czekać.'],
};

// ---------- shelf ----------
export function render(el, ctx) {
  const shelf = ctx.query.get('polka') || 'all';
  const sortBy = store.setting('shelfSort');
  const mode = store.setting('shelfView');
  const all = store.books();
  const count = (s) => all.filter((b) => b.status === s).length;
  let list = shelf === 'all' ? all : all.filter((b) => b.status === shelf);
  const q = norm(view.q);
  if (q) list = list.filter((b) => norm(`${b.title} ${b.author} ${b.isbn} ${(b.tags || []).join(' ')}`).includes(q));
  if (view.tag) list = list.filter((b) => (b.tags || []).includes(view.tag));
  list = sorted(list, sortBy);
  const tags = store.allTags();

  el.innerHTML = `
    <header class="screen-head">
      <h1 class="t-display">Półka</h1>
      <button class="icon-btn" data-act="add" aria-label="Dodaj książkę">${icon('plus')}</button>
    </header>
    <nav class="seg" aria-label="Półki">
      <button data-shelf="all" class="${shelf === 'all' ? 'on' : ''}">Wszystkie<span class="count num">${all.length}</span></button>
      ${STATUSES.map(([k, label]) => `<button data-shelf="${k}" class="${shelf === k ? 'on' : ''}">${label}<span class="count num">${count(k)}</span></button>`).join('')}
    </nav>
    ${all.length ? `
    <div class="shelf-tools">
      <label class="search grow">${icon('search')}<input class="input" type="search" data-keep="shelf-q" placeholder="Szukaj na półce" value="${esc(view.q)}" aria-label="Szukaj na półce"></label>
      <button class="icon-btn" data-act="view" aria-label="${mode === 'spines' ? 'Widok listy' : 'Widok grzbietów'}">${icon(mode === 'spines' ? 'list' : 'spines')}</button>
      <label class="icon-btn sort-btn" aria-label="Sortuj">${icon('sort')}<select data-act="sort" aria-label="Sortowanie">${SORTS.map(([k, l]) => `<option value="${k}" ${k === sortBy ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    ${tags.length ? `<div class="chips tag-filter">${tags.map((t) => `<button class="chip ${view.tag === t ? 'on' : ''}" data-tag="${esc(t)}">${icon('tag')}${esc(t)}</button>`).join('')}</div>` : ''}` : ''}
    <div class="shelf-body">${list.length ? (mode === 'spines' ? spinesHTML(list, el) : listHTML(list)) : emptyShelf(shelf, all.length, q || view.tag)}</div>
    <div class="shelf-links">
      <button class="row" data-go="biblioteka">${icon('library')}<span class="grow"><b>Biblioteka w Nekli</b><br><span class="faint t-sm">Sprawdź, co jest teraz na półce w bibliotece</span></span>${icon('chev', 18, 'chev')}</button>
      <button class="row" data-go="goodreads">${icon('upload')}<span class="grow"><b>Import z Goodreads</b><br><span class="faint t-sm">Przenieś swoją historię czytania</span></span>${icon('chev', 18, 'chev')}</button>
    </div>`;

  el.onclick = (e) => {
    const t = e.target.closest('[data-shelf],[data-act],[data-book],[data-tag]');
    if (!t) return;
    if (t.dataset.shelf) return go('polka', { polka: t.dataset.shelf === 'all' ? null : t.dataset.shelf }, { replace: true });
    if (t.dataset.book) return go(`ksiazka/${t.dataset.book}`);
    if (t.dataset.tag != null && !t.dataset.act) {
      view.tag = view.tag === t.dataset.tag ? '' : t.dataset.tag;
      return ctx.refresh();
    }
    const a = t.dataset.act;
    if (a === 'add') openAdd({ status: ['czytam', 'chce', 'przeczytane', 'porzucone'].includes(shelf) ? shelf : 'chce' });
    if (a === 'view') store.setSetting('shelfView', mode === 'spines' ? 'list' : 'spines');
  };
  el.onchange = (e) => {
    if (e.target.dataset.act === 'sort') store.setSetting('shelfSort', e.target.value);
  };
  const input = el.querySelector('[data-keep="shelf-q"]');
  if (input) {
    const upd = debounce(() => {
      view.q = input.value;
      const body = el.querySelector('.shelf-body');
      // re-render only the list so the keyboard stays open
      let L = shelf === 'all' ? store.books() : store.books().filter((b) => b.status === shelf);
      const qq = norm(view.q);
      if (qq) L = L.filter((b) => norm(`${b.title} ${b.author} ${b.isbn} ${(b.tags || []).join(' ')}`).includes(qq));
      if (view.tag) L = L.filter((b) => (b.tags || []).includes(view.tag));
      L = sorted(L, sortBy);
      body.innerHTML = L.length ? (mode === 'spines' ? spinesHTML(L, el) : listHTML(L)) : emptyShelf(shelf, store.books().length, qq || view.tag);
      ui.hydrate(body);
    }, 120);
    input.oninput = upd;
  }
  // spines are laid out in rows for the screen width: redo it on rotation
  const onResize = debounce(() => mode === 'spines' && ctx.refresh(), 200);
  addEventListener('resize', onResize);
  return () => removeEventListener('resize', onResize);
}

function emptyShelf(shelf, total, filtered) {
  if (filtered) return ui.empty({ title: 'Nic tu nie pasuje', text: 'Spróbuj innego słowa albo wyczyść filtr.' });
  const [t, x] = SHELF_EMPTY[total ? shelf : 'all'] || SHELF_EMPTY.all;
  return ui.empty({ title: t, text: x, action: 'Dodaj książkę', actionAttr: 'data-act="add"' });
}

function spinesHTML(list, el) {
  const width = Math.max(260, (el.clientWidth || 360) - 36 - 16);
  const rows = [];
  let row = [], used = 0;
  for (const b of list) {
    const w = Math.round(Math.max(26, Math.min(58, 20 + (Number(b.pages) || 300) / 18))) + 3;
    if (used + w > width && row.length) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(b);
    used += w;
  }
  if (row.length) rows.push(row);
  return `<div class="bookcase">${rows
    .map((r) => `<div class="shelf-row"><div class="spines">${r.map((b) => ui.spineHTML(b, { current: b.status === 'czytam' })).join('')}</div><div class="ledge" aria-hidden="true"></div></div>`)
    .join('')}</div>`;
}

function listHTML(list) {
  return `<ul class="list book-list">${list
    .map((b) => {
      const p = store.progressOf(b);
      return `<li><button class="row book-row" data-book="${esc(b.id)}">
        ${ui.coverHTML(b, 's', { ribbon: b.status === 'czytam' })}
        <span class="grow">
          <span class="t-book clamp2">${esc(b.title)}</span>
          <span class="muted t-sm ellipsis">${esc(b.author || 'Autor nieznany')}</span>
          <span class="meta">${b.status === 'czytam' && b.pages ? `${ui.thread(p)}<span class="faint t-sm num">${Math.round(p * 100)}%</span>` : b.rating ? ui.stars(b.rating, { size: 13 }) : `<span class="faint t-sm">${STATUS_LABEL[b.status]}${b.pages ? ` · ${plN(b.pages, 'strona', 'strony', 'stron')}` : ''}</span>`}</span>
        </span>
      </button></li>`;
    })
    .join('')}</ul>`;
}

// ---------- add book ----------
function findDuplicate(c) {
  const isb = new Set([c.isbn, ...(c.isbns || [])].filter(Boolean));
  return store.books().find((b) => (b.isbn && isb.has(b.isbn)) || (norm(b.title) === norm(c.title) && norm(surname(b.author)) === norm(surname(c.author)))) || null;
}

/** Open the "add a book" sheet. opts.status = preselected shelf. */
export function openAdd(opts = {}) {
  let tab = 'szukaj';
  let stopScan = null;
  const rec = ui.openSheet(
    `<div class="sheet-head"><h2>Dodaj książkę</h2><button class="icon-btn" data-close aria-label="Zamknij">${icon('close')}</button></div>
     <div class="pills" role="tablist">
       <button data-tab="szukaj" class="on" role="tab">${'Szukaj'}</button>
       <button data-tab="skanuj" role="tab">Skanuj kod</button>
       <button data-tab="recznie" role="tab">Ręcznie</button>
     </div>
     <div class="add-body"></div>`,
    { full: false, cls: 'tall', label: 'Dodaj książkę', onClose: () => stopScan?.() }
  );
  const body = rec.body.querySelector('.add-body');

  const showTab = (t) => {
    stopScan?.();
    stopScan = null;
    tab = t;
    rec.body.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    if (t === 'szukaj') searchTab();
    if (t === 'skanuj') scanTab();
    if (t === 'recznie') manualTab();
  };
  rec.body.querySelector('.pills').onclick = (e) => {
    const b = e.target.closest('[data-tab]');
    if (b && b.dataset.tab !== tab) showTab(b.dataset.tab);
  };

  // --- search ---
  let lastResults = [];
  function searchTab(initial = '') {
    body.innerHTML = `
      <form class="add-search" autocomplete="off">
        <label class="search">${icon('search')}<input class="input" name="q" type="search" enterkeyhint="search" placeholder="Tytuł, autor albo ISBN" value="${esc(initial)}" aria-label="Szukaj książki"></label>
      </form>
      <p class="faint t-sm src-note">${sources.hasProxy() ? 'Szukam w Bibliotece Narodowej i Open Library.' : 'Szukam w Open Library. Biblioteka Narodowa dołączy, gdy podłączymy serwer pośredniczący.'}</p>
      <div class="results" aria-live="polite"></div>`;
    const form = body.querySelector('form');
    const input = form.q;
    const out = body.querySelector('.results');
    let seq = 0;
    const run = async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        seq++;
        out.innerHTML = '';
        return;
      }
      const my = ++seq;
      out.innerHTML = `<div class="searching"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> Szukam „${esc(q)}”…</div>`;
      const { results, errors } = await sources.search(q);
      if (my !== seq) return;
      lastResults = results;
      if (!results.length) {
        out.innerHTML = `${errors.ol && (!sources.hasProxy() || errors.bn) ? `<p class="warn-note">Nie mogę połączyć się z katalogiem. Sprawdź internet albo dodaj książkę ręcznie.</p>` : ui.empty({ title: 'Nic nie znalazłem', text: 'Spróbuj samego tytułu albo nazwiska autora. Zawsze możesz też dodać książkę ręcznie.' })}
          <button class="btn wide" data-manual>${icon('edit')}Dodaj ręcznie</button>`;
        return;
      }
      out.innerHTML = `<ul class="list">${results
        .map(
          (c, i) => `<li><button class="row result" data-i="${i}">${ui.coverHTML(c, 's')}<span class="grow">
            <span class="t-book clamp2">${esc(c.title)}</span>
            <span class="muted t-sm ellipsis">${esc(c.author || 'Autor nieznany')}</span>
            <span class="faint t-sm num">${[c.year, c.pages ? plN(c.pages, 'strona', 'strony', 'stron') : '', c.source === 'ol' ? 'Open Library' : 'Biblioteka Narodowa'].filter(Boolean).join(' · ')}</span>
          </span>${icon('plus', 20, 'chev')}</button></li>`
        )
        .join('')}</ul>${errors.bn ? '<p class="faint t-sm">Biblioteka Narodowa nie odpowiada — pokazuję wyniki z Open Library.</p>' : ''}
        <button class="btn ghost wide" data-manual>Nie ma mojej? Dodaj ręcznie</button>`;
    };
    const deb = debounce(run, 450);
    input.oninput = deb;
    form.onsubmit = (e) => {
      e.preventDefault();
      input.blur();
      run();
    };
    out.onclick = (e) => {
      if (e.target.closest('[data-manual]')) return showTab('recznie');
      const r = e.target.closest('[data-i]');
      if (r) confirmAdd(lastResults[Number(r.dataset.i)]);
    };
    if (initial) run();
    else setTimeout(() => input.focus(), 320);
  }

  // --- choose shelf & format, then add ---
  function confirmAdd(c) {
    const dup = findDuplicate(c);
    let status = opts.status || 'chce';
    let format = 'papier';
    body.innerHTML = `
      <div class="confirm-book">
        ${ui.coverHTML(c, 'm')}
        <div class="grow">
          <h3 class="t-title">${esc(c.title)}</h3>
          <p class="muted">${esc(c.author || 'Autor nieznany')}</p>
          <p class="faint t-sm num">${[c.year, c.pages ? plN(c.pages, 'strona', 'strony', 'stron') : '', c.isbn ? `ISBN ${c.isbn}` : ''].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      ${dup ? `<p class="warn-note">Ta książka już jest na Twojej półce („${esc(STATUS_LABEL[dup.status])}”). <button class="link-btn" data-open="${esc(dup.id)}">Otwórz</button></p>` : ''}
      <p class="t-label" style="margin:18px 0 8px">Na którą półkę?</p>
      <div class="chips" data-group="status">${STATUSES.map(([k, l]) => `<button class="chip ${k === status ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
      <p class="t-label" style="margin:18px 0 8px">Format</p>
      <div class="chips" data-group="format">${FORMATS.map(([k, l]) => `<button class="chip ${k === format ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="btn-row" style="margin-top:24px"><button class="btn" data-back>Wróć</button><button class="btn primary" data-add>${icon('plus')}Dodaj na półkę</button></div>`;
    body.onclick = async (e) => {
      const chip = e.target.closest('[data-group] [data-v]');
      if (chip) {
        const g = chip.parentElement.dataset.group;
        if (g === 'status') status = chip.dataset.v;
        else format = chip.dataset.v;
        chip.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === chip));
        return;
      }
      if (e.target.closest('[data-open]')) return go(`ksiazka/${e.target.closest('[data-open]').dataset.open}`);
      if (e.target.closest('[data-back]')) {
        body.onclick = null;
        return showTab(tab === 'skanuj' ? 'skanuj' : 'szukaj');
      }
      if (e.target.closest('[data-add]')) {
        e.target.closest('[data-add]').disabled = true;
        const { isbns, ...rest } = c;
        const b = await store.addBook({ ...rest, genre: c.genre || '', status, format, source: c.source || 'manual' });
        ui.toast(`Dodano „${b.title}”`);
        go(`ksiazka/${b.id}`);
      }
    };
  }

  // --- barcode ---
  function scanTab() {
    const supported = 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia;
    body.innerHTML = `
      ${supported ? `<div class="scan"><video playsinline muted></video><div class="scan-frame" aria-hidden="true"><i></i></div><p class="scan-hint">Nakieruj aparat na kod kreskowy z tyłu książki</p></div>` : `<p class="muted t-read" style="margin:16px 0">Ta przeglądarka nie potrafi czytać kodów kreskowych. Przepisz numer ISBN spod kodu — to 13 cyfr zaczynających się od 978 albo 979.</p>`}
      <form class="isbn-form">
        <div class="field"><span class="t-label">Albo wpisz ISBN</span>
        <div class="isbn-row"><input name="isbn" inputmode="numeric" autocomplete="off" placeholder="978…" aria-label="Numer ISBN"><button class="btn primary">Szukaj</button></div></div>
      </form>`;
    const form = body.querySelector('.isbn-form');
    form.onsubmit = (e) => {
      e.preventDefault();
      const isbn = cleanIsbn(form.isbn.value);
      if (!isbn) return ui.toast('To nie wygląda na ISBN — sprawdź cyfry');
      lookupIsbn(isbn);
    };
    if (supported) startScan(body.querySelector('video'));
  }
  async function lookupIsbn(isbn) {
    stopScan?.();
    stopScan = null;
    body.innerHTML = `<div class="searching"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> Szukam ISBN ${esc(isbn)}…</div>`;
    const { results, errors } = await sources.byIsbn(isbn);
    if (results.length) return confirmAdd({ ...results[0], isbn: results[0].isbn || isbn });
    const offline = errors.ol && (!sources.hasProxy() || errors.bn);
    body.innerHTML = `${ui.empty(offline ? { title: 'Brak połączenia z katalogiem', text: `Nie mogę teraz sprawdzić ISBN ${isbn}. Sprawdź internet albo dodaj książkę ręcznie — numer już wpisałem.` } : { title: 'Nie znalazłem tego numeru', text: `ISBN ${isbn} nie występuje w katalogach. Dodaj książkę ręcznie — numer już wpisałem.` })}
      <button class="btn primary wide" data-m>${icon('edit')}Dodaj ręcznie</button>`;
    body.querySelector('[data-m]').onclick = () => {
      showTab('recznie');
      body.querySelector('[name=isbn]').value = isbn;
    };
  }
  async function startScan(video) {
    let stream, raf, stopped = false;
    stopScan = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      video.srcObject = stream;
      await video.play();
      const det = new BarcodeDetector({ formats: ['ean_13'] });
      let busy = false;
      const loop = async () => {
        if (stopped) return;
        if (!busy && video.readyState >= 2) {
          busy = true;
          try {
            const codes = await det.detect(video);
            const hit = codes.map((c) => c.rawValue).find((v) => /^97[89]\d{10}$/.test(v));
            if (hit) {
              navigator.vibrate?.(40);
              return lookupIsbn(hit);
            }
          } catch {}
          busy = false;
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      const sc = body.querySelector('.scan');
      if (sc) sc.outerHTML = `<p class="warn-note">Nie mam dostępu do aparatu. Zezwól na aparat w ustawieniach przeglądarki albo wpisz ISBN poniżej.</p>`;
    }
  }

  // --- manual ---
  function manualTab() {
    body.onclick = null;
    let status = opts.status || 'chce';
    body.innerHTML = `
      <form class="manual" autocomplete="off">
        <div class="field"><span class="t-label">Tytuł</span><input name="title" required placeholder="np. Ziemia obiecana"></div>
        <div class="field"><span class="t-label">Autor</span><input name="author" placeholder="np. Władysław Reymont"></div>
        <div class="field-row">
          <div class="field"><span class="t-label">Liczba stron</span><input name="pages" inputmode="numeric" placeholder="—"></div>
          <div class="field"><span class="t-label">Rok wydania</span><input name="year" inputmode="numeric" placeholder="—"></div>
        </div>
        <div class="field"><span class="t-label">ISBN</span><input name="isbn" inputmode="numeric" placeholder="opcjonalnie"></div>
        <div class="field"><span class="t-label">Format</span><select name="format">${FORMATS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <p class="t-label" style="margin:2px 0 8px">Półka</p>
        <div class="chips" data-group="status">${STATUSES.map(([k, l]) => `<button type="button" class="chip ${k === status ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
        <button class="btn primary wide" style="margin-top:24px">${icon('plus')}Dodaj na półkę</button>
      </form>`;
    const f = body.querySelector('form');
    f.querySelector('[data-group]').onclick = (e) => {
      const c = e.target.closest('[data-v]');
      if (!c) return;
      status = c.dataset.v;
      f.querySelectorAll('[data-group] .chip').forEach((x) => x.classList.toggle('on', x === c));
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const title = f.title.value.trim();
      if (!title) return f.title.focus();
      if (f.dataset.busy) return; // double tap
      f.dataset.busy = '1';
      const p = {
        title,
        author: f.author.value.trim(),
        pages: Number(f.pages.value.replace(/\D/g, '')) || null,
        year: Number(f.year.value.replace(/\D/g, '')) || null,
        isbn: cleanIsbn(f.isbn.value),
        format: f.format.value,
        status,
        source: 'manual',
      };
      if (p.isbn) p.coverUrl = sources.coverForIsbn(p.isbn);
      const dup = findDuplicate(p);
      if (dup && !(await ui.confirmSheet({ title: 'Ta książka już jest na półce', text: `„${dup.title}” masz już w „${STATUS_LABEL[dup.status]}”. Dodać drugi egzemplarz?`, ok: 'Dodaj mimo to' }))) return void delete f.dataset.busy;
      const b = await store.addBook(p);
      ui.toast(`Dodano „${b.title}”`);
      go(`ksiazka/${b.id}`);
    };
    setTimeout(() => f.title.focus(), 50);
  }

  showTab('szukaj');
  return rec;
}

// ---------- book detail ----------
let freshStamp = ''; // id of a book that has just been finished: its ex libris is pressed on once
export function renderDetail(el, ctx) {
  const b = store.book(ctx.params[0]);
  if (!b) {
    el.innerHTML = `<div class="topbar"><button class="icon-btn" data-go="polka" aria-label="Wróć">${icon('back')}</button></div>${ui.empty({ title: 'Tej książki już nie ma', text: 'Może została usunięta. Wróć na półkę.' })}`;
    return;
  }
  const reads = store.readsOf(b.id);
  const finishedCount = reads.filter((r) => r.finished && !r.abandoned).length;
  // Goodreads exports only the last date read: earlier readings are known by count, not by date
  const timesRead = Math.max(Number(b.readCount) || 0, finishedCount);
  const stampFresh = freshStamp === b.id;
  freshStamp = '';
  const lastDone = [...reads].reverse().find((r) => r.finished && !r.abandoned);
  const p = store.progressOf(b);
  const tags = b.tags || [];
  el.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Wróć">${icon('back')}</button>
      <div class="grow"></div>
      <button class="icon-btn" data-act="edit" aria-label="Edytuj">${icon('edit')}</button>
      <button class="icon-btn" data-act="delete" aria-label="Usuń książkę">${icon('trash')}</button>
    </div>
    <article class="book">
      <header class="book-hero">
        <div class="hero-cover">${ui.coverHTML(b, 'l', { ribbon: b.status === 'czytam' })}${b.status === 'przeczytane' ? `<div class="hero-stamp${stampFresh ? ' fresh' : ''}">${ui.exlibris(lastDone?.finished?.slice(0, 4) || '', 82)}</div>` : ''}</div>
        <h1 class="t-display book-title">${esc(b.title)}</h1>
        <p class="book-author">${esc(b.author || 'Autor nieznany')}</p>
        ${libBadge(b)}
        <div class="stars-wrap rate">${ui.starsInput(b.rating)}<span class="faint t-sm num rate-label">${b.rating ? String(b.rating).replace('.', ',') : 'Oceń'}</span></div>
      </header>

      <div class="seg status-seg" role="tablist" aria-label="Półka">${STATUSES.map(([k, l]) => `<button data-status="${k}" class="${b.status === k ? 'on' : ''}" role="tab" aria-selected="${b.status === k}">${l}</button>`).join('')}</div>

      ${b.status === 'czytam' ? `
      <section class="progress-card">
        <div class="pc-top">
          <div><span class="t-label">Postęp</span>
            <p class="pc-num num">${b.pages ? `<b>${b.currentPage || 0}</b> / ${b.pages} <span class="faint">${pl(b.pages, 'strona', 'strony', 'stron')}</span>` : `<span class="faint">strona</span> <b>${b.currentPage || 0}</b>`}</p></div>
          <span class="pc-pct num">${b.pages ? Math.round(p * 100) + '%' : ''}</span>
        </div>
        ${b.pages ? ui.thread(p) : `<p class="faint t-sm">Dodaj liczbę stron, a pokażę, ile zostało.</p>`}
        <div class="btn-row" style="margin-top:14px">
          <button class="btn" data-act="page">Zapisz stronę</button>
          <button class="btn primary" data-go="sesja?book=${esc(b.id)}">${icon('timer')}Sesja</button>
        </div>
      </section>` : ''}

      <section class="section">
        <div class="section-head"><h2>Recenzja</h2></div>
        <div class="field"><textarea data-keep="review" data-field="review" class="review" placeholder="Co o niej myślisz? Kilka zdań dla siebie z przyszłości.">${esc(b.review)}</textarea></div>
        <div class="field"><span class="t-label">Notatki</span><textarea data-keep="notes" data-field="notes" placeholder="Postacie, wątki, myśli na marginesie…">${esc(b.notes)}</textarea></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Karta katalogowa</h2><button class="link-btn" data-act="edit">Edytuj</button></div>
        <dl class="card-fields">
          <dt class="t-label">Autor</dt><dd>${esc(b.author || '—')}</dd>
          <dt class="t-label">Strony</dt><dd>${b.pages || '—'}</dd>
          <dt class="t-label">Rok wydania</dt><dd>${b.year || '—'}</dd>
          <dt class="t-label">Gatunek</dt><dd>${esc(b.genre || '—')}</dd>
          <dt class="t-label">Wydawca</dt><dd>${esc(b.publisher || '—')}</dd>
          <dt class="t-label">ISBN</dt><dd>${esc(b.isbn || '—')}</dd>
          <dt class="t-label">Format</dt><dd>${FORMAT_LABEL[b.format] || '—'}</dd>
          <dt class="t-label">Na półce od</dt><dd>${dateLong(b.created)}</dd>
          <dt class="t-label">Tagi</dt><dd>${tags.length ? tags.map((t) => `<span class="chip">${esc(t)}</span>`).join(' ') : '—'}</dd>
        </dl>
      </section>

      <section class="section">
        <div class="section-head"><h2>Czytania</h2><button class="link-btn" data-act="add-read">${icon('plus', 18)}Dodaj</button></div>
        ${timesRead > 1 ? `<p class="muted reads-note">Czytana ${timesRead} razy${timesRead > finishedCount ? (finishedCount ? `. Datę ${finishedCount === 1 ? 'znam tylko z ostatniego razu' : 'znam tylko z części czytań'}` : ', bez zapisanych dat') : ''}.</p>` : ''}
        ${reads.length ? `<ul class="list reads">${reads
          .map((r) => {
            const days = r.started && r.finished ? daysBetween(r.started, r.finished) + 1 : r.started ? daysBetween(r.started, todayStr()) + 1 : null;
            return `<li><button class="row" data-read="${esc(r.id)}"><span class="grow">
              <span class="num">${r.started ? dateShort(r.started) : '?'} — ${r.finished ? dateLong(r.finished) : 'trwa'}</span>
              <span class="faint t-sm">${r.abandoned ? 'porzucone' : r.finished ? 'przeczytane' : 'w trakcie'}${days ? ` · ${plN(days, 'dzień', 'dni', 'dni')}` : ''}</span>
            </span>${icon('edit', 18, 'chev')}</button></li>`;
          })
          .join('')}</ul>` : `<p class="faint">Jeszcze nie zaczęte. Przełącz na „Czytam”, a zapiszę datę startu.</p>`}
      </section>

      <section class="section" data-quotes-hook></section>

      <section class="section book-more">
        <button class="row" data-go="sesja?book=${esc(b.id)}">${icon('timer')}<span class="grow">Sesje czytania${(() => { const n = store.where('sessions', (s) => s.bookId === b.id).length; return n ? ` · ${n}` : ''; })()}</span>${icon('chev', 18, 'chev')}</button>
        <button class="row" data-go="cytaty?book=${esc(b.id)}">${icon('quote')}<span class="grow">Cytaty z tej książki</span>${icon('chev', 18, 'chev')}</button>
        <a class="row" href="${esc(sowaSearchUrl(`${b.title} ${surname(b.author)}`))}" target="_blank" rel="noopener">${icon('library')}<span class="grow">Sprawdź w katalogu biblioteki w Nekli</span>${icon('external', 18, 'chev')}</a>
      </section>
    </article>`;

  import('./quotes.js').then((m) => { const h = el.querySelector('[data-quotes-hook]'); if (h) m.renderBookQuotes(h, b.id, { go }); }).catch(() => {});
  ui.bindStars(el.querySelector('[data-stars]'), (v) => {
    el.querySelector('.rate-label').textContent = v ? String(v).replace('.', ',') : 'Oceń';
    store.updateBook(b.id, { rating: v }, { silent: true });
  });
  const save = debounce((field, value) => store.updateBook(b.id, { [field]: value }, { silent: true }), 400);
  el.oninput = (e) => {
    const f = e.target.dataset.field;
    if (f) save(f, e.target.value);
  };
  el.onclick = async (e) => {
    const t = e.target.closest('[data-act],[data-status],[data-read]');
    if (!t) return;
    if (t.dataset.status) {
      if (t.dataset.status === 'przeczytane' && b.status !== 'przeczytane') freshStamp = b.id;
      await store.setStatus(b.id, t.dataset.status);
      if (t.dataset.status === 'przeczytane') ui.toast('Gratulacje! Kolejna przeczytana.');
      return;
    }
    if (t.dataset.read) return openRead(b.id, t.dataset.read);
    const a = t.dataset.act;
    if (a === 'back') return history.length > 1 ? history.back() : go('polka');
    if (a === 'edit') return openEdit(b.id);
    if (a === 'page') return openPageSheet(b.id);
    if (a === 'add-read') return openRead(b.id, null);
    if (a === 'delete') {
      const ok = await ui.confirmSheet({ title: `Usunąć „${b.title}”?`, text: 'Zniknie razem z historią czytania, sesjami, cytatami i zdjęciami tej książki. Tego nie da się cofnąć.', ok: 'Usuń książkę', danger: true });
      if (!ok) return;
      await store.deleteBook(b.id);
      ui.toast('Książka usunięta');
      go('polka', null, { replace: true });
    }
  };
}

// ---------- current page ----------
export function openPageSheet(id) {
  const b = store.book(id);
  if (!b) return;
  const rec = ui.openSheet(
    `<div class="sheet-head"><h2>Na której stronie jesteś?</h2></div>
     <form class="page-form">
       <div class="page-input"><button type="button" class="icon-btn" data-d="-1" aria-label="Mniej">−</button>
         <input name="page" inputmode="numeric" value="${b.currentPage || ''}" aria-label="Bieżąca strona" class="num">
         <button type="button" class="icon-btn" data-d="1" aria-label="Więcej">+</button></div>
       <p class="faint t-sm center">${b.pages ? `z ${b.pages} ${b.pages === 1 ? 'strony' : 'stron'}` : 'Liczbę stron dodasz w edycji książki.'}</p>
       <button class="btn primary wide" style="margin-top:18px">Zapisz</button>
     </form>`,
    { label: 'Bieżąca strona' }
  );
  const f = rec.body.querySelector('form');
  rec.body.querySelectorAll('[data-d]').forEach((btn) => (btn.onclick = () => (f.page.value = Math.max(0, (Number(f.page.value) || 0) + Number(btn.dataset.d)))));
  f.onsubmit = async (e) => {
    e.preventDefault();
    let page = Math.max(0, Number(String(f.page.value).replace(/\D/g, '')) || 0);
    if (b.pages) page = Math.min(page, b.pages);
    if (rec.closed) return; // double tap
    rec.close();
    await store.updateBook(id, { currentPage: page });
    if (b.pages && page >= b.pages && b.status === 'czytam') {
      if (await ui.confirmSheet({ title: 'Koniec książki?', text: 'To już ostatnia strona. Przenieść na półkę „Przeczytane”?', ok: 'Tak, przeczytana' })) {
        await store.setStatus(id, 'przeczytane');
        ui.toast('Gratulacje! Kolejna przeczytana.');
      }
    }
  };
  setTimeout(() => f.page.select(), 300);
}

// ---------- reads (start/finish dates) ----------
function openRead(bookId, readId) {
  const r = readId ? store.get('reads', readId) : { bookId, started: todayStr(), finished: null };
  const rec = ui.openSheet(
    `<div class="sheet-head"><h2>${readId ? 'Czytanie' : 'Nowe czytanie'}</h2></div>
     <form>
       <div class="field-row">
         <div class="field"><span class="t-label">Początek</span><input type="date" name="started" value="${esc(r.started || '')}"></div>
         <div class="field"><span class="t-label">Koniec</span><input type="date" name="finished" value="${esc(r.finished || '')}"></div>
       </div>
       <label class="check"><input type="checkbox" name="abandoned" ${r.abandoned ? 'checked' : ''}> Porzucone w trakcie</label>
       <div class="btn-row" style="margin-top:20px">${readId ? `<button type="button" class="btn danger" data-del>Usuń</button>` : ''}<button class="btn primary">Zapisz</button></div>
     </form>`,
    { label: 'Czytanie' }
  );
  const f = rec.body.querySelector('form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.started.value && f.finished.value && f.finished.value < f.started.value) return ui.toast('Koniec nie może być przed początkiem');
    if (rec.closed) return; // double tap
    rec.close();
    await store.put('reads', { ...r, started: f.started.value || null, finished: f.finished.value || null, abandoned: f.abandoned.checked });
  };
  rec.body.querySelector('[data-del]')?.addEventListener('click', async () => {
    rec.close();
    await store.del('reads', readId);
    ui.toast('Usunięto czytanie');
  });
}

// ---------- edit ----------
export function openEdit(id) {
  const b = store.book(id);
  if (!b) return;
  const known = store.allTags();
  let tags = [...(b.tags || [])];
  let photoId = b.coverPhotoId || '';
  let saved = false;
  const rec = ui.openSheet(
    `<div class="sheet-head"><h2>Edytuj książkę</h2><button class="icon-btn" data-close aria-label="Zamknij">${icon('close')}</button></div>
     <form class="edit" autocomplete="off">
       <div class="edit-cover">
         <div class="ec-preview">${ui.coverHTML(b, 'm')}</div>
         <div class="ec-actions">
           <label class="btn">${icon('camera')}Zdjęcie okładki<input type="file" accept="image/*" capture="environment" hidden data-photo></label>
           ${photoId ? `<button type="button" class="btn ghost" data-nophoto>Usuń zdjęcie</button>` : ''}
           <p class="faint t-sm">Bez zdjęcia pokażę okładkę z katalogu albo zaprojektowaną obwolutę.</p>
         </div>
       </div>
       <div class="field"><span class="t-label">Tytuł</span><input name="title" required value="${esc(b.title)}"></div>
       <div class="field"><span class="t-label">Autor</span><input name="author" value="${esc(b.author)}"></div>
       <div class="field-row">
         <div class="field"><span class="t-label">Liczba stron</span><input name="pages" inputmode="numeric" value="${b.pages || ''}"></div>
         <div class="field"><span class="t-label">Bieżąca strona</span><input name="currentPage" inputmode="numeric" value="${b.currentPage || ''}"></div>
       </div>
       <div class="field-row">
         <div class="field"><span class="t-label">Rok wydania</span><input name="year" inputmode="numeric" value="${b.year || ''}"></div>
         <div class="field"><span class="t-label">Format</span><select name="format">${FORMATS.map(([k, l]) => `<option value="${k}" ${b.format === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
       </div>
       <div class="field"><span class="t-label">Gatunek</span><input name="genre" value="${esc(b.genre)}" placeholder="np. powieść, reportaż, fantastyka"></div>
       <div class="field"><span class="t-label">Wydawca</span><input name="publisher" value="${esc(b.publisher)}"></div>
       <div class="field"><span class="t-label">ISBN</span><input name="isbn" inputmode="numeric" value="${esc(b.isbn)}"></div>
       <div class="field"><span class="t-label">Tagi</span>
         <div class="chips tag-edit"></div>
         <input name="tag" placeholder="Nowy tag i Enter" enterkeyhint="done">
       </div>
       <div class="btn-row" style="margin-top:8px"><button type="button" class="btn" data-close>Anuluj</button><button class="btn primary">Zapisz</button></div>
     </form>`,
    {
      cls: 'tall',
      label: 'Edytuj książkę',
      // a photo taken but never saved must not stay behind in the database
      onClose: () => !saved && photoId && photoId !== b.coverPhotoId && store.delPhoto(photoId),
    }
  );
  const f = rec.body.querySelector('form');
  const tagBox = f.querySelector('.tag-edit');
  const drawTags = () => {
    const sugg = known.filter((t) => !tags.includes(t)).slice(0, 8);
    tagBox.innerHTML = tags.map((t) => `<button type="button" class="chip on" data-rm="${esc(t)}">${esc(t)} ×</button>`).join('') + sugg.map((t) => `<button type="button" class="chip" data-addtag="${esc(t)}">+ ${esc(t)}</button>`).join('');
  };
  drawTags();
  tagBox.onclick = (e) => {
    const rm = e.target.closest('[data-rm]');
    const ad = e.target.closest('[data-addtag]');
    if (rm) tags = tags.filter((t) => t !== rm.dataset.rm);
    if (ad) tags.push(ad.dataset.addtag);
    drawTags();
  };
  const addTag = () => {
    const v = f.tag.value.trim().toLowerCase().replace(/^#/, '');
    if (v && !tags.includes(v)) tags.push(v);
    f.tag.value = '';
    drawTags();
  };
  f.tag.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };
  const preview = f.querySelector('.ec-preview');
  f.querySelector('[data-photo]').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = await shrinkImage(file, 900);
    const newId = await store.putPhoto(blob, { kind: 'cover', bookId: id });
    if (photoId && photoId !== b.coverPhotoId) await store.delPhoto(photoId);
    photoId = newId;
    preview.innerHTML = ui.coverHTML({ ...b, coverPhotoId: photoId }, 'm');
    ui.hydrate(preview);
  };
  f.querySelector('[data-nophoto]')?.addEventListener('click', (e) => {
    photoId = '';
    preview.innerHTML = ui.coverHTML({ ...b, coverPhotoId: '' }, 'm');
    e.target.remove();
  });
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.tag.value.trim()) addTag();
    const num = (v) => Number(String(v).replace(/\D/g, '')) || null;
    const isbn = cleanIsbn(f.isbn.value) || f.isbn.value.trim();
    const patch = {
      title: f.title.value.trim() || b.title,
      author: f.author.value.trim(),
      pages: num(f.pages.value),
      currentPage: num(f.currentPage.value) || 0,
      year: num(f.year.value),
      format: f.format.value,
      genre: f.genre.value.trim(),
      publisher: f.publisher.value.trim(),
      isbn,
      tags,
      coverPhotoId: photoId,
    };
    if (isbn !== b.isbn && !b.coverUrl?.includes('/id/')) patch.coverUrl = sources.coverForIsbn(isbn);
    saved = true;
    if (b.coverPhotoId && b.coverPhotoId !== photoId) await store.delPhoto(b.coverPhotoId);
    rec.close();
    await store.updateBook(id, patch);
    ui.toast('Zapisano');
  };
}
