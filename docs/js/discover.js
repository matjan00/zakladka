// "Odkrywaj": books that Reddit readers keep recommending to each other, matched to your shelf.
// Data: data/books.json (built by a pipeline over Reddit threads), fetched once and kept in memory.
// Shelves ("Bo podobała Ci się…", "Najczęściej polecane", genres…) or, when a filter is on, a result grid.
// "Chcę przeczytać" adds a normal book to the store (source 'odkrywaj'); "Nie interesuje" is the setting `discoverHidden` (array of ids).
import * as store from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { esc, norm, pl, plN, shortTitle, dateLong, debounce } from './util.js';
import { queriesFor, matchResults, STATE } from './library.js';
import { libraryCheck, hasProxy } from './sources.js';
import { sowaSearchUrl } from './config.js';

// ---------- vocabulary ----------
const GENRE = {
  classic: 'Klasyka', literary: 'Literatura piękna', scifi: 'Science fiction', fantasy: 'Fantasy', crime: 'Kryminał',
  historical: 'Powieść historyczna', horror: 'Horror', romance: 'Romans', ya: 'Młodzieżowe', history: 'Historia',
  science: 'Nauka', memoir: 'Wspomnienia', philosophy: 'Filozofia', humour: 'Humor', graphic: 'Komiks', poetry: 'Poezja', other: 'Inne',
};
const MOOD = {
  dark: 'Mroczna', thoughtful: 'Refleksyjna', funny: 'Zabawna', tense: 'Trzymająca w napięciu', cozy: 'Przytulna', epic: 'Epicka',
  melancholic: 'Melancholijna', 'mind-bending': 'Kręci w głowie', emotional: 'Poruszająca', fast: 'Wartka', atmospheric: 'Klimatyczna',
  hopeful: 'Krzepiąca', bleak: 'Ponura', adventurous: 'Przygodowa', satirical: 'Satyryczna',
};
const LEN = { short: ['Krótka', 'do 250 stron'], medium: ['Średnia', '250–500 stron'], long: ['Długa', 'ponad 500 stron'] };
const DIFF = { 1: 'Lekka w czytaniu', 2: 'Średnio wymagająca', 3: 'Wymagająca' };
const DIFF_SHORT = { 1: 'Lekka', 2: 'Średnia', 3: 'Wymagająca' };
const TYPE = { novel: 'powieść', stories: 'opowiadania', nonfiction: 'literatura faktu', poetry: 'poezja', graphic: 'komiks', play: 'dramat' };

// Polish shelf keywords (diacritics stripped, see util.norm) → our genre ids
const GENRE_KW = [
  ['scifi', ['fantastyka naukowa', 'science fiction', 'sci fi', 'sf ', 'kosmos', 'cyberpunk', 'dystopi']],
  ['fantasy', ['fantasy', 'fantastyka']],
  ['crime', ['kryminal', 'thriller', 'sensacj', 'detektyw', 'szpieg']],
  ['horror', ['horror', 'groza', 'grozy']],
  ['romance', ['romans']],
  ['ya', ['mlodziez', 'young adult']],
  ['historical', ['powiesc historyczna']],
  ['history', ['histori', 'wojn']],
  ['memoir', ['biograf', 'wspomnien', 'pamietnik', 'reportaz', 'literatura faktu']],
  ['philosophy', ['filozof', 'psycholog', 'religi']],
  ['science', ['popularnonaukow', 'nauk', 'przyrod']],
  ['humour', ['humor', 'satyr', 'komedi']],
  ['graphic', ['komiks']],
  ['poetry', ['poezj', 'wiersz']],
  ['classic', ['klasyk', 'literatura piekna', 'literatura polska', 'literatura rosyjska', 'literatura francuska']],
  ['literary', ['powiesc', 'proza', 'obyczaj', 'literatura']],
];

const coverUrl = (e) => (e.cover ? `https://covers.openlibrary.org/b/id/${e.cover}-M.jpg` : '');
const titleOf = (e) => e.pl?.t || e.t;
const origOf = (e) => (e.pl?.t && norm(e.pl.t) !== norm(e.t) ? e.t : '');
const bookOf = (e) => ({ title: titleOf(e), author: e.a, coverUrl: coverUrl(e), id: e.id });
const hasPl = (e) => !!(e.pl && (e.pl.t || e.pl.lc || e.pl.legimi));
const ratingStr = (r) => Number(r).toFixed(1).replace('.', ',');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- data ----------
let DATA = null, loading = null;
const BY_ID = new Map(), BY_TITLE = new Map(), BY_ISBN = new Map();
let MAXRANK = 1;

