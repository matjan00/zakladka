// Import of Kindle "My Clippings.txt": parse, match to library books, preview, save as quotes.
import * as store from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { esc, norm, plN, uid, ymd, todayStr } from './util.js';
import { parseClippings, matchBook } from './kindle-parse.js';

const MAX_BYTES = 20 * 1024 * 1024;

export async function importClippingsFile(file) {
  if (file.size > MAX_BYTES) return ui.toast('Ten plik jest za duży jak na My Clippings.txt');
  let parsed;
  try {
    parsed = parseClippings(await file.text());
  } catch (e) {
    console.error(e);
    return ui.toast('Nie udało się odczytać pliku');
  }
  if (!parsed.highlights.length) {
    return ui.toast(parsed.total ? 'W pliku nie ma zakreśleń do zaimportowania' : 'To nie wygląda na plik My Clippings.txt');
  }
  openPreview(parsed);
}

function openPreview(parsed) {
  const books = store.books();
  const have = new Set(store.all('quotes').map((q) => q.hash).filter(Boolean));
  const haveText = new Set(store.all('quotes').map((q) => `${q.bookId}|${norm(q.text)}`));

  // group by the book line of the file
  const groups = new Map();
  for (const h of parsed.highlights) {
    if (!groups.has(h.titleLine)) groups.set(h.titleLine, { titleLine: h.titleLine, title: h.title, author: h.author, items: [] });
    groups.get(h.titleLine).items.push(h);
  }
  const gs = [...groups.values()].map((g) => {
    const m = matchBook(g.title, g.author, books);
    // "new" = not imported before (by hash) and not already typed in by hand for the matched book
    g.fresh = g.items.filter((h) => !have.has(h.hash) && !(m && haveText.has(`${m.book.id}|${norm(h.text)}`)));
    g.choice = m ? m.book.id : 'new';
    g.matched = !!m;
    return g;
  });
  const totalOld = gs.reduce((n, g) => n + g.items.length - g.fresh.length, 0);
  // shelf for books created from the file: highlights alone don't prove the book was finished
  let newStatus = 'czytam';

  const rec = ui.openSheet('', { cls: 'tall', label: 'Import z Kindle' });
  const draw = () => {
    const count = gs.reduce((n, g) => n + (g.choice === 'skip' ? 0 : g.fresh.length), 0);
    const nNew = gs.filter((g) => g.choice === 'new' && g.fresh.length).length;
    rec.body.innerHTML = `
      <div class="sheet-head"><h2>Import z Kindle</h2><button class="icon-btn" data-close aria-label="Zamknij">${icon('close')}</button></div>
      <p class="t-read muted">Znalazłem ${plN(parsed.highlights.length, 'zakreślenie', 'zakreślenia', 'zakreśleń')} w ${plN(gs.length, 'książce', 'książkach', 'książkach')}.
        ${totalOld ? `Z tego ${totalOld} już masz — pominę ${totalOld === 1 ? 'to' : 'te'}. ` : ''}${parsed.skipped.bookmarks ? `Zakładki (${parsed.skipped.bookmarks}) pomijam. ` : ''}${parsed.skipped.orphanNotes ? `${plN(parsed.skipped.orphanNotes, 'notatka bez zakreślenia', 'notatki bez zakreślenia', 'notatek bez zakreślenia')} pominięte.` : ''}</p>
      <div class="kd-list">${gs
        .map(
          (g, i) => `<section class="kd-group ${g.choice === 'skip' ? 'off' : ''}">
          <p class="t-book">${esc(g.title)}</p>
          <p class="faint t-sm">${esc(g.author || 'autor nieznany')} · ${g.fresh.length ? `<b class="num">${g.fresh.length}</b> ${ui.pl(g.fresh.length, 'nowy', 'nowe', 'nowych')}` : 'nic nowego'}${g.items.length > g.fresh.length ? ` · ${g.items.length - g.fresh.length} już jest` : ''}</p>
          <label class="field"><span class="t-label">${g.matched && g.choice !== 'new' && g.choice !== 'skip' ? 'Dopasowana książka' : 'Książka'}</span>
            <select data-g="${i}">
              <option value="new" ${g.choice === 'new' ? 'selected' : ''}>＋ Utwórz nową: ${esc(g.title)}</option>
              <option value="skip" ${g.choice === 'skip' ? 'selected' : ''}>Pomiń tę książkę</option>
              <optgroup label="Twoja półka">${books
                .slice()
                .sort((a, b) => a.title.localeCompare(b.title, 'pl'))
                .map((b) => `<option value="${esc(b.id)}" ${g.choice === b.id ? 'selected' : ''}>${esc(b.title)}${b.author ? ' — ' + esc(b.author) : ''}</option>`)
                .join('')}</optgroup>
            </select></label>
        </section>`
        )
        .join('')}</div>
      ${nNew ? `<div class="kd-status"><span class="t-label">${nNew === 1 ? 'Nowa książka trafi na półkę' : `${plN(nNew, 'nowa książka', 'nowe książki', 'nowych książek')} trafią na półkę`}</span>
        <div class="chips" role="group" aria-label="Półka dla nowych książek">${[['czytam', 'Czytam'], ['przeczytane', 'Przeczytane']].map(([k, l]) => `<button type="button" class="chip ${newStatus === k ? 'on' : ''}" data-ns="${k}" aria-pressed="${newStatus === k}">${l}</button>`).join('')}</div>
        ${newStatus === 'przeczytane' ? '<p class="faint t-sm" style="margin-top:8px">Za datę przeczytania wezmę dzień ostatniego zakreślenia.</p>' : ''}</div>` : ''}
      <div class="btn-row" style="margin-top:16px"><button class="btn" data-close>Anuluj</button><button class="btn primary" data-go-import ${count ? '' : 'disabled'}>${count ? `Importuj ${plN(count, 'cytat', 'cytaty', 'cytatów')}` : 'Nie ma nic nowego'}</button></div>`;
  };
  draw();
  rec.body.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-g]');
    if (!sel) return;
    gs[+sel.dataset.g].choice = sel.value;
    const y = rec.body.scrollTop;
    draw();
    rec.body.scrollTop = y;
  });
  rec.body.addEventListener('click', async (e) => {
    const ns = e.target.closest('[data-ns]');
    if (ns) {
      newStatus = ns.dataset.ns;
      const y = rec.body.scrollTop;
      draw();
      rec.body.scrollTop = y;
      return;
    }
    const btn = e.target.closest('[data-go-import]');
    if (!btn) return;
    btn.disabled = true;
    try {
      const r = await runImport(gs, newStatus);
      rec.close();
      ui.toast(`Zaimportowano ${plN(r.quotes, 'cytat', 'cytaty', 'cytatów')}${r.newBooks ? ` i ${plN(r.newBooks, 'nową książkę', 'nowe książki', 'nowych książek')}` : ''}`);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      ui.toast('Import się nie udał — spróbuj jeszcze raz');
    }
  });
}

