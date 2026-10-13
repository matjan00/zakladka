// Start: what I'm reading now, the yearly goal, and slots for "cytat dnia" / "co dalej".
import * as store from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { esc, plN } from './util.js';
import { openAdd, openPageSheet } from './books.js';
import { fillSlot } from './slots.js';
import { runningSession, todayMinutes, activeMs, durText } from './session.js';
import { isStandalone, install, onInstallChange } from './install.js';

const greet = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Dobranoc' : h < 18 ? 'Dzień dobry' : 'Dobry wieczór';
};
const dayFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });

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

function ring(done, goal) {
  const r = 42, c = 2 * Math.PI * r;
  const p = goal ? Math.min(1, done / goal) : 0;
  return `<svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--rule)" stroke-width="6"/>
    ${p ? `<circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--ribbon)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/>` : ''}
  </svg>`;
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
  let dismissed = false;
  try {
    dismissed = !!localStorage.getItem('zakladka.installDismissed');
  } catch {}
  const showInstall = !isStandalone() && !dismissed;

  el.innerHTML = `
    <header class="home-head">
      <div class="grow">
        <p class="hh-date">${esc(dayFmt.format(new Date()))}</p>
        <h1 class="t-display">${greet()}</h1>
      </div>
      <button class="icon-btn" data-go="ustawienia" aria-label="Ustawienia">${icon('settings')}</button>
    </header>

    ${books.length ? '' : `<section class="welcome">
      ${ui.empty({ title: 'Witaj w Zakładce', text: 'Tu zamieszka Twoja biblioteczka: co czytasz, co chcesz przeczytać i co już za Tobą. Zacznij od książki, którą masz teraz pod ręką.', action: 'Dodaj pierwszą książkę', actionAttr: 'data-act="add"' })}
    </section>`}

    ${sessionCard()}

    ${reading.length ? `<section class="now">
      <div class="section-head"><h2>Czytam teraz</h2>${reading.length > 1 ? `<span class="faint t-sm num">${plN(reading.length, 'książka', 'książki', 'książek')}</span>` : ''}</div>
      <div class="now-list ${reading.length > 1 ? 'many' : ''}">${reading.map(nowCard).join('')}</div>
    </section>` : books.length ? `<section class="now">
      <div class="section-head"><h2>Czytam teraz</h2></div>
      <div class="panel now-empty"><p class="t-read">Nic nie jest teraz otwarte. Weź coś z listy „Chcę przeczytać” albo dodaj nową książkę.</p>
      <div class="btn-row" style="margin-top:14px"><button class="btn" data-go="polka?polka=chce">Chcę przeczytać</button><button class="btn primary" data-act="add">${icon('plus')}Dodaj</button></div></div>
    </section>` : ''}

    ${goal ? `<section class="section goal">
      <div class="goal-ring">${ring(done, goal)}<div class="goal-num"><b class="num">${done}</b><span class="num">z ${goal}</span></div></div>
      <div class="goal-text">
        <h2>Cel na ${year}</h2>
        <p class="muted">${done ? plN(done, 'książka przeczytana', 'książki przeczytane', 'książek przeczytanych') : 'Jeszcze nic w tym roku — pierwsza będzie najprzyjemniejsza.'}</p>
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
    </nav>

    ${showInstall ? `<aside class="install-card">
      <div class="grow"><b>Zainstaluj Zakładkę</b><p class="t-sm">Będzie na ekranie telefonu i zadziała bez internetu.</p></div>
      <button class="btn" data-act="install">Zainstaluj</button>
      <button class="icon-btn" data-act="no-install" aria-label="Nie teraz">${icon('close', 20)}</button>
    </aside>` : ''}`;

  for (const s of el.querySelectorAll('[data-slot]')) fillSlot(s.dataset.slot, s, ctx);

  el.onclick = (e) => {
    const t = e.target.closest('[data-act],[data-book],[data-page]');
    if (!t) return;
    if (t.dataset.page) return openPageSheet(t.dataset.page);
    if (t.dataset.book) return ctx.go(`ksiazka/${t.dataset.book}`);
    const a = t.dataset.act;
    if (a === 'add') openAdd({ status: 'czytam' });
    if (a === 'install') install();
    if (a === 'no-install') {
      try {
        localStorage.setItem('zakladka.installDismissed', '1');
      } catch {}
      el.querySelector('.install-card')?.remove();
    }
  };
  unsubInstall?.();
  unsubInstall = onInstallChange(() => ctx.refresh());
  return () => (unsubInstall?.(), (unsubInstall = null));
}

function nowCard(b) {
  const p = store.progressOf(b);
  const left = b.pages ? Math.max(0, b.pages - (b.currentPage || 0)) : null;
  return `<article class="now-card">
    <button class="nc-cover" data-book="${esc(b.id)}" aria-label="Otwórz ${esc(b.title)}">${ui.coverHTML(b, 'l', { ribbon: true })}</button>
    <div class="nc-body">
      <button class="nc-title t-title" data-book="${esc(b.id)}">${esc(b.title)}</button>
      <p class="muted nc-author">${esc(b.author || '')}</p>
      ${b.pages ? `<div class="nc-progress">${ui.thread(p)}<p class="t-sm num"><b>${Math.round(p * 100)}%</b><span class="faint"> · strona ${b.currentPage || 0} z ${b.pages}</span></p>${left ? `<p class="faint t-sm">zostało ${plN(left, 'strona', 'strony', 'stron')}</p>` : ''}</div>` : `<p class="faint t-sm">strona ${b.currentPage || 0}</p>`}
      <div class="btn-row">
        <button class="btn" data-page="${esc(b.id)}">Zapisz stronę</button>
        <button class="btn primary" data-go="sesja?book=${esc(b.id)}">${icon('timer')}Sesja</button>
      </div>
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