function prepare(j) {
  BY_ID.clear(); BY_TITLE.clear(); BY_ISBN.clear();
  for (const e of j.books) {
    e.m = e.m || [];
    e.rel = e.rel || [];
    e.subs = e.subs || {};
    e._sn = new Set(norm(e.a).split(' ').filter((t) => t.length > 1));
    BY_ID.set(e.id, e);
    for (const t of [e.t, e.pl?.t].filter(Boolean)) for (const k of new Set([norm(t), norm(shortTitle(t))])) {
      if (!k) continue;
      if (!BY_TITLE.has(k)) BY_TITLE.set(k, []);
      BY_TITLE.get(k).push(e);
    }
    if (e.isbn) BY_ISBN.set(e.isbn, e);
    MAXRANK = Math.max(MAXRANK, e.rank || 0);
  }
}
function load() {
  if (DATA) return Promise.resolve(DATA);
  if (!loading) {
    loading = fetch(new URL('../data/books.json', import.meta.url))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!j || !Array.isArray(j.books) || !j.books.length) throw new Error('empty');
        prepare(j);
        return (DATA = j);
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

// ---------- matching your shelf to the data ----------
function authorOk(author, e) {
  const toks = norm(author).split(' ').filter((t) => t.length > 1);
  if (!toks.length) return true;
  for (const t of toks) for (const s of e._sn) {
    if (t === s) return true;
    // transliteration: Dostojewski ~ Dostoevsky, Tołstoj ~ Tolstoy
    if (t.length >= 4 && s.length >= 4 && t.slice(0, 4) === s.slice(0, 4)) return true;
  }
  return false;
}
function entryFor(b) {
  if (b.discoverId && BY_ID.has(b.discoverId)) return BY_ID.get(b.discoverId);
  const isbn = String(b.isbn || '').replace(/[^0-9X]/gi, '');
  if (isbn && BY_ISBN.has(isbn)) return BY_ISBN.get(isbn);
  for (const k of new Set([norm(b.title), norm(shortTitle(b.title))])) {
    for (const e of BY_TITLE.get(k) || []) if (authorOk(b.author, e)) return e;
  }
  return null;
}
const STATUS_ORDER = ['czytam', 'przeczytane', 'chce', 'porzucone'];
/** Map entryId → the shelf book that matches it. */
function shelfMap() {
  const m = new Map();
  for (const b of store.books()) {
    const e = entryFor(b);
    if (!e) continue;
    const old = m.get(e.id);
    if (!old || STATUS_ORDER.indexOf(b.status) < STATUS_ORDER.indexOf(old.status)) m.set(e.id, b);
  }
  return m;
}
const hiddenSet = () => new Set(store.setting('discoverHidden') || []);

function genresOfShelfBook(b) {
  const t = norm([b.genre, ...(b.subjects || []), ...(b.tags || [])].join(' ')) + ' ';
  const out = [];
  for (const [g, kws] of GENRE_KW) if (kws.some((k) => t.includes(k))) out.push(g);
  // "fantastyka naukowa" is science fiction, not fantasy
  if (out.includes('scifi') && !t.includes('fantasy')) return out.filter((g) => g !== 'fantasy');
  return out;
}

// ---------- taste ----------
function taste(map) {
  const seeds = []; // liked books that exist in the data
  const aff = new Map(); // genre → weight
  const bump = (g, w) => aff.set(g, (aff.get(g) || 0) + w);
  const liked = store.books().filter((b) => b.status === 'przeczytane' && b.rating >= 4).sort((a, b) => b.rating - a.rating || (b.updated || 0) - (a.updated || 0));
  const seen = new Set();
  for (const b of liked) {
    const e = entryFor(b);
    const w = b.rating - 3; // 4★ → 1, 5★ → 2
    const gs = genresOfShelfBook(b);
    if (e) {
      bump(e.g, w);
      if (!seen.has(e.id)) (seen.add(e.id), seeds.push({ b, e }));
    }
    // the shelf's own genre words count too, but a bit less than a certain match
    for (const g of gs.slice(0, 2)) if (!e || g !== e.g) bump(g, w * (e ? 0.4 : 1));
  }
  const genres = [...aff.entries()].filter(([g]) => g !== 'other').sort((a, b) => b[1] - a[1]).map(([g]) => g);
  const likedMoods = new Map();
  for (const s of seeds) for (const m of s.e.m) likedMoods.set(m, (likedMoods.get(m) || 0) + 1);
  // Seed shelves should cover different tastes (sci-fi, classics, …) and change from day to day:
  // group seeds by genre, rotate each group by the day, then take one per genre in affinity order.
  const day = Math.floor(Date.now() / 864e5);
  const groups = new Map();
  for (const s of seeds) (groups.get(s.e.g) || groups.set(s.e.g, []).get(s.e.g)).push(s);
  const order = [...genres.filter((g) => groups.has(g)), ...[...groups.keys()].filter((g) => !genres.includes(g))];
  const rotated = order.map((g) => { const a = groups.get(g), k = day % a.length; return a.slice(k).concat(a.slice(0, k)); });
  const spread = [];
  for (let i = 0; spread.length < seeds.length; i++) for (const a of rotated) if (i < a.length) spread.push(a[i]);
  return { seeds: spread, genres, likedMoods, any: liked.length > 0 };
}

// ---------- shelves ----------
function similarTo(e, pool) {
  return pool
    .filter((o) => o.id !== e.id)
    .map((o) => {
      const overlap = o.m.filter((x) => e.m.includes(x)).length;
      const same = o.g === e.g;
      return { o, s: (same ? 3 : 0) + overlap * 2 + (o.rank || 0) / MAXRANK };
    })
    .filter((x) => x.s >= 4)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.o);
}
function buildShelves() {
  const map = shelfMap(), hidden = hiddenSet();
  const books = DATA.books;
  const free = (e) => !hidden.has(e.id) && !map.has(e.id);
  const pool = books.filter(free);
  const byRank = [...pool].sort((a, b) => b.rank - a.rank);
  const tz = taste(map);
  const shelves = [];
  const used = new Set();

  // 1. "Bo podobała Ci się: …" — from the related list of what you rated 4★+, then by genre and mood
  for (const { b, e } of tz.seeds) {
    if (shelves.length >= 3) break;
    const items = [];
    const add = (o) => o && free(o) && !used.has(o.id) && !items.includes(o) && items.length < 12 && items.push(o);
    e.rel.forEach((id) => add(BY_ID.get(id)));
    similarTo(e, pool).forEach(add);
    if (items.length < 3) continue;
    items.forEach((o) => used.add(o.id));
    shelves.push({ id: `bo-${e.id}`, because: shortTitle(b.title) || b.title, items });
  }
  // 2. most recommended
  shelves.push({ id: 'top', title: 'Najczęściej polecane na Reddicie', sub: 'Według liczby komentarzy i głosów', items: byRank.slice(0, 14) });
  // 3. "Dla Ciebie: genre" — your highest rated genre (two of them when we have no matched seed shelves)
  const forYou = tz.genres.slice(0, tz.seeds.length ? 1 : 2);
  const moods = tz.likedMoods;
  for (const g of forYou) {
    const items = pool.filter((o) => o.g === g).map((o) => ({ o, s: o.rank / MAXRANK + o.m.filter((m) => moods.has(m)).length * 0.25 })).sort((a, b) => b.s - a.s).map((x) => x.o).slice(0, 14);
    if (items.length >= 3) shelves.push({ id: `dla-${g}`, title: `Dla Ciebie: ${GENRE[g].toLowerCase()}`, sub: 'Gatunek, który oceniasz najwyżej', items });
  }
  // 4. one row per genre (only genres with at least 4 books in the data)
  const counts = new Map();
  for (const e of books) counts.set(e.g, (counts.get(e.g) || 0) + 1);
  const gs = [...counts.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).map(([g]) => g);
  for (const g of gs) {
    const items = byRank.filter((o) => o.g === g).slice(0, 14);
    if (items.length >= 3) shelves.push({ id: `g-${g}`, title: GENRE[g] || g, items, genre: g });
  }
  // 5. short and strong, 6. available at Legimi
  const short = byRank.filter((o) => o.len === 'short').slice(0, 14);
  if (short.length >= 3) shelves.push({ id: 'short', title: 'Krótkie i mocne', sub: 'Do 250 stron, a polecane gorąco', items: short });
  const nk = byRank.filter((o) => o.nk && o.nk.s !== 'brak').slice(0, 14);
  if (nk.length >= 3) shelves.push({ id: 'nekla', title: 'W bibliotece w Nekli', sub: 'Są w katalogu biblioteki, wypożyczysz za darmo', items: nk });
  const lg = byRank.filter((o) => o.pl?.legimi).slice(0, 14);
  if (lg.length >= 3) shelves.push({ id: 'legimi', title: 'W abonamencie Legimi', sub: 'Przeczytasz bez dopłaty do abonamentu', items: lg });
  return { shelves, tz, map, hidden };
}