async function runImport(gs, newStatus = 'czytam') {
  let newBooks = 0;
  const quotes = [], reads = [];
  for (const g of gs) {
    if (g.choice === 'skip' || !g.fresh.length) continue;
    let bookId = g.choice;
    if (bookId === 'new') {
      const b = await store.put('books', store.newBook({ id: uid(), title: g.title, author: g.author, format: 'kindle', status: newStatus, source: 'kindle' }), { silent: true });
      bookId = b.id;
      newBooks++;
      // the reading history follows the shelf: an open read for Czytam, a finished one dated by the last highlight
      const days = g.items.map((h) => h.added).filter(Boolean).sort((a, b) => a - b);
      const first = days.length ? ymd(new Date(days[0])) : todayStr();
      const last = days.length ? ymd(new Date(days.at(-1))) : todayStr();
      reads.push(newStatus === 'przeczytane' ? { bookId, started: null, finished: last } : { bookId, started: first, finished: null });
    }
    for (const h of g.fresh)
      quotes.push({ bookId, text: h.text, page: h.page ? String(h.page) : '', tags: [], note: h.note || '', source: 'kindle', hash: h.hash, createdAt: h.added || Date.now() });
  }
  if (reads.length) await store.putMany('reads', reads);
  await store.putMany('quotes', quotes);
  return { quotes: quotes.length, newBooks };
}
