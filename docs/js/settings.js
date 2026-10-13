// Ustawienia: yearly goal, theme, backup export/import (with photos), app version, install.
import * as store from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { APP_VERSION } from './version.js';
import { PROXY_URL, LEGIMI_NEKLA_URL } from './config.js';
import { plN, todayStr } from './util.js';
import { isStandalone, install } from './install.js';

const THEMES = [
  ['auto', 'Jak w telefonie'],
  ['light', 'Jasny'],
  ['dark', 'Nocny'],
];

let persisted = null;
export function render(el, ctx) {
  const goal = store.setting('yearGoal');
  const theme = store.setting('theme');
  const nBooks = store.books().length;
  const nQuotes = store.all('quotes').length;
  if (persisted === null && navigator.storage?.persisted) navigator.storage.persisted().then((p) => ((persisted = p), ctx.refresh())).catch(() => {});

  el.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Wróć">${icon('back')}</button>
      <h1 class="grow">Ustawienia</h1>
    </div>

    <section class="set-group">
      <h2 class="set-title">Cel roczny</h2>
      <div class="goal-input">
        <button class="icon-btn" data-goal="-1" aria-label="Mniej">−</button>
        <input class="num" inputmode="numeric" data-keep="goal" value="${goal}" aria-label="Liczba książek w roku">
        <button class="icon-btn" data-goal="1" aria-label="Więcej">+</button>
        <span class="muted">${ui.pl(goal, 'książka', 'książki', 'książek')} w ${new Date().getFullYear()}</span>
      </div>
      <p class="faint t-sm">To około ${goal ? plN(Math.max(1, Math.round(365 / goal)), 'dzień', 'dni', 'dni') : '—'} na jedną książkę.</p>
    </section>

    <section class="set-group">
      <h2 class="set-title">Wygląd</h2>
      <div class="pills" role="radiogroup" aria-label="Motyw">${THEMES.map(([k, l]) => `<button data-theme="${k}" class="${theme === k ? 'on' : ''}" role="radio" aria-checked="${theme === k}">${k === 'dark' ? icon('moon', 16) : k === 'light' ? icon('sun', 16) : ''} ${l}</button>`).join('')}</div>
      <p class="faint t-sm" style="margin-top:8px">Tryb nocny to ciepłe, przyciemnione kolory do czytania przy lampce.</p>
    </section>

    <section class="set-group">
      <h2 class="set-title">Import</h2>
      <button class="row" data-go="goodreads">${icon('upload')}<span class="grow"><b>Import z Goodreads</b><br><span class="faint t-sm">Półki, oceny, daty i recenzje z pliku CSV</span></span>${icon('chev', 18, 'chev')}</button>
    </section>

    <section class="set-group">
      <h2 class="set-title">Kopia zapasowa</h2>
      <p class="t-read muted">Wszystko jest zapisane tylko w tym telefonie. Raz na jakiś czas zrób kopię — jeden plik z książkami, cytatami, sesjami i zdjęciami.</p>
      <p class="faint t-sm num" style="margin:8px 0 14px">Teraz: ${plN(nBooks, 'książka', 'książki', 'książek')}, ${plN(nQuotes, 'cytat', 'cytaty', 'cytatów')}${persisted === true ? ' · pamięć chroniona przed czyszczeniem' : ''}</p>
      <div class="btn-row">
        <button class="btn primary" data-act="export">${icon('download')}Zapisz kopię</button>
        <label class="btn">${icon('upload')}Wczytaj kopię<input type="file" accept="application/json,.json" hidden data-import></label>
      </div>
    </section>

    ${isStandalone() ? '' : `<section class="set-group">
      <h2 class="set-title">Aplikacja na telefonie</h2>
      <button class="btn wide" data-act="install">${icon('install')}Zainstaluj Zakładkę</button>
    </section>`}

    <section class="set-group">
      <h2 class="set-title">O aplikacji</h2>
      <dl class="card-fields">
        <dt class="t-label">Wersja</dt><dd class="num">${APP_VERSION}</dd>
        <dt class="t-label">Katalog BN</dt><dd>${PROXY_URL ? 'połączony' : 'jeszcze niepodłączony'}</dd>
        <dt class="t-label">Legimi</dt><dd><a href="${LEGIMI_NEKLA_URL}" target="_blank" rel="noopener">kody z biblioteki w Nekli</a></dd>
      </dl>
      <p class="colophon">Zakładka · dziennik czytania</p>
    </section>`;

  const goalInput = el.querySelector('[data-keep="goal"]');
  const saveGoal = (v) => {
    const n = Math.max(0, Math.min(500, Math.round(Number(v) || 0)));
    if (n !== Number(store.setting('yearGoal'))) store.setSetting('yearGoal', n);
  };
  goalInput.onchange = () => saveGoal(goalInput.value);
  goalInput.onkeydown = (e) => e.key === 'Enter' && goalInput.blur();

  el.onclick = async (e) => {
    const t = e.target.closest('[data-act],[data-theme],[data-goal]');
    if (!t) return;
    if (t.dataset.goal) return saveGoal((Number(store.setting('yearGoal')) || 0) + Number(t.dataset.goal));
    if (t.dataset.theme) return store.setSetting('theme', t.dataset.theme);
    const a = t.dataset.act;
    if (a === 'back') return history.length > 1 ? history.back() : ctx.go('start');
    if (a === 'install') return install();
    if (a === 'export') {
      t.disabled = true;
      try {
        const data = await store.exportAll();
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `zakladka-kopia-${todayStr()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        ui.toast('Kopia zapisana w Pobranych');
      } catch (err) {
        console.error(err);
        ui.toast('Nie udało się zapisać kopii');
      }
      t.disabled = false;
    }
  };
  el.onchange = async (e) => {
    if (!e.target.matches('[data-import]')) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let json;
    try {
      json = JSON.parse(await file.text());
      if (json?.app !== 'zakladka') throw new Error('bad');
    } catch {
      return ui.toast('To nie jest plik kopii Zakładki');
    }
    const n = Array.isArray(json.data?.books) ? json.data.books.length : 0;
    const ok = await ui.confirmSheet({
      title: 'Wczytać tę kopię?',
      text: `Kopia z ${new Date(json.exported).toLocaleDateString('pl-PL')} ma ${plN(n, 'książkę', 'książki', 'książek')}. Zastąpi wszystko, co jest teraz w aplikacji.`,
      ok: 'Wczytaj i zastąp',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await store.importAll(json);
      ui.toast(`Wczytano ${plN(r.books, 'książkę', 'książki', 'książek')}`);
    } catch (err) {
      ui.toast(err.message || 'Nie udało się wczytać kopii');
    }
  };
}