// ---------- filters (kept for the session only) ----------
const SKEY = 'zakladka.odkrywaj';
const F0 = { q: '', g: '', m: '', len: '', d: '', lang: '', lg: false, nk: false };
let F = { ...F0 };
let panelOpen = false;
let shown = 60;
try {
  const s = JSON.parse(sessionStorage.getItem(SKEY) || 'null');
  if (s && typeof s === 'object') (F = { ...F0, ...s.f }), (panelOpen = !!s.open);
} catch {}
const saveF = () => {
  try {
    sessionStorage.setItem(SKEY, JSON.stringify({ f: F, open: panelOpen }));
  } catch {}
};
const nFilters = () => ['g', 'm', 'len', 'd', 'lang'].filter((k) => F[k]).length + (F.lg ? 1 : 0) + (F.nk ? 1 : 0);
const anyFilter = () => !!(F.q.trim() || nFilters());
function applyFilters(map, hidden) {
  const q = norm(F.q), qt = q.split(' ').filter(Boolean);
  const hay = (e) => (e._hay ||= ` ${norm(`${e.t} ${e.pl?.t || ''} ${e.a}`)}`);
  return DATA.books
    .filter((e) => {
      if (hidden.has(e.id)) return false;
      if (F.g && e.g !== F.g) return false;
      if (F.m && !e.m.includes(F.m)) return false;
      if (F.len && e.len !== F.len) return false;
      if (F.d && String(e.d) !== String(F.d)) return false;
      if (F.lang === 'pl' && !hasPl(e)) return false;
      if (F.lang === 'nopl' && hasPl(e)) return false;
      if (F.lg && !e.pl?.legimi) return false;
      if (F.nk && !(e.nk && e.nk.s !== 'brak')) return false;
      if (q && !qt.every((t) => hay(e).includes(` ${t}`))) return false;
      return true;
    })
    .sort((a, b) => b.rank - a.rank);
}

