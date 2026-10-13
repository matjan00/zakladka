// Route table. Hash URLs look like  #/polka?polka=czytam  or  #/ksiazka/<id>.
// Each route lazy-loads a module and calls its exported function (default `render`) as fn(container, ctx).
//
// TO ADD A FEATURE: write js/<feature>.js exporting `render(container, ctx)`, then point its route's `load`
// at it (replace the placeholder line). ctx = { route, params, query, go, store, ui, refresh }.
// A module may also export `onChange(detail, ctx)`; return true from it to skip the automatic re-render
// that otherwise happens whenever the store changes. A render may return a cleanup function.

export const TABS = [
  ['start', 'Start', 'home'],
  ['polka', 'Półka', 'shelf'],
  ['sesja', 'Sesja', 'timer'],
  ['cytaty', 'Cytaty', 'quote'],
  ['statystyki', 'Statystyki', 'stats'],
];

const placeholder = () => import('./placeholder.js');

export const ROUTES = {
  start: { tab: 'start', title: 'Start', load: () => import('./home.js') },
  polka: { tab: 'polka', title: 'Półka', load: () => import('./books.js') },
  ksiazka: { tab: 'polka', title: 'Książka', load: () => import('./books.js'), fn: 'renderDetail' }, // #/ksiazka/<id>
  ustawienia: { tab: 'start', title: 'Ustawienia', load: () => import('./settings.js') },

  // ---- placeholders: later builders replace `load` with their own module ----
  sesja: { tab: 'sesja', title: 'Sesja', load: () => import('./session.js') }, // timer & sessions (#/sesja?book=<id>)
  cytaty: { tab: 'cytaty', title: 'Cytaty', load: () => import('./quotes.js') }, // quotes, OCR, Kindle import (#/cytaty?book=<id>)
  statystyki: { tab: 'statystyki', title: 'Statystyki', load: () => import('./stats.js') },
  'co-dalej': { tab: 'start', title: 'Co dalej?', load: () => import('./next.js') },
  biblioteka: { tab: 'polka', title: 'Biblioteka w Nekli', load: () => import('./library.js') },
  goodreads: { tab: 'polka', title: 'Import z Goodreads', load: () => import('./goodreads.js') },
};

export const DEFAULT_ROUTE = 'start';
