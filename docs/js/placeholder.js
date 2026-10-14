// Screens that later builders will replace. Each describes, warmly and in Polish, what is coming.
import * as store from './store.js';
import { icon } from './icons.js';
import { esc } from './util.js';
import { SOWA_BASE, LEGIMI_NEKLA_URL } from './config.js';

const COPY = {
  sesja: {
    title: 'Sesja czytania',
    lead: 'Włącz stoper, kiedy siadasz do książki. Zakładka policzy, ile stron na godzinę czytasz i kiedy skończysz.',
    items: ['start, pauza i stop — działa nawet po zamknięciu aplikacji', 'na koniec wpisujesz stronę, na której jesteś', '„skończysz za ~3 h 20 min, około czwartku”', 'dopisywanie dawnych sesji'],
  },
  cytaty: {
    title: 'Cytaty',
    lead: 'Twój zeszyt z ulubionymi zdaniami — przepisane albo sfotografowane ze strony.',
    items: ['zdjęcie strony i rozpoznawanie tekstu', 'tagi, notatki i wyszukiwanie', 'cytat dnia na ekranie Start i ładne karty do udostępnienia'],
  },
  statystyki: {
    title: 'Statystyki',
    lead: 'Rok w liczbach: książki i strony w miesiącach, tempo, ulubieni autorzy i gatunki, seria dni z czytaniem.',
    items: ['postęp celu rocznego i tempo', 'średnia długość książki i czas czytania', 'strony na godzinę z sesji', 'podsumowanie roku'],
  },
  'co-dalej': {
    title: 'Co dalej?',
    lead: 'Kiedy nie wiesz, po co sięgnąć — wybierzemy coś z listy „Chcę przeczytać”.',
    items: ['według nastroju, długości, gatunku i formatu', '„dostępne teraz w bibliotece w Nekli”', 'przycisk „Zaskocz mnie”', 'podpowiedzi innych książek ulubionych autorów'],
  },
  biblioteka: {
    title: 'Biblioteka w Nekli',
    lead: 'Sprawdzimy, które książki z listy „Chcę przeczytać” są teraz na półce w bibliotece.',
    items: ['Dostępna / Wypożyczona / Brak w katalogu', 'sprawdzanie jednej książki albo wszystkich naraz', 'link do karty w katalogu biblioteki'],
  },
  goodreads: {
    title: 'Import z Goodreads',
    lead: 'Przeniesiesz całą historię z Goodreads: półki, oceny, daty i recenzje.',
    items: ['podgląd przed importem', 'bez duplikatów', 'okładki dociągane w tle'],
  },
};

export function render(el, ctx) {
  const c = COPY[ctx.route] || { title: 'Wkrótce', lead: '', items: [] };
  const b = ctx.query.get('book') ? store.book(ctx.query.get('book')) : null;
  const isTab = ['sesja', 'cytaty', 'statystyki'].includes(ctx.route);
  el.innerHTML = `
    ${isTab ? '' : `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="Wróć">${icon('back')}</button></div>`}
    <header class="screen-head"><h1 class="t-display">${esc(c.title)}</h1></header>
    ${b ? `<p class="muted">Dla: <b>${esc(b.title)}</b></p>` : ''}
    <section class="soon">
      <p class="t-read">${esc(c.lead)}</p>
      <ul>${c.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <p class="asterism" aria-hidden="true">⁂</p>
      <p class="faint t-sm center">Ten rozdział jest jeszcze w drukarni.</p>
      ${ctx.route === 'biblioteka' ? `<div class="btn-row" style="margin-top:20px">
        <a class="btn" href="${SOWA_BASE}?KatID=0" target="_blank" rel="noopener">${icon('external')}Katalog biblioteki</a>
        <a class="btn" href="${LEGIMI_NEKLA_URL}" target="_blank" rel="noopener">${icon('external')}Darmowe kody Legimi</a></div>` : ''}
    </section>`;
  el.onclick = (e) => {
    if (e.target.closest('[data-act="back"]')) history.length > 1 ? history.back() : ctx.go('start');
  };
}