// ---------- html ----------
const STAR = '<svg class="dc-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.75 5.95 6.5.75-4.8 4.45 1.3 6.42L12 17.1l-5.75 3.27 1.3-6.42-4.8-4.45 6.5-.75z"/></svg>';
function badgesHTML(e, st) {
  const b = [];
  if (st) b.push(`<span class="dc-badge shelf">${esc(store.STATUS_LABEL[st.status] || 'Na półce')}</span>`);
  if (e.pl?.legimi) b.push('<span class="dc-badge legimi" title="W abonamencie Legimi, bez dopłaty">Legimi</span>');
  if (e.nk && e.nk.s !== 'brak') b.push('<span class="dc-badge nekla" title="W katalogu biblioteki w Nekli">Nekla</span>');
  if (e.pl?.r) b.push(`<span class="dc-badge lc" title="Ocena na lubimyczytac.pl: ${ratingStr(e.pl.r)}/10" aria-label="Ocena na lubimyczytac.pl: ${ratingStr(e.pl.r)} na 10">${STAR}${ratingStr(e.pl.r)}</span>`);
  return b.length ? `<span class="dc-badges">${b.join('')}</span>` : '';
}
function cardHTML(e, map) {
  const t = shortTitle(titleOf(e)) || titleOf(e);
  const meta = [e.y, e.p ? `${e.p} s.` : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="dc-card" data-open="${esc(e.id)}" aria-label="${esc(titleOf(e))}, ${esc(e.a)}">
    <span class="dc-cover">${ui.coverHTML(bookOf(e), 'm')}</span>
    <b class="dc-t">${esc(t)}</b>
    ${origOf(e) ? `<span class="dc-orig">${esc(shortTitle(origOf(e)))}</span>` : ''}
    <span class="dc-a">${esc(e.a)}</span>
    <span class="dc-meta num">${esc(meta)}</span>
    <span class="dc-rec">Polecane przez ${plN(e.n, 'komentarz', 'komentarze', 'komentarzy')}</span>
    ${badgesHTML(e, map.get(e.id))}
  </button>`;
}
function shelfHTML(s, map) {
  const head = s.because ? `Bo podobała Ci się: <em>${esc(s.because)}</em>` : esc(s.title);
  const label = s.because ? `Bo podobała Ci się: ${s.because}` : s.title;
  return `<section class="dc-shelf" aria-label="${esc(label)}">
    <div class="section-head dc-shead"><div class="dc-htxt"><h2>${head}</h2>${s.sub ? `<p class="dc-sub faint t-sm">${esc(s.sub)}</p>` : ''}</div>
      <span class="dc-arrows"><button type="button" class="dc-arrow" data-scroll="-1" aria-label="Przewiń „${esc(label)}” w lewo">${icon('back', 20)}</button><button type="button" class="dc-arrow" data-scroll="1" aria-label="Przewiń „${esc(label)}” w prawo">${icon('chev', 20)}</button></span></div>
    <div class="dc-rail" role="group" aria-label="${esc(label)}">${s.items.map((e) => cardHTML(e, map)).join('')}</div>
  </section>`;
}
function skeletonHTML() {
  const card = '<span class="dc-card skel" aria-hidden="true"><i class="dc-cover"></i><i class="l1"></i><i class="l2"></i></span>';
  const shelf = `<div class="dc-shelf"><div class="section-head"><i class="dc-skh"></i></div><div class="dc-rail">${card.repeat(6)}</div></div>`;
  return `<div class="dc-skel" aria-busy="true" aria-label="Wczytuję polecenia">${shelf}${shelf}</div>`;
}
const chipGroup = (label, key, opts) => `<div class="dc-group"><span class="t-label">${label}</span><div class="chips" role="group" aria-label="${label}">${opts.map(([v, l]) => `<button type="button" class="chip ${String(F[key]) === String(v) ? 'on' : ''}" data-f="${key}" data-v="${esc(v)}" aria-pressed="${String(F[key]) === String(v)}">${esc(l)}</button>`).join('')}</div></div>`;
function barRowHTML() {
  const n = nFilters();
  return `<button type="button" class="chip dc-toggle ${panelOpen ? 'open' : ''}" data-act="panel" aria-expanded="${panelOpen}" aria-controls="dc-panel">${icon('sort', 14)}Filtry${n ? ` <b class="dc-count num" aria-label="aktywne: ${n}">${n}</b>` : ''}</button>
    <button type="button" class="chip ${F.lg ? 'on' : ''}" data-act="lg" aria-pressed="${F.lg}">${icon('library', 14)}W abonamencie Legimi</button>
    <button type="button" class="chip ${F.nk ? 'on' : ''}" data-act="nk" aria-pressed="${F.nk}">${icon('library', 14)}W bibliotece (Nekla)</button>`;
}
function panelHTML() {
  const genres = Object.keys(GENRE).filter((g) => DATA.books.some((e) => e.g === g));
  const moods = Object.keys(MOOD).filter((m) => DATA.books.some((e) => e.m.includes(m)));
  return `${chipGroup('Gatunek', 'g', genres.map((g) => [g, GENRE[g]]))}
      ${chipGroup('Nastrój', 'm', moods.map((m) => [m, MOOD[m]]))}
      ${chipGroup('Długość', 'len', Object.entries(LEN).map(([k, v]) => [k, `${v[0]} (${v[1]})`]))}
      ${chipGroup('Trudność', 'd', [1, 2, 3].map((d) => [d, DIFF_SHORT[d]]))}
      ${chipGroup('Język', 'lang', [['pl', 'Jest polskie wydanie'], ['nopl', 'Tylko bez wydania polskiego']])}`;
}
function barHTML() {
  return `<div class="dc-bar" role="search">
    <div class="dc-search">${icon('search', 18)}<input class="input" type="search" data-keep="dc-q" name="q" value="${esc(F.q)}" placeholder="Szukaj tytułu lub autora" aria-label="Szukaj tytułu lub autora" autocomplete="off" enterkeyhint="search"></div>
    <div class="dc-bar-row" data-row>${barRowHTML()}</div>
  </div>
  <div class="dc-panel" id="dc-panel" data-panel ${panelOpen ? '' : 'hidden'}>${panelHTML()}</div>`;
}
function footHTML(hiddenN) {
  return `<footer class="dc-foot">
    ${hiddenN ? `<button type="button" class="link-btn" data-act="hidden">Ukryte (${hiddenN})</button>` : ''}
    <p class="faint t-sm">Dane z ${esc(dateLong(DATA.built) || DATA.built || '')} · ${plN(DATA.books.length, 'książka', 'książki', 'książek')} z rekomendacji czytelników Reddita. Oceny i linki pochodzą z lubimyczytac.pl, Legimi (tylko pozycje w abonamencie) i katalogu biblioteki w Nekli.</p>
  </footer>`;
}

// ---------- screen ----------
let live = null; // { el, ctx }
const rootOf = () => live?.el;

function bodyHTML() {
  const { shelves, tz, map, hidden } = buildShelves();
  if (anyFilter()) {
    const res = applyFilters(map, hidden);
    const list = res.slice(0, shown);
    const head = `<div class="dc-found"><p role="status" aria-live="polite"><b class="num">${res.length}</b> ${pl(res.length, 'książka', 'książki', 'książek')}</p><button type="button" class="link-btn" data-act="clear">Wyczyść</button></div>`;
    if (!res.length) return { html: `${head}${ui.empty({ title: 'Nic nie pasuje do tych filtrów', text: 'Poluzuj któryś z filtrów albo wyczyść wszystkie.', action: 'Wyczyść filtry', actionAttr: 'data-act="clear"' })}`, hiddenN: hidden.size };
    return {
      html: `${head}<div class="dc-grid">${list.map((e) => cardHTML(e, map)).join('')}</div>${res.length > shown ? `<div class="dc-more"><button type="button" class="btn" data-act="more">Pokaż więcej (${res.length - shown})</button></div>` : ''}`,
      hiddenN: hidden.size,
    };
  }
  const hint = !tz.any
    ? `<p class="dc-hint panel t-read">Oceń kilka przeczytanych książek na 4 gwiazdki lub wyżej, a ułożę tu propozycje pod Twój gust. Na razie widzisz to, co czytelnicy polecają najczęściej.</p>`
    : !tz.seeds.length
      ? `<p class="dc-hint panel t-read">Nie znalazłem Twoich ulubionych książek w tym zestawie, więc dobieram po gatunkach, które lubisz.</p>`
      : '';
  return { html: hint + shelves.map((s) => shelfHTML(s, map)).join(''), hiddenN: hidden.size };
}
function drawBody() {
  const el = rootOf();
  const box = el?.querySelector('[data-body]');
  if (!box || !DATA) return;
  const { html, hiddenN } = bodyHTML();
  box.innerHTML = html;
  const foot = el.querySelector('[data-foot]');
  if (foot) foot.innerHTML = footHTML(hiddenN);
  ui.hydrate(box);
  requestAnimationFrame(() => box.querySelectorAll('.dc-rail').forEach(syncArrows));
}
function drawRest() {
  const el = rootOf();
  const row = el?.querySelector('[data-row]'), panel = el?.querySelector('[data-panel]');
  if (!row || !panel) return;
  row.innerHTML = barRowHTML();
  panel.innerHTML = panelHTML();
  panel.hidden = !panelOpen;
}
function toBar() {
  const bar = rootOf()?.querySelector('.dc-bar');
  if (bar && bar.getBoundingClientRect().top <= 1) scrollTo({ top: Math.max(0, bar.offsetTop - 2), behavior: 'auto' });
}
function setF(patch, { scroll = true } = {}) {
  Object.assign(F, patch);
  shown = 60;
  saveF();
  drawRest();
  drawBody();
  if (scroll) toBar();
}

function syncArrows(rail) {
  const sec = rail.closest('.dc-shelf');
  if (!sec) return;
  const max = rail.scrollWidth - rail.clientWidth - 2;
  sec.dataset.start = rail.scrollLeft <= 2 ? '1' : '';
  sec.dataset.end = rail.scrollLeft >= max ? '1' : '';
  sec.dataset.fits = max <= 0 ? '1' : '';
}

export function render(el, ctx) {
  live = { el, ctx };
  el.classList.add('dc-screen');
  el.innerHTML = `<header class="screen-head"><h1 class="t-display">Odkrywaj</h1></header>
    <p class="dc-intro t-read">Książki, które czytelnicy z Reddita polecają sobie nawzajem — dobrane do Twojej półki.</p>
    <div data-slot>${skeletonHTML()}</div>`;
  const slot = el.querySelector('[data-slot]');

  const paint = () => {
    if (live?.el !== el) return;
    slot.innerHTML = `${barHTML()}<div data-body></div><div data-foot></div>`;
    drawBody();
  };
  const fail = () => {
    if (live?.el !== el) return;
    slot.innerHTML = `${ui.empty({ title: 'Nie udało się wczytać polecanek', text: 'Sprawdź połączenie z internetem i spróbuj jeszcze raz.' })}<div class="dc-more" style="margin-top:0"><button type="button" class="btn primary" data-act="retry">${icon('refresh', 19)}Spróbuj ponownie</button></div>`;
  };
  if (DATA) paint();
  else load().then(paint, fail);

  const onScroll = (e) => e.target.classList?.contains('dc-rail') && syncArrows(e.target);
  el.addEventListener('scroll', onScroll, true);
  const onResize = debounce(() => el.querySelectorAll('.dc-rail').forEach(syncArrows), 150);
  addEventListener('resize', onResize);

  el.onclick = (e) => {
    const t = e.target.closest('[data-open],[data-act],[data-f],[data-scroll]');
    if (!t) return;
    if (t.dataset.open) return openEntry(t.dataset.open);
    if (t.dataset.scroll) {
      const rail = t.closest('.dc-shelf').querySelector('.dc-rail');
      return rail.scrollBy({ left: Number(t.dataset.scroll) * rail.clientWidth * 0.85, behavior: reduced() ? 'auto' : 'smooth' });
    }
    if (t.dataset.f) {
      const k = t.dataset.f, v = t.dataset.v;
      return setF({ [k]: String(F[k]) === v ? '' : v });
    }
    const a = t.dataset.act;
    if (a === 'panel') {
      panelOpen = !panelOpen;
      saveF();
      return drawRest();
    }
    if (a === 'lg') return setF({ lg: !F.lg });
    if (a === 'nk') return setF({ nk: !F.nk });
    if (a === 'clear') {
      const inp = el.querySelector('[data-keep="dc-q"]');
      if (inp) inp.value = '';
      return setF({ ...F0 });
    }
    if (a === 'more') {
      shown += 60;
      return drawBody();
    }
    if (a === 'hidden') return openHidden();
    if (a === 'retry') {
      slot.innerHTML = skeletonHTML();
      return load().then(paint, fail);
    }
  };
  const typed = debounce((v) => setF({ q: v }, { scroll: false }), 180);
  el.oninput = (e) => e.target.matches?.('[data-keep="dc-q"]') && typed(e.target.value);
  el.onsubmit = (e) => e.preventDefault();
  el.onkeydown = (e) => e.key === 'Enter' && e.target.matches?.('[data-keep="dc-q"]') && e.target.blur();

  return () => {
    if (live?.el === el) live = null;
    el.classList.remove('dc-screen');
    el.removeEventListener('scroll', onScroll, true);
    removeEventListener('resize', onResize);
  };
}

/** Store changes (adding a book, hiding one, a new rating) redraw the page body and the open sheet only. */
export function onChange() {
  if (!live) return false;
  if (DATA) {
    drawBody();
    refreshSheet();
  }
  return true;
}

// ---------- the card sheet ----------
let sheet = null; // { rec, id, trail: [ids] }
function openEntry(id, { push = false } = {}) {
  const e = BY_ID.get(id);
  if (!e) return;
  if (sheet && !sheet.rec.closed) {
    if (push) sheet.trail.push(sheet.id);
    sheet.id = id;
    drawSheet();
    sheet.rec.body.scrollTop = 0;
    return;
  }
  const rec = ui.openSheet('', { cls: 'dc-sheet', label: titleOf(e), onClose: () => { if (sheet?.rec === rec) sheet = null; } });
  sheet = { rec, id, trail: [] };
  rec.body.addEventListener('click', onSheetClick);
  drawSheet();
}
const refreshSheet = () => sheet && !sheet.rec.closed && drawSheet(true);

function drawSheet(keep = false) {
  const e = BY_ID.get(sheet.id);
  const map = shelfMap();
  const st = map.get(e.id);
  const hidden = hiddenSet().has(e.id);
  const body = sheet.rec.body;
  const keepTop = keep ? body.scrollTop : 0;
  const keepAvail = body.querySelector('[data-avail-out]')?.innerHTML || '';
  const subs = Object.entries(e.subs).sort((a, b) => b[1] - a[1]);
  const rel = e.rel.map((id) => BY_ID.get(id)).filter((o) => o && !hiddenSet().has(o.id)).slice(0, 8);
  const meta = [e.y, e.p ? `${e.p} s.` : '', TYPE[e.ty], GENRE[e.g]].filter(Boolean).join(' · ');
  const prev = sheet.trail.at(-1);
  const links = [
    e.pl?.legimi ? `<a class="btn" href="${esc(e.pl.legimi)}" target="_blank" rel="noopener">Czytaj w abonamencie Legimi ${icon('external', 16)}</a>` : '',
    e.pl?.lc ? `<a class="btn" href="${esc(e.pl.lc)}" target="_blank" rel="noopener">lubimyczytac.pl ${icon('external', 16)}</a>` : '',
  ].join('');
  const q = `${titleOf(e)} ${norm(e.a).split(' ').at(-1)}`;
  body.innerHTML = `
    ${prev ? `<button type="button" class="link-btn dc-back" data-back>${icon('back', 16)}Wróć do: ${esc(shortTitle(titleOf(BY_ID.get(prev))))}</button>` : ''}
    <div class="dc-top">
      <div class="dc-bigcover">${ui.coverHTML(bookOf(e), 'l')}</div>
      <div class="dc-info">
        <h2 class="t-title dc-title">${esc(titleOf(e))}</h2>
        ${origOf(e) ? `<p class="dc-orig-l faint">${esc(origOf(e))}</p>` : ''}
        <p class="dc-author">${esc(e.a)}</p>
        <p class="faint t-sm num">${esc(meta)}</p>
        ${badgesHTML(e, null)}
      </div>
    </div>
    <div class="dc-actions">
      ${st
        ? `<div class="dc-onshelf"><span class="t-label">Na Twojej półce</span><b>${esc(store.STATUS_LABEL[st.status] || '')}</b><button type="button" class="link-btn" data-go="ksiazka/${esc(st.id)}">Otwórz</button></div>`
        : hidden
          ? `<button type="button" class="btn primary wide" data-unhide="${esc(e.id)}">Przywróć do propozycji</button>`
          : `<button type="button" class="btn primary wide" data-want>${icon('plus', 19)}Chcę przeczytać</button>`}
      ${!st && !hidden ? `<button type="button" class="btn wide ghost" data-hide>Nie interesuje</button>` : ''}
    </div>
    <section class="dc-why"><span class="t-label">Czemu to polecają</span><blockquote lang="en">${esc(e.why || '')}</blockquote>
      <p class="faint t-sm num">Wymieniane w ${plN(e.n, 'komentarzu', 'komentarzach', 'komentarzach')}, ${plN(e.up, 'głos', 'głosy', 'głosów')} w górę.</p></section>
    <dl class="dc-facts">
      <dt class="t-label">Nastrój</dt><dd>${e.m.length ? e.m.map((m) => `<span class="dc-mood">${esc(MOOD[m] || m)}</span>`).join('') : '—'}</dd>
      <dt class="t-label">Trudność</dt><dd>${DIFF[e.d] ? `<span class="dc-dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= e.d ? 'f' : ''}"></i>`).join('')}</span> ${DIFF[e.d]}` : '—'}</dd>
      <dt class="t-label">Długość</dt><dd>${LEN[e.len] ? `${LEN[e.len][0]} (${LEN[e.len][1]})` : '—'}</dd>
      ${e.pl?.r ? `<dt class="t-label">lubimyczytac.pl</dt><dd class="num">${ratingStr(e.pl.r)} / 10</dd>` : ''}
    </dl>
    ${subs.length ? `<section class="dc-subs"><span class="t-label">Gdzie polecano</span><div class="chips">${subs.map(([s, n]) => `<span class="chip dc-sub-chip num">r/${esc(s)} ×${n}</span>`).join('')}</div></section>` : ''}
    <section class="dc-links"><span class="t-label">Gdzie to znaleźć</span>
      <div class="btn-row">${links}<a class="btn" href="${esc(sowaSearchUrl(q))}" target="_blank" rel="noopener">${icon('library', 16)}Sprawdź w bibliotece w Nekli</a></div>
      ${e.nk ? (e.nk.s === 'brak' ? `<p class="faint t-sm">Nie znalazłem tej książki w katalogu biblioteki w Nekli (stan z ${esc(dateLong(DATA.built) || DATA.built || '')}).</p>` : `<p class="t-sm"><b>W katalogu biblioteki w Nekli</b>${e.nk.u ? ` · <a href="${esc(e.nk.u)}" target="_blank" rel="noopener">rekord</a>` : ''} <span class="faint">(stan z ${esc(dateLong(DATA.built) || DATA.built || '')}, aktualną dostępność sprawdzisz niżej)</span></p>`) : ''}
      ${hasProxy() ? `<div class="dc-avail"><button type="button" class="btn" data-avail>${icon('refresh', 16)}Sprawdź dostępność</button><span data-avail-out aria-live="polite">${keepAvail}</span></div>` : ''}
      ${e.pl?.lgs === 'abo+' ? '<p class="faint t-sm">W Legimi tylko w pakiecie „ebooki + audiobooki bez limitu”, droższym od zwykłego abonamentu.</p>' : ''}
      ${!e.pl?.legimi && !e.pl?.lc ? '<p class="faint t-sm">Nie znalazłem polskiego wydania w naszym zestawie. Książka może być dostępna tylko po angielsku.</p>' : ''}
    </section>
    ${rel.length ? `<section class="dc-rel"><span class="t-label">Często polecane razem z tą</span><div class="dc-rail dc-rail-s" role="group" aria-label="Podobne książki">${rel.map((o) => cardHTML(o, map)).join('')}</div></section>` : ''}`;
  ui.hydrate(body);
  if (keep) body.scrollTop = keepTop;
}

