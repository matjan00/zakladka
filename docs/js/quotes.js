// Cytaty: a commonplace book. List + search + filters, add/edit (by hand, OCR photo, Kindle clippings),
// "cytat dnia" for the Start slot, and "share as image" (canvas card).
// Exports: render (tab), renderQuoteOfDay (slot), renderBookQuotes (book detail hook), openQuoteEditor, shareQuote.
import * as store from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { esc, norm, plN, debounce, hash, todayStr } from './util.js';

const view = { q: '', tag: '' };

export const quotes = () => store.all('quotes');
const byNewest = (a, b) => (b.createdAt || b.created || 0) - (a.createdAt || a.created || 0) || String(a.id).localeCompare(String(b.id));
const bookOf = (q) => (q.bookId ? store.book(q.bookId) : null);
const sourceLine = (q) => {
  const b = bookOf(q);
  return b ? `<b>${esc(b.title)}</b>${b.author ? ` · ${esc(b.author)}` : ''}` : '<b>Bez książki</b>';
};

function quoteHTML(q, { compact = false } = {}) {
  const tags = q.tags || [];
  return `<article class="q ${compact ? 'compact' : ''}" data-q="${esc(q.id)}">
    <blockquote class="q-text"><button class="q-open" data-edit="${esc(q.id)}" aria-label="Otwórz cytat">${esc(q.text)}</button></blockquote>
    ${q.note ? `<p class="q-note">${esc(q.note)}</p>` : ''}
    <footer class="q-foot">
      ${compact /* on the book's own page title and author are already in the header */
        ? q.page ? `<p class="q-src"><span class="num faint">s.&nbsp;${esc(q.page)}</span></p>` : ''
        : `<p class="q-src">${sourceLine(q)}${q.page ? ` <span class="num faint">· s.&nbsp;${esc(q.page)}</span>` : ''}</p>`}
      ${tags.length && !compact ? `<div class="q-tags">${tags.map((t) => `<button class="q-tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
      ${compact ? '' : `<button class="icon-btn q-share" data-share="${esc(q.id)}" aria-label="Udostępnij jako obraz">${icon('upload', 20)}</button>`}
    </footer>
  </article>`;
}

function filtered(bookId) {
  const q = norm(view.q);
  return quotes()
    .filter((x) => (!bookId || x.bookId === bookId) && (!view.tag || (x.tags || []).includes(view.tag)))
    .filter((x) => !q || norm(`${x.text} ${x.note || ''} ${(x.tags || []).join(' ')} ${bookOf(x)?.title || ''} ${bookOf(x)?.author || ''}`).includes(q))
    .sort(byNewest);
}

// ---------- the tab ----------
export function render(el, ctx) {
  const bookId = ctx.query.get('book') || '';
  const all = quotes();
  const cur = bookId ? store.book(bookId) : null;
  const tags = [...new Set(all.flatMap((x) => x.tags || []))].sort((a, b) => a.localeCompare(b, 'pl'));
  const bookIds = [...new Set(all.map((x) => x.bookId).filter((id) => id && store.book(id)))];
  if (bookId && !bookIds.includes(bookId) && cur) bookIds.push(bookId);
  const books = bookIds.map((id) => store.book(id)).sort((a, b) => a.title.localeCompare(b.title, 'pl'));
  if (view.tag && !tags.includes(view.tag)) view.tag = '';
  const list = filtered(bookId);

  el.innerHTML = `
    <header class="screen-head">
      <h1 class="t-display">Cytaty</h1>
      <button class="icon-btn" data-act="add" aria-label="Dodaj cytat">${icon('plus')}</button>
    </header>
    ${cur ? `<p class="q-filter-note muted">Z książki <b>${esc(cur.title)}</b> · <button class="link-btn" data-act="clear-book">pokaż wszystkie</button></p>` : ''}
    ${all.length ? `
    <div class="q-tools">
      <label class="search grow">${icon('search')}<input class="input" type="search" data-keep="q-q" placeholder="Szukaj w cytatach" value="${esc(view.q)}" aria-label="Szukaj w cytatach"></label>
      ${books.length > 1 || (books.length === 1 && !cur) ? `<label class="field q-book-pick"><span class="t-label">Książka</span><select data-act="book" aria-label="Filtruj po książce"><option value="">Wszystkie książki</option>${books.map((b) => `<option value="${esc(b.id)}" ${b.id === bookId ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></label>` : ''}
    </div>
    ${tags.length ? `<div class="chips q-tagbar">${tags.map((t) => `<button class="chip ${view.tag === t ? 'on' : ''}" data-tag="${esc(t)}">${icon('tag')}${esc(t)}</button>`).join('')}</div>` : ''}` : ''}
    <div class="q-body">${listBody(list, all.length, bookId)}</div>`;

  el.onclick = (e) => {
    const t = e.target.closest('[data-act],[data-edit],[data-share],[data-tag]');
    if (!t) return;
    if (t.dataset.share) return shareQuote(store.get('quotes', t.dataset.share));
    if (t.dataset.edit) return openQuoteEditor({ id: t.dataset.edit });
    if (t.dataset.tag != null && !t.dataset.act) {
      view.tag = view.tag === t.dataset.tag ? '' : t.dataset.tag;
      return ctx.refresh();
    }
    const a = t.dataset.act;
    if (a === 'add') return openAddMenu({ bookId });
    if (a === 'clear-book') return ctx.go('cytaty', null, { replace: true });
    if (a === 'add-first') return openQuoteEditor({ bookId });
  };
  el.onchange = (e) => {
    if (e.target.dataset.act === 'book') ctx.go('cytaty', e.target.value ? { book: e.target.value } : null, { replace: true });
  };
  const input = el.querySelector('[data-keep="q-q"]');
  if (input)
    input.oninput = debounce(() => {
      view.q = input.value;
      const body = el.querySelector('.q-body');
      body.innerHTML = listBody(filtered(bookId), all.length, bookId);
    }, 120);
}

function listBody(list, total, bookId) {
  if (!total)
    return ui.empty({
      title: 'Twój zeszyt z cytatami jest pusty',
      text: 'Przepisz zdanie, które Cię zatrzymało, sfotografuj stronę albo wczytaj zakreślenia z Kindle.',
      action: 'Dodaj pierwszy cytat',
      actionAttr: 'data-act="add-first"',
    });
  if (!list.length) return `<div class="empty"><h3>Nic nie znalazłem</h3><p>Zmień szukaną frazę albo wyczyść filtry.</p></div>`;
  return `<p class="faint t-sm num q-count">${plN(list.length, 'cytat', 'cytaty', 'cytatów')}</p><div class="q-list">${list.map((q) => quoteHTML(q)).join('')}</div><p class="asterism" aria-hidden="true">⁂</p>`;
}

// ---------- add menu ----------
function openAddMenu({ bookId } = {}) {
  const rec = ui.openSheet(
    `<div class="sheet-head"><h2>Dodaj cytat</h2><button class="icon-btn" data-close aria-label="Zamknij">${icon('close')}</button></div>
     <div class="list q-menu">
       <button class="row" data-m="type">${icon('edit')}<span class="grow"><b>Wpisz lub wklej</b><br><span class="faint t-sm">Przepisz zdanie z książki</span></span>${icon('chev', 18, 'chev')}</button>
       <button class="row" data-m="ocr">${icon('camera')}<span class="grow"><b>Zdjęcie strony</b><br><span class="faint t-sm">Rozpoznam tekst, a Ty zaznaczysz fragment</span></span>${icon('chev', 18, 'chev')}</button>
       <label class="row" role="button" tabindex="0">${icon('book')}<span class="grow"><b>Import z Kindle</b><br><span class="faint t-sm">Plik „My Clippings.txt” z czytnika</span></span>${icon('chev', 18, 'chev')}<input type="file" accept=".txt,text/plain" hidden data-kindle></label>
     </div>`,
    { label: 'Dodaj cytat' }
  );
  rec.body.onclick = (e) => {
    const m = e.target.closest('[data-m]')?.dataset.m;
    if (m === 'type') (rec.close(), openQuoteEditor({ bookId }));
    if (m === 'ocr') (rec.close(), startOcr({ bookId }));
  };
  rec.body.querySelector('label.row').onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.currentTarget.querySelector('input').click());
  rec.body.querySelector('[data-kindle]').onchange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    rec.close();
    const m = await import('./kindle.js');
    m.importClippingsFile(file);
  };
}

export async function startOcr({ bookId } = {}) {
  try {
    const m = await import('./ocr.js');
    m.openOcr({ onUse: (text) => openQuoteEditor({ bookId, text, source: 'ocr' }) });
  } catch (e) {
    console.error(e);
    ui.toast('Nie udało się otworzyć rozpoznawania tekstu');
  }
}

// ---------- editor ----------
/** openQuoteEditor({ id }) to edit, or { bookId, text, source } to add. */
export function openQuoteEditor(opts = {}) {
  const ex = opts.id ? store.get('quotes', opts.id) : null;
  if (opts.id && !ex) return;
  const q = ex || { bookId: opts.bookId || '', text: opts.text || '', page: '', tags: [], note: '', source: opts.source || 'manual' };
  let tags = [...(q.tags || [])];
  const known = [...new Set(quotes().flatMap((x) => x.tags || []))];
  const books = store.books().sort((a, b) => a.title.localeCompare(b.title, 'pl'));
  const rec = ui.openSheet(
    `<div class="sheet-head"><h2>${ex ? 'Cytat' : 'Nowy cytat'}</h2><button class="icon-btn" data-close aria-label="Zamknij">${icon('close')}</button></div>
     <form class="edit" autocomplete="off">
       <div class="field"><span class="t-label">Cytat</span><textarea name="text" rows="5" required placeholder="Wpisz lub wklej zdanie…">${esc(q.text)}</textarea></div>
       <div class="field"><span class="t-label">Książka</span>
         <select name="bookId"><option value="">— bez książki —</option>${books.map((b) => `<option value="${esc(b.id)}" ${b.id === q.bookId ? 'selected' : ''}>${esc(b.title)}${b.author ? ' — ' + esc(b.author) : ''}</option>`).join('')}</select></div>
       <div class="field-row">
         <div class="field"><span class="t-label">Strona</span><input name="page" inputmode="numeric" value="${esc(q.page || '')}"></div>
         <div class="field"><span class="t-label">Źródło</span><input value="${{ manual: 'Wpisany', ocr: 'Ze zdjęcia', kindle: 'Kindle' }[q.source] || 'Wpisany'}" disabled></div>
       </div>
       <div class="field"><span class="t-label">Tagi</span><div class="chips tag-edit"></div><input name="tag" placeholder="Nowy tag i Enter" enterkeyhint="done"></div>
       <div class="field"><span class="t-label">Moja notatka</span><textarea name="note" rows="2" placeholder="Co o tym myślisz?">${esc(q.note || '')}</textarea></div>
       <div class="btn-row">${ex ? `<button type="button" class="btn danger" data-del>Usuń</button><button type="button" class="btn" data-share>Udostępnij</button>` : `<button type="button" class="btn" data-close>Anuluj</button>`}<button class="btn primary">Zapisz</button></div>
     </form>`,
    { cls: 'tall', label: 'Cytat' }
  );
  const f = rec.body.querySelector('form');
  const tagBox = f.querySelector('.tag-edit');
  const drawTags = () => {
    const sugg = known.filter((t) => !tags.includes(t)).slice(0, 8);
    tagBox.innerHTML = tags.map((t) => `<button type="button" class="chip on" data-rm="${esc(t)}">${esc(t)} ×</button>`).join('') + sugg.map((t) => `<button type="button" class="chip" data-addtag="${esc(t)}">+ ${esc(t)}</button>`).join('');
  };
  drawTags();
  tagBox.onclick = (e) => {
    const rm = e.target.closest('[data-rm]'), ad = e.target.closest('[data-addtag]');
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
    if (e.key === 'Enter' || e.key === ',') (e.preventDefault(), addTag());
  };
  const read = () => ({ ...q, text: f.text.value.trim(), bookId: f.bookId.value, page: f.page.value.trim(), note: f.note.value.trim(), tags });
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.tag.value.trim()) addTag();
    const rec2 = read();
    if (!rec2.text) return ui.toast('Cytat jest pusty');
    if (!ex) rec2.createdAt = Date.now();
    rec.close();
    await store.put('quotes', rec2);
    ui.toast(ex ? 'Zapisano zmiany' : 'Cytat zapisany');
  };
  f.querySelector('[data-share]')?.addEventListener('click', () => shareQuote(read()));
  f.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await ui.confirmSheet({ title: 'Usunąć ten cytat?', ok: 'Usuń', danger: true }))) return;
    rec.close();
    const copy = { ...ex };
    await store.del('quotes', ex.id);
    ui.toast('Cytat usunięty', { action: 'Cofnij', onAction: () => store.put('quotes', copy) });
  });
  if (!ex && !q.text) setTimeout(() => f.text.focus(), 320);
}

// ---------- Start: cytat dnia ----------
/** Deterministic per calendar day. */
export function quoteOfDay(date = todayStr()) {
  const all = quotes().filter((q) => q.text).sort((a, b) => (a.createdAt || a.created || 0) - (b.createdAt || b.created || 0) || String(a.id).localeCompare(String(b.id)));
  return all.length ? all[hash('qotd' + date) % all.length] : null;
}
export function renderQuoteOfDay(el, ctx) {
  const q = quoteOfDay();
  if (!q) return; // the placeholder stays
  const fig = el.querySelector('.quote-card');
  if (!fig) return;
  const b = bookOf(q);
  fig.classList.remove('placeholder');
  fig.innerHTML = `<blockquote>${esc(q.text.length > 380 ? q.text.slice(0, 377).trimEnd() + '…' : q.text)}</blockquote>
    <figcaption class="qod-cap"><span class="t-sm muted">${b ? `<b>${esc(b.title)}</b>${b.author ? ` · ${esc(b.author)}` : ''}` : ''}${q.page ? ` <span class="num" style="white-space:nowrap">· s.&nbsp;${esc(q.page)}</span>` : ''}</span>
    <span class="qod-actions"><button class="icon-btn" data-qod-share aria-label="Udostępnij jako obraz">${icon('upload', 20)}</button><button class="icon-btn" data-qod-all aria-label="Wszystkie cytaty">${icon('chev', 20)}</button></span></figcaption>`;
  fig.onclick = (e) => {
    if (e.target.closest('[data-qod-share]')) return shareQuote(q);
    if (e.target.closest('[data-qod-all]')) return ctx.go('cytaty');
    openQuoteEditor({ id: q.id });
  };
}

// ---------- book detail hook ----------
export function renderBookQuotes(el, bookId, ctx) {
  const list = quotes().filter((q) => q.bookId === bookId).sort(byNewest);
  el.innerHTML = `<div class="section-head"><h2>Cytaty</h2><button class="link-btn" data-qadd>${icon('plus', 18)}Dodaj</button></div>
    ${list.length ? `<div class="q-list">${list.slice(0, 3).map((q) => quoteHTML(q, { compact: true })).join('')}</div>
      ${list.length > 3 ? `<button class="btn wide" style="margin-top:12px" data-go="cytaty?book=${esc(bookId)}">Wszystkie cytaty (${list.length})</button>` : ''}`
      : `<p class="faint">Jeszcze nic nie zapisałeś z tej książki.</p>`}`;
  el.onclick = (e) => {
    if (e.target.closest('[data-qadd]')) return openAddMenu({ bookId });
    const ed = e.target.closest('[data-edit]');
    if (ed) openQuoteEditor({ id: ed.dataset.edit });
  };
}

// ---------- share as image ----------
const FONT_READ = "'Literata', Georgia, serif";
const FONT_UI = "'Bricolage Grotesque', system-ui, sans-serif";

function wrap(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) (out.push(line), (line = w));
      else line = t;
    }
    out.push(line);
  }
  return out;
}

/** Render a quote card (1080×1350) in the app's style. Resolves a canvas. */
export async function quoteCanvas(q) {
  const b = q.bookId ? store.book(q.bookId) : null;
  try {
    await Promise.all([document.fonts.load(`italic 400 48px Literata`), document.fonts.load(`600 36px Literata`), document.fonts.load(`600 26px 'Bricolage Grotesque'`)]);
  } catch {}
  const W = 1080, H = 1350, M = 96;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  // paper
  g.fillStyle = '#F3EEE4';
  g.fillRect(0, 0, W, H);
  // cloth band on top with gilt rules, like the Start header
  g.fillStyle = '#1F4A40';
  g.fillRect(0, 0, W, 150);
  g.fillStyle = '#A9843A';
  g.globalAlpha = 0.7;
  g.fillRect(0, 128, W, 2);
  g.fillRect(0, 136, W, 2);
  g.globalAlpha = 1;
  g.fillStyle = '#EFE6D2';
  g.font = `600 30px ${FONT_UI}`;
  g.textBaseline = 'middle';
  g.letterSpacing = '5px';
  g.fillText('ZAKŁADKA', M, 66);
  g.letterSpacing = '0px';
  // ribbon
  g.fillStyle = '#C23E28';
  g.beginPath();
  g.moveTo(W - M - 44, 0);
  g.lineTo(W - M, 0);
  g.lineTo(W - M, 120);
  g.lineTo(W - M - 22, 100);
  g.lineTo(W - M - 44, 120);
  g.closePath();
  g.fill();
  // opening mark
  g.fillStyle = '#A9843A';
  g.font = `600 220px ${FONT_READ}`;
  g.textBaseline = 'alphabetic';
  g.fillText('„', M - 8, 400);
  // text, auto-fit
  const top = 380, bottom = H - 330, maxW = W - 2 * M;
  let size = 66, lines = [];
  for (; size >= 30; size -= 2) {
    g.font = `italic 400 ${size}px ${FONT_READ}`;
    lines = wrap(g, q.text, maxW);
    if (lines.length * size * 1.42 <= bottom - top) break;
  }
  const maxLines = Math.floor((bottom - top) / (size * 1.42));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[\s,.;:]*$/, '') + '…';
  }
  g.fillStyle = '#1C1A16';
  g.font = `italic 400 ${size}px ${FONT_READ}`;
  const blockH = lines.length * size * 1.42;
  let y = top + Math.max(0, (bottom - top - blockH) / 2) + size;
  for (const l of lines) (g.fillText(l, M, y), (y += size * 1.42));
  // fleuron
  const fy = H - 290;
  g.strokeStyle = '#A9843A';
  g.fillStyle = '#A9843A';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(W / 2 - 150, fy);
  g.lineTo(W / 2 - 26, fy);
  g.moveTo(W / 2 + 26, fy);
  g.lineTo(W / 2 + 150, fy);
  g.stroke();
  g.beginPath();
  g.moveTo(W / 2, fy - 12);
  g.lineTo(W / 2 + 12, fy);
  g.lineTo(W / 2, fy + 12);
  g.lineTo(W / 2 - 12, fy);
  g.closePath();
  g.fill();
  for (const dx of [-1, 1]) {
    g.beginPath();
    g.arc(W / 2 + dx * 40, fy, 3.5, 0, 7);
    g.fill();
  }
  // source
  g.textAlign = 'center';
  g.fillStyle = '#1C1A16';
  if (b) {
    let ts = 42;
    g.font = `600 ${ts}px ${FONT_READ}`;
    while (g.measureText(b.title).width > maxW && ts > 26) g.font = `600 ${(ts -= 2)}px ${FONT_READ}`;
    g.fillText(b.title.length > 70 ? b.title.slice(0, 68) + '…' : b.title, W / 2, fy + 78);
    g.fillStyle = '#4B453B';
    g.font = `600 26px ${FONT_UI}`;
    g.letterSpacing = '3px';
    const meta = [b.author, q.page ? `s. ${q.page}` : ''].filter(Boolean).join('  ·  ');
    g.fillText(meta.toUpperCase(), W / 2, fy + 128);
    g.letterSpacing = '0px';
  } else if (q.page) {
    g.fillStyle = '#4B453B';
    g.font = `600 26px ${FONT_UI}`;
    g.fillText(`S. ${q.page}`, W / 2, fy + 78);
  }
  g.textAlign = 'left';
  return c;
}

export async function shareQuote(q) {
  if (!q?.text) return;
  let blob;
  try {
    const c = await quoteCanvas(q);
    blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  } catch (e) {
    console.error(e);
    return ui.toast('Nie udało się zrobić obrazka');
  }
  if (!blob) return ui.toast('Nie udało się zrobić obrazka');
  const file = new File([blob], 'cytat.png', { type: 'image/png' });
  const b = q.bookId ? store.book(q.bookId) : null;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: b?.title || 'Cytat', text: b ? `„${q.text}” — ${b.author ? b.author + ', ' : ''}${b.title}` : `„${q.text}”` });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
    console.warn(e);
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cytat-${todayStr()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  ui.toast('Obrazek zapisany w Pobranych');
}
