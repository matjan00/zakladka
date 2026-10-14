// "Co dalej?": a rule-based picker over Chcę przeczytać (mood, length, genre, format, "available in Nekla now"),
// a "Zaskocz mnie" shuffle, and suggestions from outside (other books by authors/genres you rated highly).
// Also exports renderSlot(el, ctx) for the Start screen slot 'co-dalej'.
import * as store from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { esc, norm, plN, hash, todayStr, shortTitle } from './util.js';
import { openAdd } from './books.js';
import { hasProxy, search, searchAuthor } from './sources.js';
import { checkOf, sameBook, surnames } from './library.js';

// ---------- moods, length ----------
// Moods map onto genre/subject/tag keywords (diacritics stripped) plus page count.
const MOODS = [
  { id: 'lekka', label: 'Lekka', because: 'na lekki nastrój', kw: ['humor', 'komedi', 'romans', 'obyczaj', 'satyr', 'lekk', 'komiks', 'rodzin', 'przygod', 'young adult', 'dla mlodziezy', 'felieton', 'cozy', 'feel good'] },
  { id: 'powazna', label: 'Poważna', because: 'na poważny nastrój', kw: ['histori', 'biograf', 'reportaz', 'esej', 'eseisty', 'filozof', 'dramat', 'wojn', 'psycholog', 'literatura faktu', 'polityk', 'spoleczn', 'religi', 'wspomnieni', 'pamietnik', 'klasyk', 'holokaust', 'naukow'] },
  { id: 'wciagajaca', label: 'Wciągająca', because: 'wciągająca lektura', kw: ['kryminal', 'thriller', 'sensacj', 'fantasy', 'fantastyk', 'science fiction', 'horror', 'szpieg', 'detektyw', 'saga', 'suspens', 'groz', 'przygod'] },
  { id: 'krotka', label: 'Krótka przerwa', because: 'na krótką przerwę', kw: ['opowiadan', 'nowel', 'felieton', 'komiks', 'poezj', 'wiersz', 'fraszk', 'miniatur'], short: true },
];
const LENGTHS = [
  { id: 'krotka', label: 'Krótka', hint: 'do 250 stron', test: (p) => p < 250 },
  { id: 'srednia', label: 'Średnia', hint: '250–450 stron', test: (p) => p >= 250 && p <= 450 },
  { id: 'dluga', label: 'Długa', hint: 'ponad 450 stron', test: (p) => p > 450 },
];

const textOf = (b) => norm([b.genre, ...(b.subjects || []), ...(b.tags || [])].join(' '));
const pagesOf = (b) => Number(b.pages) || 0;
const genreOf = (b) => String(b.genre || '').split(/\s*[;/,]\s*/)[0].trim();
function moodMatch(b, m) {
  const t = textOf(b);
  if (m.kw.some((k) => t.includes(k))) return true;
  return !!m.short && pagesOf(b) > 0 && pagesOf(b) < 250;
}

// ---------- taste (from rated books) ----------
function taste() {
  const authors = new Map(), genres = new Map();
  for (const b of store.books()) {
    if (!(b.rating >= 4)) continue;
    if (b.author) {
      const k = surnames(b.author)[0] || norm(b.author);
      const a = authors.get(k) || { name: b.author, n: 0, sum: 0, best: '', top: 0 };
      if (b.rating > a.top) (a.top = b.rating), (a.best = b.title);
      a.n++;
      a.sum += b.rating;
      authors.set(k, a);
    }
    const g = genreOf(b);
    if (g) genres.set(norm(g), { name: g, n: (genres.get(norm(g))?.n || 0) + 1 });
  }
  return {
    authors: [...authors.entries()].map(([k, a]) => ({ key: k, name: a.name, best: a.best, n: a.n, avg: a.sum / a.n })).sort((x, y) => y.avg - x.avg || y.n - x.n),
    genres: [...genres.entries()].map(([k, g]) => ({ key: k, ...g })).sort((x, y) => y.n - x.n),
  };
}