function onSheetClick(ev) {
  const t = ev.target.closest('[data-open],[data-want],[data-hide],[data-unhide],[data-avail],[data-back]');
  if (!t || !sheet) return;
  const e = BY_ID.get(sheet.id);
  if (t.dataset.open) return openEntry(t.dataset.open, { push: true });
  if (t.hasAttribute('data-back')) {
    sheet.id = sheet.trail.pop();
    drawSheet();
    return (sheet.rec.body.scrollTop = 0);
  }
  if (t.hasAttribute('data-want')) return want(e);
  if (t.hasAttribute('data-hide')) return hide(e);
  if (t.dataset.unhide) return unhide([t.dataset.unhide]);
  if (t.hasAttribute('data-avail')) return checkAvail(e, t, sheet.rec.body.querySelector('[data-avail-out]'));
}

// ---------- actions ----------
async function want(e) {
  const b = await store.addBook({
    title: titleOf(e), author: e.a, pages: e.p || null, year: e.y || null, isbn: e.isbn || '', coverUrl: coverUrl(e),
    genre: GENRE[e.g] || '', status: 'chce', source: 'odkrywaj', discoverId: e.id,
  });
  ui.toast(`„${shortTitle(titleOf(e))}” czeka w „Chcę przeczytać”`, { action: 'Cofnij', onAction: () => store.deleteBook(b.id) });
}
async function hide(e) {
  const h = [...hiddenSet(), e.id];
  await store.setSetting('discoverHidden', [...new Set(h)]);
  sheet?.rec.close();
  ui.toast(`Ukryto „${shortTitle(titleOf(e))}”`, { action: 'Cofnij', onAction: () => unhide([e.id]) });
}
async function unhide(ids) {
  const set = new Set(ids);
  await store.setSetting('discoverHidden', [...hiddenSet()].filter((x) => !set.has(x)));
}

