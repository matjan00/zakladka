// Start: what I'm reading now, the yearly goal, and slots for "cytat dnia" / "co dalej".
import * as store from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { esc, plN, shortTitle } from './util.js';
import { openAdd, openPageSheet } from './books.js';
import { fillSlot } from './slots.js';
import { runningSession, todayMinutes, activeMs, durText } from './session.js';
import { isStandalone, install, onInstallChange } from './install.js';

const greet = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Dobranoc' : h < 18 ? 'Dzień dobry' : 'Dobry wieczór';
};
const dayFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
const cap = (s) => s.charAt(0).toLocaleUpperCase('pl-PL') + s.slice(1);

/** Finished reads (not abandoned) in a given year. */
export function finishedIn(year) {
  return store.where('reads', (r) => r.finished && !r.abandoned && r.finished.startsWith(String(year)) && store.book(r.bookId));
}

/** Pace against the yearly goal: { text: '3 książki przed planem', tone: 'ok'|'warn' } */
export function goalPace(done, goal, now = new Date()) {
  const y = now.getFullYear();
  const start = new Date(y, 0, 1), end = new Date(y + 1, 0, 1);
  const expected = goal * ((now - start) / (end - start));
  const diff = done - expected;
  if (done >= goal) return { text: 'Cel osiągnięty — każda kolejna to nagroda.', tone: 'ok' };
  if (diff >= 1) return { text: `${plN(Math.floor(diff), 'książka', 'książki', 'książek')} przed planem`, tone: 'ok' };
  if (diff <= -1) return { text: `${plN(Math.ceil(-diff - 0.0001), 'książka', 'książki', 'książek')} za planem`, tone: 'warn' };
  return { text: 'Idziesz równo z planem', tone: 'ok' };
}

let unsubInstall = null;
export function render(el, ctx) {
  const books = store.books();
  const reading = books.filter((b) => b.status === 'czytam').sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const year = new Date().getFullYear();
  const goal = Number(store.setting('yearGoal')) || 0;
  const done = finishedIn(year).length;
  // a brand-new shelf gets no "behind schedule" message: only once something has been finished
  const everFinished = store.where('reads', (r) => r.finished && !r.abandoned).length > 0;
  const pace = goal && everFinished ? goalPace(done, goal) : null;
  const left = Math.max(0, goal - done);
  const showInstall = !isStandalone();

  el.innerHTML = `
    <header class="home-head">
      ${ui.LAMP}
      <button class="icon-btn hh-set" data-go="ustawienia" aria-label="Ustawienia">${icon('settings')}</button>
      <span class="plate">Czytelnia</span>
      <h1 class="t-display">${greet()}</h1>
      <p class="hh-date">${esc(cap(dayFmt.format(new Date())))}</p>
    </header>
    ${showInstall ? `<button class="install-top" data-act="install">${icon('install', 20)}<span class="grow">Zainstaluj na telefonie</span>${icon('chev', 18)}</button>` : ''}

    ${books.length ? '' : `<section class="welcome">
      ${ui.empty({ title: 'Witaj w Zakładce', text: 'Tu zamieszka Twoja biblioteczka: co czytasz, co chcesz przeczytać i co już za Tobą. Zacznij od książki, którą masz teraz pod ręką.', action: 'Dodaj pierwszą książkę', actionAttr: 'data-act="add"' })}
    </section>`}

    ${sessionCard()}

    ${reading.length ? `<section class="now">
      ${reading.length > 1 ? `<div class="section-head"><h2>Czytam teraz</h2><span class="faint t-sm num">${plN(reading.length, 'książka', 'książki', 'książek')}</span></div>` : ''}
      <div class="now-list ${reading.length > 1 ? 'many' : ''}">${reading.map((b) => nowCard(b, reading.length === 1)).join('')}</div>
    </section>` : books.length ? `<section class="now">
      <div class="section-head"><h2>Czytam teraz</h2></div>
      <div class="panel now-empty"><p class="t-read">Nic nie jest teraz otwarte. Weź coś z listy „Chcę przeczytać” albo dodaj nową książkę.</p>
      <div class="btn-row" style="margin-top:14px"><button class="btn" data-go="polka?polka=chce">Chcę przeczytać</button><button class="btn primary" data-act="add">${icon('plus')}Dodaj</button></div></div>
    </section>` : ''}

    ${goal ? `<section class="section goal">
      <div class="section-head"><h2>Cel na ${year}</h2></div>
      ${ui.tokens(done, goal)}
      <div class="goal-text">
        <p class="muted">${done ? `<b class="num">${done} z ${goal}.</b> ${done >= goal ? 'Wszystkie numerki wypolerowane.' : 'Jedna książka, jeden mosiężny numerek.'}` : 'Jeszcze nic w tym roku — pierwsza będzie najprzyjemniejsza.'}</p>
        ${pace ? `<p class="pace ${pace.tone}">${esc(pace.text)}</p>` : ''}
        ${left && done ? `<p class="faint t-sm">Do celu brakuje ${plN(left, 'książki', 'książek', 'książek')}.</p>` : ''}
      </div>
    </section>` : ''}

    <section class="section slot" data-slot="cytat-dnia">
      <div class="section-head"><h2>Cytat dnia</h2></div>
      <figure class="quote-card placeholder">
        <blockquote>Tu co rano pojawi się jedno z zapisanych przez Ciebie zdań.</blockquote>
        <figcaption class="faint t-sm">Zbieraj ulubione fragmenty w zakładce <button class="link-btn" data-go="cytaty">Cytaty</button></figcaption>
      </figure>
    </section>

    <section class="section slot" data-slot="co-dalej">
      <div class="section-head"><h2>Co dalej?</h2></div>
      <button class="panel next-card" data-go="co-dalej">
        ${icon('compass', 28)}
        <span class="grow"><b>Nie wiesz, po co sięgnąć?</b><span class="muted t-sm">Wybiorę coś z „Chcę przeczytać” według nastroju, długości i tego, co czeka w bibliotece.</span></span>
        ${icon('chev', 18, 'chev')}
      </button>
    </section>

    <nav class="section home-links" aria-label="Więcej">
      <button class="row" data-go="biblioteka">${icon('library')}<span class="grow">Biblioteka w Nekli</span>${icon('chev', 18, 'chev')}</button>
      <button class="row" data-go="goodreads">${icon('upload')}<span class="grow">Import z Goodreads</span>${icon('chev', 18, 'chev')}</button>
      <button class="row" data-go="ustawienia">${icon('settings')}<span class="grow">Ustawienia i kopia zapasowa</span>${icon('chev', 18, 'chev')}</button>
    </nav>`;

  for (const s of el.querySelectorAll('[data-slot]')) fillSlot(s.dataset.slot, s, ctx);

  el.onclick = (e) => {
    const t = e.target.closest('[data-act],[data-book],[data-page]');
    if (!t) return;
    if (t.dataset.page) return openPageSheet(t.dataset.page);
    if (t.dataset.book) return ctx.go(`ksiazka/${t.dataset.book}`);
    const a = t.dataset.act;
    if (a === 'add') openAdd({ status: 'czytam' });
    if (a === 'install') install();
  };
  unsubInstall?.();
  unsubInstall = onInstallChange(() => ctx.refresh());
  return () => (unsubInstall?.(), (unsubInstall = null));
}