// ---------- ranking + reasons ----------
const MONTH = 30 * 86400000;
function reasonsOf(b, tz, mood) {
  const r = [];
  let score = 0;
  const g = genreOf(b);
  if (g && tz.genres.some((x) => x.key === norm(g))) (r.push(`bo lubisz: ${g.toLowerCase()}`), (score += 3));
  else if (g) r.push(g.toLowerCase());
  const sn = surnames(b.author)[0];
  if (sn && tz.authors.some((a) => a.key === sn)) (r.push('autor, którego cenisz'), (score += 3));
  if (mood) r.push(mood.because);
  if (pagesOf(b)) r.push(plN(pagesOf(b), 'strona', 'strony', 'stron'));
  if (b.format && b.format !== 'papier') r.push(store.FORMAT_LABEL[b.format] || b.format);
  const c = checkOf(b);
  if (c?.state === 'dostepna') (r.push('dostępna w Nekli'), (score += 2));
  else if (c && (c.state === 'wypozyczona' || c.state === 'jest')) r.push('wypożyczona w Nekli');
  const months = Math.floor((Date.now() - (b.created || Date.now())) / MONTH);
  if (months >= 3) (r.push(`czeka od ${plN(months, 'miesiąca', 'miesięcy', 'miesięcy')}`), (score += 1));
  return { reasons: r, score };
}
function rank(pool, mood) {
  const tz = taste();
  return pool
    .map((b) => ({ b, ...reasonsOf(b, tz, mood) }))
    .sort((x, y) => y.score - x.score || (x.b.created || 0) - (y.b.created || 0));
}

// ---------- screen state ----------
const view = { mood: '', len: '', genre: '', format: '', avail: false, more: false, pickId: '', anim: false };
const wantList = () => store.books().filter((b) => b.status === 'chce');
function filtered(all) {
  const mood = MOODS.find((m) => m.id === view.mood);
  const len = LENGTHS.find((l) => l.id === view.len);
  const list = all.filter((b) => {
    if (mood && !moodMatch(b, mood)) return false;
    if (len && !(pagesOf(b) && len.test(pagesOf(b)))) return false;
    if (view.genre && norm(genreOf(b)) !== view.genre) return false;
    if (view.format && b.format !== view.format) return false;
    if (view.avail && checkOf(b)?.state !== 'dostepna') return false;
    return true;
  });
  return { list, mood };
}
const anyFilter = () => !!(view.mood || view.len || view.genre || view.format || view.avail);

let alive = null; // ctx while the screen is open (suggestions load asynchronously)
const sugCache = new Map(); // key → { results } | { loading } | { failed }
let lastSug = [];

function cardHTML(item, i, n, anim) {
  const { b, reasons } = item;
  return `<div class="nx-stack ${n > 1 ? 'two' : ''} ${n > 2 ? 'three' : ''}">
    <i class="nx-back b2" aria-hidden="true"></i><i class="nx-back b1" aria-hidden="true"></i>
    <article class="nx-card ${anim ? 'deal' : ''}" data-id="${esc(b.id)}">
      <button class="nx-cover" data-book="${esc(b.id)}" aria-label="Otwórz ${esc(b.title)}">${ui.coverHTML(b, 'l')}</button>
      <div class="nx-body">
        <p class="t-label num">Propozycja ${i + 1} z ${n}</p>
        <h2 class="nx-title t-title">${esc(shortTitle(b.title))}</h2>
        <p class="nx-author">${esc(b.author || 'autor nieznany')}</p>
        <ul class="nx-reasons">${reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>
    </article>
  </div>`;
}