function openHidden() {
  const rec = ui.openSheet('', { cls: 'dc-sheet', label: 'Ukryte książki' });
  const draw = () => {
    const list = [...hiddenSet()].map((id) => BY_ID.get(id)).filter(Boolean);
    if (!list.length) return rec.close();
    rec.body.innerHTML = `<h2 class="t-title" style="margin-bottom:4px">Ukryte (${list.length})</h2>
      <p class="muted t-sm" style="margin-bottom:var(--s3)">Te książki nie pojawiają się w propozycjach. Przywróć, jeśli zmieniłeś zdanie.</p>
      <ul class="dc-hlist">${list.map((e) => `<li><button type="button" class="dc-hopen" data-open="${esc(e.id)}">${ui.coverHTML(bookOf(e), 'xs')}<span><b class="t-book">${esc(shortTitle(titleOf(e)))}</b><span class="faint t-sm">${esc(e.a)}</span></span></button><button type="button" class="btn" data-unhide="${esc(e.id)}">Przywróć</button></li>`).join('')}</ul>
      ${list.length > 1 ? '<button type="button" class="btn wide" data-unhide-all style="margin-top:var(--s3)">Przywróć wszystkie</button>' : ''}`;
    ui.hydrate(rec.body);
  };
  draw();
  rec.body.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-open],[data-unhide],[data-unhide-all]');
    if (!t) return;
    if (t.dataset.open) return openEntry(t.dataset.open);
    if (t.hasAttribute('data-unhide-all')) await unhide([...hiddenSet()]);
    else await unhide([t.dataset.unhide]);
    if (!rec.closed) draw();
  });
}