/** The book in hand, lying on the green leather desk under the lamp. */
function nowCard(b, titled) {
  const p = store.progressOf(b);
  const left = b.pages ? Math.max(0, b.pages - (b.currentPage || 0)) : null;
  const { cls, no } = ui.callNo(b);
  return `<article class="now-card desk">
    ${titled ? '<h2>Czytam teraz</h2>' : ''}
    <div class="nc-book">
      <button class="nc-cover" data-book="${esc(b.id)}" aria-label="Otwórz ${esc(b.title)}">${ui.coverHTML(b, 'm', { ribbon: true })}</button>
      <div class="nc-body">
        <button class="nc-title t-title" data-book="${esc(b.id)}" aria-label="${esc(b.title)}">${esc(shortTitle(b.title))}</button>
        <p class="nc-author">${esc(b.author || '')}</p>
        <span class="sig">Sygn. ${esc(cls)} ${esc(no)}</span>
        ${b.pages ? `<div class="nc-progress">${ui.thread(p)}<p class="t-sm num"><b>${Math.round(p * 100)}%</b><span class="faint"> · strona&nbsp;${b.currentPage || 0}&nbsp;z&nbsp;${b.pages}</span></p>${left ? `<p class="faint t-sm">zostało ${plN(left, 'strona', 'strony', 'stron')}</p>` : ''}</div>` : `<p class="faint t-sm">strona ${b.currentPage || 0}</p>`}
      </div>
    </div>
    <div class="nc-btns">
      <button class="btn" data-page="${esc(b.id)}">Zapisz stronę</button>
      <button class="btn primary" data-go="sesja?book=${esc(b.id)}">${icon('timer')}Sesja</button>
    </div>
  </article>`;
}

/** Running session / today's reading minutes (from session.js). Empty when there is nothing to say. */
function sessionCard() {
  const run = runningSession();
  const b = run && store.book(run.bookId);
  const min = todayMinutes();
  if (!b && !min) return '';
  const text = b
    ? `${run.pausedAt ? 'Przerwa' : 'Trwa sesja'} · ${durText(activeMs(run))} · ${esc(b.title)}`
    : `Dziś czytasz już ${min} min`;
  return `<section class="section ss-home"><button class="panel next-card" data-go="sesja${b ? '?book=' + esc(b.id) : ''}">${icon('timer', 26)}
    <span class="grow"><b>${b ? 'Wróć do timera' : 'Dzisiejsze czytanie'}</b><span class="muted t-sm">${text}</span></span>${icon('chev', 18, 'chev')}</button></section>`;
}