function filtersHTML(all) {
  const genres = [...new Map(all.filter((b) => genreOf(b)).map((b) => [norm(genreOf(b)), genreOf(b)])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pl'));
  const formats = [...new Set(all.map((b) => b.format).filter(Boolean))];
  const open = view.more || view.genre || view.format || view.avail;
  const proxy = hasProxy();
  return `<section class="nx-filters" aria-label="Filtry">
    <div class="field"><span class="t-label">Nastrój</span>
      <div class="chips nx-moods" role="group" aria-label="Nastrój">
        <button class="chip ${view.mood ? '' : 'on'}" data-mood="" aria-pressed="${!view.mood}">Dowolny</button>
        ${MOODS.map((m) => `<button class="chip ${view.mood === m.id ? 'on' : ''}" data-mood="${m.id}" aria-pressed="${view.mood === m.id}">${m.label}</button>`).join('')}
      </div></div>
    <div class="field"><span class="t-label">Długość</span>
      <div class="pills" role="group" aria-label="Długość">
        <button class="${view.len ? '' : 'on'}" data-len="" aria-pressed="${!view.len}">Dowolna</button>
        ${LENGTHS.map((l) => `<button class="${view.len === l.id ? 'on' : ''}" data-len="${l.id}" aria-pressed="${view.len === l.id}">${l.label}</button>`).join('')}
      </div>
      ${view.len ? `<p class="faint t-sm">${LENGTHS.find((l) => l.id === view.len).hint}</p>` : ''}</div>
    ${open ? `<div class="field-row">
        <label class="field"><span class="t-label">Gatunek</span><select data-f="genre"><option value="">Dowolny</option>${genres.map(([k, n]) => `<option value="${esc(k)}" ${view.genre === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="field"><span class="t-label">Format</span><select data-f="format"><option value="">Dowolny</option>${formats.map((f) => `<option value="${f}" ${view.format === f ? 'selected' : ''}>${esc(store.FORMAT_LABEL[f] || f)}</option>`).join('')}</select></label>
      </div>
      <div class="nx-avail"><button class="chip ${view.avail ? 'on' : ''}" data-act="avail" aria-pressed="${view.avail}" ${proxy ? '' : 'disabled'}>${icon('library', 14)}Dostępna teraz w bibliotece</button>
      ${proxy ? '' : '<p class="faint t-sm">Ten filtr zadziała, gdy włączymy automatyczne sprawdzanie katalogu w Nekli.</p>'}</div>`
      : `<button class="link-btn" data-act="more">Więcej filtrów</button>`}
  </section>`;
}

export function render(el, ctx) {
  alive = ctx;
  const all = wantList();
  const { list, mood } = filtered(all);
  const ranked = rank(list, mood);
  let idx = ranked.findIndex((x) => x.b.id === view.pickId);
  if (idx < 0) idx = 0;
  const pick = ranked[idx];
  view.pickId = pick?.b.id || '';
  const anim = view.anim;
  view.anim = false;

  let deck;
  if (!all.length) {
    deck = ui.empty({ title: 'Lista „Chcę przeczytać” jest pusta', text: 'Dodaj kilka książek, które chodzą Ci po głowie, a pomogę wybrać, od której zacząć.', action: 'Dodaj książkę', actionAttr: 'data-act="add"' });
  } else if (!pick) {
    deck = `<div class="panel nx-none"><p class="t-read">Nic z Twojej listy nie pasuje do tych filtrów.</p><p class="faint t-sm">${view.mood || view.genre ? 'Książki bez gatunku nie łapią się na nastrój ani gatunek. Uzupełnij gatunek w karcie książki. ' : ''}${view.avail ? 'Dostępność sprawdzisz w „Bibliotece w Nekli”. ' : ''}</p><div class="btn-row"><button class="btn" data-act="clear">Wyczyść filtry</button>${view.avail ? '<button class="btn" data-go="biblioteka">Biblioteka w Nekli</button>' : ''}</div></div>`;
  } else {
    deck = `${cardHTML(pick, idx, ranked.length, anim)}
      <div class="nx-actions">
        <button class="btn primary wide" data-start="${esc(pick.b.id)}">${icon('book', 19)}Zacznij czytać</button>
        <div class="btn-row">
          <button class="btn" data-act="next" ${ranked.length < 2 ? 'disabled' : ''}>Następna</button>
          <button class="btn" data-act="surprise" ${ranked.length < 2 ? 'disabled' : ''}>${icon('compass', 19)}Zaskocz mnie</button>
        </div>
      </div>`;
  }

  el.innerHTML = `
    <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Wróć">${icon('back')}</button><div class="grow"></div></div>
    <header class="screen-head"><h1 class="t-display">Co dalej?</h1></header>
    ${all.length ? filtersHTML(all) : ''}
    <section class="nx-deck" aria-live="polite">${deck}</section>
    <section class="section nx-sug" data-sug></section>`;
  drawSuggestions(el.querySelector('[data-sug]'));

  el.onclick = (e) => {
    const t = e.target.closest('[data-act],[data-mood],[data-len],[data-start],[data-book],[data-add]');
    if (!t) return;
    const d = t.dataset;
    if (d.book) return ctx.go(`ksiazka/${d.book}`);
    if (d.start) return startReading(d.start, ctx);
    if (d.add != null) return addSuggestion(Number(d.add));
    if (d.mood != null && t.hasAttribute('data-mood')) return change({ mood: d.mood });
    if (d.len != null && t.hasAttribute('data-len')) return change({ len: d.len });
    const a = d.act;
    if (a === 'back') return history.length > 1 ? history.back() : ctx.go('start');
    if (a === 'more') return change({ more: true }, false);
    if (a === 'avail') return change({ avail: !view.avail });
    if (a === 'clear') return change({ mood: '', len: '', genre: '', format: '', avail: false });
    if (a === 'add') return openAdd({ status: 'chce' });
    if (a === 'next' && ranked.length > 1) {
      view.pickId = ranked[(idx + 1) % ranked.length].b.id;
      view.anim = true;
      return ctx.refresh();
    }
    if (a === 'surprise' && ranked.length > 1) {
      const others = ranked.filter((x) => x.b.id !== view.pickId);
      view.pickId = others[Math.floor(Math.random() * others.length)].b.id;
      view.anim = true;
      return ctx.refresh();
    }
  };
  el.onchange = (e) => {
    const f = e.target.dataset.f;
    if (f) change({ [f]: e.target.value });
  };
  return () => {
    if (alive === ctx) alive = null;
  };
}
function change(patch, reset = true) {
  Object.assign(view, patch);
  if (reset) view.pickId = '';
  alive?.refresh();
}

async function startReading(id, ctx) {
  const b = store.book(id);
  if (!b) return;
  await store.setStatus(id, 'czytam');
  ui.toast(`„${b.title}” otwarta. Miłego czytania!`, { action: 'Sesja', onAction: () => ctx.go('sesja', { book: id }) });
}

// ---------- suggestions from outside ----------
function ownedBy(c) {
  return store.books().some((o) => (c.isbn && o.isbn && c.isbn === o.isbn) || sameBook(o, c));
}
// Open Library often lists a Polish ISBN under an English work title ("Season of Storms"): reject titles that read as English
const ENGLISH = /\b(the|of|and|with|from|for)\b/i;
const looksEnglish = (t) => ENGLISH.test(t) && !/[ąćęłńóśźż]/i.test(t);
const polish = (c) => c.source?.includes('bn') || (String(c.isbn || '').startsWith('97883') && !looksEnglish(c.title));
function sugList() {
  const tz = taste();
  const out = [];
  const seen = new Set();
  const push = (c, why) => {
    const k = norm(c.title);
    if (seen.has(k) || ownedBy(c) || !polish(c)) return;
    seen.add(k);
    out.push({ ...c, why });
  };
  for (const a of tz.authors.slice(0, 3)) {
    const e = sugCache.get(`a:${a.key}`);
    let n = 0;
    for (const c of e?.results || []) {
      if (n >= 3) break;
      const as = surnames(c.author);
      if (!as.length || !as.includes(a.key)) continue;
      const before = out.length;
      push(c, a.best ? `Ten sam autor co „${a.best}”` : 'Autor, którego cenisz');
      n += out.length - before;
    }
  }
  const g = tz.genres[0];
  if (g) {
    let n = 0;
    for (const c of sugCache.get(`g:${g.key}`)?.results || []) {
      if (n >= 3) break;
      if (!norm(`${c.genre} ${(c.subjects || []).join(' ')}`).includes(g.key.split(' ')[0])) continue;
      const before = out.length;
      push(c, `Z gatunku, który lubisz: ${g.name.toLowerCase()}`);
      n += out.length - before;
    }
  }
  return out.slice(0, 8);
}
const stale = (e) => !e || (e.failed && Date.now() - e.at > 60000); // a failed lookup is retried after a minute
async function ensure(key, fn) {
  if (!stale(sugCache.get(key))) return;
  sugCache.set(key, { loading: true });
  try {
    sugCache.set(key, { results: await fn() });
  } catch {
    sugCache.set(key, { failed: true, at: Date.now() });
  }
}
function drawSuggestions(box) {
  const tz = taste();
  const head = `<div class="section-head"><h2>Pomysły z zewnątrz</h2></div>`;
  if (!tz.authors.length && !tz.genres.length) {
    box.innerHTML = `${head}<p class="faint">Oceń kilka przeczytanych książek na 4 gwiazdki lub wyżej, a podpowiem kolejne tytuły tych autorów i z gatunków, które lubisz.</p>`;
    return;
  }
  const keys = [...tz.authors.slice(0, 3).map((a) => `a:${a.key}`), ...(tz.genres[0] ? [`g:${tz.genres[0].key}`] : [])];
  const loading = keys.some((k) => sugCache.get(k)?.loading);
  const todo = keys.filter((k) => stale(sugCache.get(k)));
  if (todo.length) {
    Promise.all(
      todo.map((k) => {
        const [kind, key] = [k[0], k.slice(2)];
        if (kind === 'a')
          return ensure(k, async () => {
            const r = await searchAuthor(tz.authors.find((a) => a.key === key).name);
            if (!r.results.length && r.errors.ol) throw new Error('offline');
            return r.results;
          });
        return ensure(k, async () => (await search(tz.genres.find((x) => x.key === key).name)).results);
      })
    ).then(() => alive?.refresh());
  }
  const list = sugList();
  lastSug = list;
  box.innerHTML = `${head}
    <p class="sg-note">To nie książki z Twojej półki, tylko pomysły z internetu. Nic nie dodam bez Twojego kliknięcia.</p>
    ${list.length ? `<ul class="sg-list">${list.map(sugRow).join('')}</ul>` : loading || todo.length ? `<p class="faint" aria-busy="true">Szukam kolejnych tytułów…</p>` : `<p class="faint">Na razie nic nowego nie znalazłem. Wpadnij znów po kolejnych ocenach.</p>`}`;
}
function sugRow(c, i) {
  const meta = [c.year, c.pages ? plN(c.pages, 'strona', 'strony', 'stron') : ''].filter(Boolean).join(' · ');
  return `<li class="sg-row">
    ${ui.coverHTML(c, 's')}
    <div class="sg-body">
      <span class="sg-tag">Propozycja</span>
      <b class="t-book sg-title">${esc(c.title)}</b>
      <p class="sg-author">${esc(c.author || '')}${meta ? ` <span class="faint num">· ${esc(meta)}</span>` : ''}</p>
      <p class="sg-why faint t-sm">${esc(c.why)}</p>
    </div>
    <button class="btn sg-add" data-add="${i}">${icon('plus', 18)}Dodaj do „Chcę przeczytać”</button>
  </li>`;
}
async function addSuggestion(i) {
  const c = lastSug[i];
  if (!c) return;
  await store.addBook({ title: c.title, author: c.author, pages: c.pages, year: c.year, genre: c.genre, isbn: c.isbn, publisher: c.publisher, subjects: c.subjects || [], coverUrl: c.coverUrl, source: c.source?.includes('bn') ? 'bn' : 'ol', status: 'chce' });
  ui.toast(`„${c.title}” czeka w „Chcę przeczytać”`);
}

// ---------- Start-screen slot ----------
export function renderSlot(el, ctx) {
  const head = (more = true) => `<div class="section-head"><h2>Co dalej?</h2>${more ? '<button class="link-btn" data-go="co-dalej">Więcej</button>' : ''}</div>`;
  const pool = wantList();
  if (!pool.length) {
    el.innerHTML = `${head(false)}<button class="panel next-card" data-go="co-dalej">${icon('compass', 28)}<span class="grow"><b>Nie wiesz, po co sięgnąć?</b><span class="muted t-sm">Dodaj książki do „Chcę przeczytać”, a podpowiem, od której zacząć.</span></span>${icon('chev', 18, 'chev')}</button>`;
    return;
  }
  const ranked = rank(pool);
  // the pick is stable for the day: one of the best few, chosen by the date
  const top = ranked.slice(0, Math.min(5, ranked.length));
  const it = top[hash(todayStr()) % top.length];
  const b = it.b;
  el.innerHTML = `${head()}
    <article class="panel nx-slot">
      <button class="nx-slot-cover" data-book="${esc(b.id)}" aria-label="Otwórz ${esc(b.title)}">${ui.coverHTML(b, 's')}</button>
      <div class="nx-slot-body">
        <b class="t-book nx-slot-title">${esc(shortTitle(b.title))}</b>
        <p class="nx-author">${esc(b.author || '')}</p>
        <ul class="nx-reasons small">${it.reasons.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>
      <button class="btn primary nx-slot-go" data-slot-start="${esc(b.id)}">Zacznij czytać</button>
    </article>`;
  el.addEventListener('click', (e) => {
    const s = e.target.closest('[data-slot-start]');
    if (s) startReading(s.dataset.slotStart, ctx);
  });
}