// "Sprawdź dostępność": a read-only look at the Nekla catalogue. Nothing is written to the store (the book is not on your shelf).
let availBusy = false;
async function checkAvail(e, btn, out) {
  if (availBusy || !out) return;
  availBusy = true;
  btn.disabled = true;
  out.innerHTML = '<span class="faint">Sprawdzam katalog…</span>';
  try {
    const tmp = { title: titleOf(e), author: e.a };
    const tmpPl = e.pl?.t ? { title: e.pl.t, author: e.a } : null;
    let hits = [], failed = null, searchUrl = '';
    const qs = [...(tmpPl ? queriesFor(tmpPl) : []), ...queriesFor(tmp)].filter((q, i, a) => a.indexOf(q) === i).slice(0, 4);
    for (let i = 0; i < qs.length && !hits.length; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1500));
      const res = await libraryCheck(qs[i]);
      if (!res.ok) { failed = res; break; }
      searchUrl = res.searchUrl || searchUrl;
      hits = matchResults(tmp, res.results);
      // a Polish title with a transliterated author ("Dostojewski"): the exact title is enough
      if (!hits.length && e.pl?.t) hits = matchResults({ title: e.pl.t, author: '' }, res.results);
    }
    if (failed) {
      out.innerHTML = '<span class="dc-lib st-unk">Nie udało się połączyć z katalogiem</span>';
    } else {
      const avail = hits.find((h) => h.available === true);
      const best = avail || hits[0] || null;
      const k = !best ? 'brak' : avail ? 'dostepna' : best.available === false ? 'wypozyczona' : 'jest';
      const s = STATE[k];
      out.innerHTML = `<span class="dc-lib st-${s.cls}">${icon('library', 15)}Nekla: ${esc(s.label.toLowerCase())}</span>${best?.recordUrl ? ` <a class="t-sm" href="${esc(best.recordUrl)}" target="_blank" rel="noopener">Rekord</a>` : ''}`;
    }
  } catch {
    out.innerHTML = '<span class="dc-lib st-unk">Nie udało się sprawdzić</span>';
  } finally {
    availBusy = false;
    btn.disabled = false;
  }
}
