// Statystyki: rok czytelniczy w liczbach. Books are counted by the finish date of their reads.
import * as store from './store.js';
import * as ui from './ui.js';
import { esc, pl, plN, ymd, daysBetween } from './util.js';
import { goalPace } from './home.js';
import { activeMs, speedOf, durText } from './session.js';

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MONTHS_LONG = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const FORMAT_NAMES = { papier: 'Papier', kindle: 'Kindle', audiobook: 'Audiobook' };

let year = null; // selected year (remembered while the app is open)

// ---------- data ----------
function finishedReads(y) {
  return store
    .where('reads', (r) => r.finished && !r.abandoned && String(r.finished).startsWith(String(y)) && store.book(r.bookId))
    .sort((a, b) => a.finished.localeCompare(b.finished));
}
const sessionYear = (s) => new Date(s.start).getFullYear();
const num1 = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

function availableYears() {
  const ys = new Set([new Date().getFullYear()]);
  for (const r of store.all('reads')) if (r.finished && !r.abandoned) ys.add(Number(r.finished.slice(0, 4)));
  for (const s of store.all('sessions')) ys.add(sessionYear(s));
  return [...ys].filter((y) => y > 1900).sort((a, b) => b - a);
}

/** Minutes read per local day, from sessions: Map('YYYY-MM-DD' → minutes). */
function minutesPerDay() {
  const m = new Map();
  for (const s of store.all('sessions')) {
    const d = ymd(new Date(s.start));
    m.set(d, (m.get(d) || 0) + activeMs(s) / 60000);
  }
  return m;
}

