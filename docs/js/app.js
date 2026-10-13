// App shell: hash router, bottom navigation, re-render on data changes, service worker + update banner.
import * as store from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { applyTheme } from './theme.js';
import { TABS, ROUTES, DEFAULT_ROUTE } from './routes.js';

const screen = document.getElementById('screen');
const nav = document.getElementById('nav');
const banner = document.getElementById('banner');

let current = null; // { name, params, query, mod, cleanup, key }

/** Navigate: go('ksiazka/abc'), go('polka', { polka: 'czytam' }), go(-1) = back. replace = no history entry. */
export function go(path, query = null, { replace = false } = {}) {
  if (path === -1) return history.back();
  const q = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
  const hash = `#/${String(path).replace(/^#?\/?/, '')}${q === '?' ? '' : q}`;
  ui.closeAllThen(() => {
    if (location.hash === hash) return render(true);
    if (replace) {
      history.replaceState(null, '', hash);
      route();
    } else location.hash = hash;
  });
}

function parse() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [p, qs = ''] = raw.split('?');
  const parts = p.split('/').filter(Boolean).map(decodeURIComponent);
  const name = ROUTES[parts[0]] ? parts[0] : DEFAULT_ROUTE;
  return { name, params: ROUTES[parts[0]] ? parts.slice(1) : [], query: new URLSearchParams(qs), key: raw };
}

function drawNav(tab) {
  nav.innerHTML = TABS.map(
    ([k, label, ic]) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}" ${k === tab ? 'aria-current="page"' : ''}>${icon(ic, 23)}<span>${label}</span></button>`
  ).join('');
}

const scrollOf = new Map();
let loadSeq = 0;
async function route() {
  const r = parse();
  if (current) scrollOf.set(current.key, scrollY);
  const def = ROUTES[r.name];
  drawNav(def.tab);
  const seq = ++loadSeq;
  let mod;
  try {
    mod = await def.load();
  } catch (e) {
    console.error(e);
    screen.innerHTML = ui.empty({ title: 'Nie udało się otworzyć ekranu', text: 'Sprawdź połączenie i odśwież stronę.' });
    return;
  }
  if (seq !== loadSeq) return;
  current?.cleanup?.();
  current = { ...r, def, mod, cleanup: null };
  render(false);
  screen.classList.remove('enter');
  void screen.offsetWidth;
  screen.classList.add('enter');
  scrollTo(0, scrollOf.get(r.key) || 0);
  document.title = def.title && r.name !== 'start' ? `${def.title} · Zakładka` : 'Zakładka';
}

function ctx() {
  return { route: current.name, params: current.params, query: current.query, go, store, ui, refresh: () => render(true) };
}

/** (Re-)render the current route. keepScroll keeps the position and what the user is typing (data-keep). */
function render(keepScroll) {
  if (!current) return;
  const fn = current.mod[current.def.fn || 'render'];
  if (typeof fn !== 'function') {
    screen.innerHTML = ui.empty({ title: 'Tego ekranu jeszcze nie ma' });
    return;
  }
  const kept = keepScroll
    ? [...screen.querySelectorAll('[data-keep]')].map((el) => ({ key: el.dataset.keep, value: el.value, focused: document.activeElement === el, pos: el.selectionStart }))
    : [];
  const y = scrollY;
  current.cleanup?.();
  screen.onclick = screen.oninput = screen.onchange = screen.onkeydown = screen.onsubmit = null;
  try {
    const c = fn(screen, ctx());
    current.cleanup = typeof c === 'function' ? c : null;
  } catch (e) {
    console.error(e);
    screen.innerHTML = ui.empty({ title: 'Coś poszło nie tak', text: String(e.message || e) });
  }
  ui.hydrate(screen);
  for (const k of kept) {
    const el = screen.querySelector(`[data-keep="${k.key}"]`);
    if (!el) continue;
    if (el.value !== k.value) {
      el.value = k.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (k.focused) {
      el.focus({ preventScroll: true });
      try {
        el.setSelectionRange(k.pos, k.pos);
      } catch {}
    }
  }
  if (keepScroll) scrollTo(0, y);
}

let pending = false;
store.on((detail) => {
  if (detail.store === 'settings' || detail.store === '*') applyTheme();
  if (!current) return;
  if (current.mod.onChange?.(detail, ctx()) === true) return;
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    render(true);
  });
});

nav.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  const tab = b.dataset.tab;
  if (current?.name === tab && !current.params.length) return scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  go(tab);
});
// any element with data-go="ksiazka/123" navigates
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-go]');
  if (!a || e.defaultPrevented) return;
  e.preventDefault();
  go(a.dataset.go);
});
addEventListener('hashchange', route);
// a new day (app left open overnight) → redraw dates and "today"
let day = new Date().toDateString();
setInterval(() => {
  const d = new Date().toDateString();
  if (d !== day) {
    day = d;
    render(true);
  }
}, 60000);

// ---------- service worker + "Aktualizacja dostępna" ----------
function showUpdate(reg) {
  banner.innerHTML = `<p>Aktualizacja dostępna</p><button class="btn" data-upd>Odśwież</button><button class="icon-btn" data-x aria-label="Później">${icon('close', 20)}</button>`;
  banner.hidden = false;
  banner.querySelector('[data-upd]').onclick = () => {
    banner.querySelector('[data-upd]').disabled = true;
    if (reg.waiting) reg.waiting.postMessage('skipWaiting');
    else location.reload();
  };
  banner.querySelector('[data-x]').onclick = () => (banner.hidden = true);
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg);
        });
      });
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
    })
    .catch(() => {}); // the local preview browser cannot register it; that's fine
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

// ---------- boot ----------
(async () => {
  try {
    await store.init();
  } catch (e) {
    console.error(e);
    screen.innerHTML = ui.empty({ title: 'Nie mogę otworzyć danych', text: 'Przeglądarka blokuje pamięć tej strony (tryb prywatny?). Otwórz Zakładkę w zwykłej karcie Chrome.' });
    return;
  }
  applyTheme();
  if (!location.hash) history.replaceState(null, '', `#/${DEFAULT_ROUTE}`);
  route();
})();