function streaks(days) {
  const has = (d) => days.has(ymd(d));
  const step = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  let cur = 0;
  let d = new Date();
  if (!has(d)) d = step(d, -1);
  while (has(d)) (cur++, (d = step(d, -1)));
  let best = 0, run = 0, prev = null;
  for (const k of [...days].sort()) {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return { cur, best };
}

const top = (map, n = 5) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pl')).slice(0, n);

// ---------- charts ----------
function barChart(id, values, { unit, title }) {
  const W = 340, H = 156, top = 20, bot = 24, bw = 20;
  const max = Math.max(1, ...values);
  const slot = W / 12;
  const now = new Date();
  const curM = year === now.getFullYear() ? now.getMonth() : -1;
  const desc = values.map((v, i) => `${MONTHS_LONG[i]}: ${unit(v)}`).join('; ');
  const bars = values
    .map((v, i) => {
      const h = v ? Math.max(3, ((H - top - bot) * v) / max) : 0;
      const x = i * slot + (slot - bw) / 2;
      const y = H - bot - h;
      return `<g>${v ? `<rect class="st-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="2"><title>${MONTHS_LONG[i]}: ${esc(unit(v))}</title></rect>
        <text class="st-val" x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle">${v}</text>` : `<rect class="st-bar-empty" x="${x.toFixed(1)}" y="${H - bot - 1}" width="${bw}" height="1"/>`}
        <text class="st-mon ${i === curM ? 'now' : ''}" x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${MONTHS[i]}</text>
        ${i === curM ? `<rect class="st-now" x="${(x + bw / 2 - 7).toFixed(1)}" y="${H - bot + 3}" width="14" height="2" rx="1"/>` : ''}</g>`;
    })
    .join('');
  return `<svg class="st-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t ${id}-d">
    <title id="${id}-t">${esc(title)}</title><desc id="${id}-d">${esc(desc)}</desc>
    <line class="st-base" x1="0" x2="${W}" y1="${H - bot}" y2="${H - bot}"/>${bars}</svg>`;
}

function heatmap(y, perDay) {
  const cell = 12, gap = 3, step = cell + gap, left = 0, topPad = 16;
  const jan1 = new Date(y, 0, 1);
  const off = (jan1.getDay() + 6) % 7; // Monday-first
  const today = new Date();
  const last = new Date(y, 11, 31);
  const nDays = Math.round((last - jan1) / 86400000) + 1;
  const cols = Math.ceil((off + nDays) / 7);
  const W = cols * step - gap + left, H = topPad + 7 * step - gap;
  let cells = '', labels = '', count = 0, mins = 0;
  for (let i = 0; i < nDays; i++) {
    const d = new Date(y, 0, 1 + i);
    const c = Math.floor((off + i) / 7), r = (off + i) % 7;
    const key = ymd(d);
    const m = perDay.get(key) || 0;
    const future = d > today;
    const lvl = m <= 0 ? 0 : m < 15 ? 1 : m < 30 ? 2 : m < 60 ? 3 : 4;
    if (m > 0) (count++, (mins += m));
    cells += `<rect class="st-cell l${future ? 'f' : lvl}" x="${left + c * step}" y="${topPad + r * step}" width="${cell}" height="${cell}" rx="2"><title>${esc(new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long' }).format(d))}: ${m > 0 ? durText(m * 60000) : 'bez czytania'}</title></rect>`;
    if (d.getDate() === 1) labels += `<text class="st-mon" x="${left + c * step}" y="9">${MONTHS[d.getMonth()]}</text>`;
  }
  return {
    count,
    svg: `<svg class="st-heat" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Kalendarz czytania ${y}: ${plN(count, 'dzień', 'dni', 'dni')} z czytaniem">${labels}${cells}</svg>`,
    scrollTo: y === today.getFullYear() ? Math.floor((off + Math.round((today - jan1) / 86400000)) / 7) * step : 0,
  };
}

function goalRing(done, goal) {
  const r = 42, c = 2 * Math.PI * r;
  const p = goal ? Math.min(1, done / goal) : 0;
  return `<svg class="st-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--rule)" stroke-width="6"/>
    ${p ? `<circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--ribbon)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/>` : ''}</svg>`;
}

const hbars = (rows, unit) => {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return `<ul class="st-hbars">${rows.map(([name, n]) => `<li><span class="st-hname ellipsis">${esc(name)}</span><span class="st-htrack" aria-hidden="true"><i style="width:${(n / max) * 100}%"></i></span><span class="st-hn num">${n}<span class="sr-only"> ${unit(n)}</span></span></li>`).join('')}</ul>`;
};

// ---------- screen ----------
export function render(el, ctx) {
  const thisYear = new Date().getFullYear();
  const years = availableYears();
  if (!year || !years.includes(year)) year = thisYear;
  const y = year;
  const fin = finishedReads(y);
  const books = fin.map((r) => ({ r, b: store.book(r.bookId) }));
  const sessions = store.where('sessions', (s) => sessionYear(s) === y);
  const perDay = minutesPerDay();
  const hasAnything = store.books().length > 0;

  // per month
  const perMonthBooks = Array(12).fill(0), perMonthPages = Array(12).fill(0);
  for (const { r, b } of books) {
    const m = Number(r.finished.slice(5, 7)) - 1;
    perMonthBooks[m]++;
    perMonthPages[m] += Number(b.pages) || 0;
  }
  const totalPages = perMonthPages.reduce((a, v) => a + v, 0);
  const withPages = books.filter((x) => x.b.pages);
  const avgLen = withPages.length ? Math.round(withPages.reduce((a, x) => a + x.b.pages, 0) / withPages.length) : null;
  const spans = books.filter((x) => x.r.started).map((x) => daysBetween(x.r.started, x.r.finished) + 1).filter((d) => d > 0);
  const avgDays = spans.length ? spans.reduce((a, v) => a + v, 0) / spans.length : null;
  const speed = speedOf(sessions);
  const timeMs = sessions.reduce((a, s) => a + activeMs(s), 0);

  // goal
  const goal = Number(store.setting('yearGoal')) || 0;
  const done = fin.length;
  let goalText = '', tone = 'ok';
  if (goal) {
    if (y === thisYear) ({ text: goalText, tone } = done || store.where('reads', (r) => r.finished && !r.abandoned).length ? goalPace(done, goal) : { text: 'Wszystko jeszcze przed Tobą.', tone: 'ok' });
    else goalText = done >= goal ? 'Cel osiągnięty.' : `Zabrakło ${plN(goal - done, 'książki', 'książek', 'książek')}.`;
  }

  // genres, authors, formats
  const genres = new Map(), authors = new Map(), formats = new Map();
  for (const { b } of books) {
    const gs = new Set(String(b.genre || '').split(/[;,/]/).map((g) => g.trim()).filter(Boolean).map((g) => g[0].toUpperCase() + g.slice(1)));
    gs.forEach((g) => genres.set(g, (genres.get(g) || 0) + 1));
    if (b.author) authors.set(b.author, (authors.get(b.author) || 0) + 1);
    formats.set(b.format || 'papier', (formats.get(b.format || 'papier') || 0) + 1);
  }

  const { cur, best } = streaks(new Set(perDay.keys()));
  const heat = heatmap(y, perDay);

  const one = (n, a, b2, c) => plN(n, a, b2, c);
  el.innerHTML = `
    <header class="screen-head"><h1 class="t-display">Statystyki</h1></header>
    <div class="seg st-years" role="tablist" aria-label="Rok">${years.map((v) => `<button role="tab" aria-selected="${v === y}" data-year="${v}" class="${v === y ? 'on' : ''}">${v}</button>`).join('')}</div>

    ${!hasAnything ? ui.empty({ title: 'Tu urośnie Twój rok czytelniczy', text: 'Dodaj pierwszą książkę i zapisz kilka sesji — wykresy pojawią się same.', action: 'Dodaj książkę', actionAttr: 'data-go="polka"' }) : `

    <section class="st-hero">
      <div class="st-num"><b class="num">${done}</b><span>${pl(done, 'książka', 'książki', 'książek')}</span></div>
      <div class="st-num"><b class="num">${totalPages}</b><span>${pl(totalPages, 'strona', 'strony', 'stron')}</span></div>
      <div class="st-num"><b class="num">${timeMs ? durText(timeMs) : '—'}</b><span>w sesjach</span></div>
    </section>

    ${goal ? `<section class="section st-goal">
      <div class="st-goal-ring">${goalRing(done, goal)}<div class="st-goal-num"><b class="num">${done}</b><span class="num">z ${goal}</span></div></div>
      <div class="st-goal-text"><h2>Cel na ${y}</h2><p class="pace ${tone}">${esc(goalText)}</p></div>
    </section>` : ''}

    ${done ? '' : `<p class="st-note t-read muted">${y === thisYear ? 'W tym roku nie skończyłeś jeszcze żadnej książki — ale to dopiero początek. Pierwsza przeczytana pojawi się tu z pieczątką.' : `W roku ${y} nie zapisałem żadnej przeczytanej książki.`}</p>`}

    <section class="section">
      <div class="section-head"><h2>Książki w miesiącach</h2></div>
      ${barChart('cb', perMonthBooks, { unit: (n) => plN(n, 'książka', 'książki', 'książek'), title: `Przeczytane książki w roku ${y}` })}
    </section>
    <section class="section">
      <div class="section-head"><h2>Strony w miesiącach</h2></div>
      ${barChart('cp', perMonthPages, { unit: (n) => plN(n, 'strona', 'strony', 'stron'), title: `Przeczytane strony w roku ${y}` })}
    </section>

    <section class="section">
      <div class="section-head"><h2>W liczbach</h2></div>
      <dl class="card-fields">
        <dt class="t-label">Średnia długość</dt><dd>${avgLen ? one(avgLen, 'strona', 'strony', 'stron') : '—'}</dd>
        <dt class="t-label">Średnio na książkę</dt><dd>${avgDays ? one(Math.round(avgDays), 'dzień', 'dni', 'dni') : '—'}</dd>
        <dt class="t-label">Tempo czytania</dt><dd>${speed ? `${Math.round(speed)} str./h` : '—'}</dd>
        <dt class="t-label">Obecna seria</dt><dd>${cur ? one(cur, 'dzień', 'dni', 'dni') : '0'}</dd>
        <dt class="t-label">Najdłuższa seria</dt><dd>${best ? one(best, 'dzień', 'dni', 'dni') : '—'}</dd>
      </dl>
      ${speed ? '' : '<p class="faint t-sm st-hint">Tempo policzę po kilku sesjach z timerem w zakładce Sesja.</p>'}
    </section>

    <section class="section">
      <div class="section-head"><h2>Kalendarz czytania</h2><span class="faint t-sm num">${plN(heat.count, 'dzień', 'dni', 'dni')} w ${y}</span></div>
      <div class="st-heat-wrap" id="heat" tabindex="0" aria-label="Kalendarz czytania, przewijany poziomo">${heat.svg}</div>
      <div class="st-legend t-sm faint" aria-hidden="true">mniej <i class="st-cell l0"></i><i class="st-cell l1"></i><i class="st-cell l2"></i><i class="st-cell l3"></i><i class="st-cell l4"></i> więcej</div>
      ${heat.count ? '' : '<p class="faint t-sm st-hint">Każda zapisana sesja zapali tu jedno pole.</p>'}
    </section>

    ${done ? `<section class="section">
      <div class="section-head"><h2>Ulubione gatunki</h2></div>
      ${genres.size ? hbars(top(genres), (n) => pl(n, 'książka', 'książki', 'książek')) : '<p class="faint">Dopisz gatunki do książek, a zobaczysz tu swoje upodobania.</p>'}
    </section>
    <section class="section">
      <div class="section-head"><h2>Ulubieni autorzy</h2></div>
      ${authors.size ? hbars(top(authors), (n) => pl(n, 'książka', 'książki', 'książek')) : '<p class="faint">Brak danych o autorach.</p>'}
    </section>
    <section class="section">
      <div class="section-head"><h2>Papier, Kindle, audiobook</h2></div>
      <div class="st-split" role="img" aria-label="${esc([...formats].map(([k, n]) => `${FORMAT_NAMES[k] || k}: ${n}`).join(', '))}">${[...formats].map(([k, n]) => `<i class="f-${esc(k)}" style="flex:${n}"></i>`).join('')}</div>
      <ul class="st-split-legend">${[...formats].map(([k, n]) => `<li><i class="f-${esc(k)}"></i>${esc(FORMAT_NAMES[k] || k)} <b class="num">${n}</b></li>`).join('')}</ul>
    </section>

    <section class="section st-year">
      <div class="section-head"><h2>Rok w książkach</h2>${ui.exlibris(y, 56)}</div>
      <div class="st-covers">${books.map(({ b }) => `<button data-go="ksiazka/${esc(b.id)}" aria-label="${esc(b.title)}">${ui.coverHTML(b, 'm')}</button>`).join('')}</div>
      ${yearFacts(books, totalPages)}
    </section>` : ''}
    `}`;

  ui.hydrate(el);
  const hw = el.querySelector('#heat');
  if (hw) hw.scrollLeft = Math.max(0, heat.scrollTo - hw.clientWidth + 70);

  el.onclick = (e) => {
    const t = e.target.closest('[data-year]');
    if (t) {
      year = Number(t.dataset.year);
      ctx.refresh();
    }
  };
}

function yearFacts(books, totalPages) {
  if (!books.length) return '';
  const pg = books.filter((x) => x.b.pages);
  const longest = pg.length ? pg.reduce((a, x) => (x.b.pages > a.b.pages ? x : a)) : null;
  const shortest = pg.length > 1 ? pg.reduce((a, x) => (x.b.pages < a.b.pages ? x : a)) : null;
  const rated = books.filter((x) => x.b.rating);
  const fav = rated.length ? rated.reduce((a, x) => (x.b.rating > a.b.rating ? x : a)) : null;
  const rows = [
    fav && ['Najwyżej oceniona', `${esc(fav.b.title)} ${ui.stars(fav.b.rating, { size: 13 })}`],
    longest && ['Najdłuższa', `${esc(longest.b.title)} · ${longest.b.pages}`],
    shortest && ['Najkrótsza', `${esc(shortest.b.title)} · ${shortest.b.pages}`],
    ['Łącznie', `${plN(books.length, 'książka', 'książki', 'książek')}, ${plN(totalPages, 'strona', 'strony', 'stron')}`],
  ].filter(Boolean);
  return `<dl class="card-fields st-facts">${rows.map(([k, v]) => `<dt class="t-label">${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}
