// Sesja: timer czytania (oparty o znaczniki czasu), zapis sesji, tempo i szacunek końca książki.
// Exports: render (zakładka Sesja), plus helpers used by Start / Statystyki:
//   runningSession(), activeMs(s), sessionPages(s), speedOf(sessions), todayMinutes(), durText(ms).
import * as store from './store.js';
import * as ui from './ui.js';
import { icon } from './icons.js';
import { esc, plN, ymd, todayStr, dateShort, timeOf, clamp } from './util.js';

const DAY = 86400000;
const MIN_SPEED_MS = 10 * 60000; // below this much reading time the speed is not meaningful

// ---------- model ----------
/** The session in progress: { bookId, start, pausedMs, pausedAt|null, fromPage } or null. Lives in settings → survives reload. */
export const runningSession = () => store.setting('runningSession') || null;
const setRunning = (v) => store.setSetting('runningSession', v);

/** Reading time in ms. Works for a running, paused or saved session. */
export const activeMs = (s, now = Date.now()) => Math.max(0, (s.end ?? s.pausedAt ?? now) - s.start - (s.pausedMs || 0));
export const sessionPages = (s) => Math.max(0, (Number(s.toPage) || 0) - (Number(s.fromPage) || 0));

/** Pages per hour over sessions, or null when there is too little data. */
export function speedOf(list) {
  let ms = 0, pg = 0;
  for (const s of list) {
    const p = sessionPages(s);
    if (p > 0) (pg += p), (ms += activeMs(s));
  }
  return ms >= MIN_SPEED_MS ? pg / (ms / 3600000) : null;
}

export function durText(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'mniej niż minutę';
  const h = Math.floor(m / 60);
  return h ? `${h}\u00a0h${m % 60 ? ` ${m % 60}\u00a0min` : ''}` : `${m}\u00a0min`;
}

/** Minutes read today (finished sessions + the one in progress). */
export function todayMinutes() {
  const t = todayStr();
  let ms = store.where('sessions', (s) => ymd(new Date(s.start)) === t).reduce((a, s) => a + activeMs(s), 0);
  const r = runningSession();
  if (r && ymd(new Date(r.start)) === t) ms += activeMs(r);
  return Math.round(ms / 60000);
}

const sessionsOf = (bookId) => store.where('sessions', (s) => s.bookId === bookId).sort((a, b) => b.start - a.start);

const GEN = ['niedzieli', 'poniedziałku', 'wtorku', 'środy', 'czwartku', 'piątku', 'soboty'];
const fmtDM = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long' });

/** "Zostało około 3 h 20 min czytania. Skończysz około czwartku." (or a gentle invitation when there is no data yet). */
export function estimate(b) {
  if (!b.pages) return { text: 'Dodaj liczbę stron książki, a oszacuję, kiedy ją skończysz.' };
  const left = b.pages - (Number(b.currentPage) || 0);
  if (left <= 0) return { text: 'To już ostatnia strona — gratulacje!' };
  const own = sessionsOf(b.id);
  const ownSpeed = speedOf(own);
  const speed = ownSpeed || speedOf(store.all('sessions'));
  if (!speed) return { text: 'Przeczytaj kilka stron z włączonym timerem, a podpowiem, kiedy skończysz.' };
  const needMs = (left / speed) * 3600000;
  // recent daily pace: reading time per calendar day over the last 14 days (shorter if you only just began)
  const now = Date.now();
  const recent = store.where('sessions', (s) => s.start > now - 14 * DAY);
  let text = `Zostało około ${durText(needMs)} czytania`;
  let when = '';
  if (recent.length) {
    const first = Math.min(...recent.map((s) => s.start));
    const span = clamp(Math.ceil((now - first) / DAY), 1, 14);
    const perDay = recent.reduce((a, s) => a + activeMs(s), 0) / span;
    if (perDay >= 60000) {
      const days = Math.ceil(needMs / perDay);
      const d = new Date(now + days * DAY);
      if (days <= 0) when = 'jeszcze dziś';
      else if (days === 1) when = 'jutro';
      else if (days <= 6) when = `około\u00a0${GEN[d.getDay()]}`;
      else if (days <= 200) when = `około\u00a0${fmtDM.format(d).replace(' ', '\u00a0')}`;
    }
  }
  const basis = ownSpeed ? 'z Twojego tempa przy tej książce' : 'z Twojego średniego tempa';
  return { text: when ? `${text}. Skończysz ${when}.` : `${text}.`, speed, basis };
}

// ---------- screen ----------
let selId = null;
const pad2 = (n) => String(n).padStart(2, '0');
function clockText(ms) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

let wake = null;
async function holdScreen(on) {
  try {
    if (on && 'wakeLock' in navigator && !wake && document.visibilityState === 'visible') {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => (wake = null));
    } else if (!on && wake) {
      await wake.release();
      wake = null;
    }
  } catch {
    wake = null;
  }
}

function pickBook(ctx) {
  const run = runningSession();
  if (run && store.book(run.bookId)) return store.book(run.bookId);
  const q = ctx.query.get('book');
  if (q && store.book(q)) selId = q;
  if (selId && store.book(selId)) return store.book(selId);
  const reading = store.books().filter((b) => b.status === 'czytam').sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return reading[0] || null;
}

export function render(el, ctx) {
  const run = runningSession();
  const b = pickBook(ctx);
  if (run && !b) setRunning(null); // the book was deleted under a running session

  if (!b) {
    const any = store.books().length;
    el.innerHTML = `<header class="screen-head"><h1 class="t-display">Sesja</h1></header>` +
      ui.empty({
        title: any ? 'Nic teraz nie czytasz' : 'Najpierw książka',
        text: any ? 'Zacznij którąś z półki „Chcę przeczytać”, a odmierzę Ci czas czytania.' : 'Dodaj książkę, którą czytasz, i wróć tu z zegarkiem w ręku.',
        action: any ? 'Przejdź na półkę' : 'Dodaj książkę',
        actionAttr: any ? 'data-go="polka?polka=chce"' : 'data-go="polka"',
      });
    return;
  }

  const paused = !!(run && run.pausedAt);
  const own = sessionsOf(b.id);
  const p = store.progressOf(b);
  const est = estimate(b);
  const reading = b.status === 'czytam';
  const ownMs = own.reduce((a, s) => a + activeMs(s), 0);
  const ownSpeed = speedOf(own);

  el.innerHTML = `
    <header class="screen-head"><h1 class="t-display">Sesja</h1></header>

    <section class="ss-book">
      <button class="ss-cover" data-act="pick" ${run ? 'disabled' : ''} aria-label="${run ? esc(b.title) : 'Zmień książkę'}">${ui.coverHTML(b, 'm', { ribbon: reading })}</button>
      <div class="ss-meta">
        <p class="t-book ss-title">${esc(b.title)}</p>
        <p class="muted ss-author">${esc(b.author || '')}</p>
        ${b.pages ? `<div class="ss-prog">${ui.thread(p)}<p class="t-sm num faint">strona ${b.currentPage || 0} z ${b.pages}</p></div>` : `<p class="t-sm faint num">strona ${b.currentPage || 0}</p>`}
        ${run ? '' : `<button class="link-btn ss-change" data-act="pick">Zmień książkę</button>`}
      </div>
    </section>

    <section class="ss-timer ${run ? (paused ? 'paused' : 'live') : ''}" aria-label="Timer">
      <p class="t-label ss-state">${run ? (paused ? 'Przerwa' : 'Czytasz') : 'Gotowy'}</p>
      <output class="ss-clock num" id="clock" role="timer" aria-live="off">${clockText(run ? activeMs(run) : 0)}</output>
      <p class="faint t-sm ss-sub">${run ? `od ${timeOf(run.start)} · od strony ${run.fromPage}` : reading ? 'Wciśnij start, kiedy otworzysz książkę.' : 'Ta książka nie jest teraz na półce „Czytam”.'}</p>
      <div class="ss-controls">
        ${run
          ? `<button class="btn ss-main" data-act="${paused ? 'resume' : 'pause'}">${paused ? 'Wznów' : 'Przerwa'}</button>
             <button class="btn primary ss-main" data-act="stop">Zakończ</button>`
          : reading
          ? `<button class="btn primary ss-start" data-act="start">${icon('timer')}Zacznij czytać</button>`
          : `<button class="btn primary ss-start" data-act="begin">Zacznij czytać tę książkę</button>`}
      </div>
      ${run ? `<p class="faint t-sm ss-hint">${wake || 'wakeLock' in navigator ? 'Ekran nie zgaśnie na czas czytania. ' : ''}Możesz zamknąć aplikację — czas liczy się dalej.</p>` : ''}
    </section>

    <section class="ss-est panel">
      <span class="t-label">Kiedy skończysz</span>
      <p class="t-read ss-est-text">${esc(est.text)}</p>
      ${est.speed ? `<p class="faint t-sm num">${Math.round(est.speed)} str./h · ${est.basis}</p>` : ''}
    </section>

    <section class="section">
      <div class="section-head"><h2>Historia sesji</h2>${run ? '' : `<button class="link-btn" data-act="manual" aria-label="Dodaj dawną sesję ręcznie">${icon('plus', 18)}Dodaj dawną</button>`}</div>
      ${own.length
        ? `<p class="faint t-sm num ss-total">${plN(own.length, 'sesja', 'sesje', 'sesji')} · ${durText(ownMs)}${ownSpeed ? ` · ${Math.round(ownSpeed)} str./h` : ''}</p>
           <ul class="list ss-list">${own.slice(0, 30).map(sessionRow).join('')}</ul>`
        : `<p class="faint">Jeszcze żadnej sesji przy tej książce. Pierwsza zawsze jest najtrudniejsza — potem to już nawyk.</p>`}
    </section>`;

  // ---- live clock (updates only the text node) ----
  let timer = null;
  const clock = el.querySelector('#clock');
  if (run && !paused) {
    timer = setInterval(() => (clock.textContent = clockText(activeMs(run))), 500);
    holdScreen(true);
  } else holdScreen(false);
  const onVis = () => {
    if (document.visibilityState === 'visible') {
      if (run && !paused) (clock.textContent = clockText(activeMs(run))), holdScreen(true);
    }
  };
  document.addEventListener('visibilitychange', onVis);

  el.onclick = async (e) => {
    const t = e.target.closest('[data-act],[data-del]');
    if (!t) return;
    if (t.dataset.del) return deleteSession(t.dataset.del);
    const a = t.dataset.act;
    if (a === 'pick') return openPicker(b, ctx);
    if (a === 'manual') return openManual(b);
    if (a === 'begin') {
      await store.setStatus(b.id, 'czytam');
      return;
    }
    if (a === 'start') {
      await setRunning({ bookId: b.id, start: Date.now(), pausedMs: 0, pausedAt: null, fromPage: Number(b.currentPage) || 0 });
      return;
    }
    const r = runningSession();
    if (!r) return;
    if (a === 'pause') return setRunning({ ...r, pausedAt: Date.now() });
    if (a === 'resume') return setRunning({ ...r, pausedMs: (r.pausedMs || 0) + (Date.now() - r.pausedAt), pausedAt: null });
    if (a === 'stop') return openStop(r, b);
  };

  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
    holdScreen(false);
  };
}

function sessionRow(s) {
  const ms = activeMs(s), pg = sessionPages(s);
  const sp = pg > 0 && ms >= 120000 ? Math.round(pg / (ms / 3600000)) : null;
  return `<li><button class="row ss-row" data-del="${esc(s.id)}" aria-label="Sesja z ${esc(dateShort(s.start))} — usuń">
    <span class="grow"><span class="num">${esc(dateShort(s.start))}, ${esc(timeOf(s.start))}</span>
      <span class="faint t-sm num">${durText(ms)}${pg ? ` · ${plN(pg, 'strona', 'strony', 'stron')}` : ''}${s.fromPage || s.toPage ? ` · ${s.fromPage}→${s.toPage}` : ''}${sp ? ` · ${sp} str./h` : ''}</span></span>
    ${icon('trash', 18, 'chev')}</button></li>`;
}

async function deleteSession(id) {
  const ok = await ui.confirmSheet({ title: 'Usunąć tę sesję?', text: 'Zniknie z historii i statystyk. Postęp w książce zostaje bez zmian.', ok: 'Usuń', danger: true });
  if (ok) {
    await store.del('sessions', id);
    ui.toast('Sesja usunięta');
  }
}

// ---------- book picker ----------
function openPicker(cur, ctx) {
  const rows = (list) => list.map((x) => `<li><button class="row" data-pick="${esc(x.id)}"><span class="ss-pick-cover">${ui.coverHTML(x, 's')}</span><span class="grow"><b class="t-book">${esc(x.title)}</b><br><span class="faint t-sm">${esc(x.author || '')}</span></span>${x.id === cur.id ? icon('check', 20, 'chev') : ''}</button></li>`).join('');
  const reading = store.books().filter((x) => x.status === 'czytam').sort((a, c) => (c.updated || 0) - (a.updated || 0));
  const want = store.books().filter((x) => x.status === 'chce');
  const rec = ui.openSheet(
    `<div class="sheet-head"><h2>Którą książkę czytasz?</h2></div>
     ${reading.length ? `<p class="t-label">Czytam</p><ul class="list">${rows(reading)}</ul>` : ''}
     ${want.length ? `<p class="t-label" style="margin-top:16px">Chcę przeczytać</p><ul class="list">${rows(want)}</ul>` : ''}`,
    { label: 'Wybór książki' }
  );
  ui.hydrate(rec.body);
  rec.body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-pick]');
    if (!t) return;
    selId = t.dataset.pick;
    rec.close();
    ctx.refresh();
  });
}

// ---------- stop & save ----------
function openStop(r0, b) {
  const wasRunning = !r0.pausedAt;
  let r = r0;
  if (wasRunning) {
    r = { ...r0, pausedAt: Date.now() };
    setRunning(r); // freeze the clock while the sheet is open
  }
  const ms = activeMs(r);
  const speed = speedOf(sessionsOf(b.id)) || speedOf(store.all('sessions'));
  let guess = r.fromPage;
  if (speed) guess = Math.round(r.fromPage + speed * (ms / 3600000));
  if (b.pages) guess = Math.min(guess, b.pages);
  guess = Math.max(guess, r.fromPage);
  let done = false;
  const rec = ui.openSheet(
    `<div class="sheet-head"><h2>Na której stronie skończyłeś?</h2></div>
     <p class="muted ss-stop-sum num">Czytałeś ${durText(ms)}, od strony ${r.fromPage}.</p>
     <form class="page-form">
       <div class="page-input"><button type="button" class="icon-btn" data-d="-1" aria-label="Mniej">−</button>
         <input name="page" inputmode="numeric" value="${guess}" aria-label="Strona, na której skończyłeś" class="num">
         <button type="button" class="icon-btn" data-d="1" aria-label="Więcej">+</button></div>
       <p class="faint t-sm center">${b.pages ? `z ${plN(b.pages, 'strony', 'stron', 'stron')}` : ''}${speed ? ' · podpowiedź z Twojego tempa' : ''}</p>
       <button class="btn primary wide" style="margin-top:18px">Zapisz sesję</button>
       <div class="btn-row" style="margin-top:8px"><button type="button" class="btn ghost" data-close>Wróć do czytania</button><button type="button" class="btn ghost" data-act="discard">Odrzuć</button></div>
     </form>`,
    {
      label: 'Zakończ sesję',
      onClose: () => {
        if (done) return;
        const cur = runningSession();
        if (wasRunning && cur?.pausedAt) setRunning({ ...cur, pausedMs: (cur.pausedMs || 0) + (Date.now() - cur.pausedAt), pausedAt: null });
      },
    }
  );
  const f = rec.body.querySelector('form');
  rec.body.querySelectorAll('[data-d]').forEach((btn) => (btn.onclick = () => (f.page.value = Math.max(0, (Number(f.page.value) || 0) + Number(btn.dataset.d)))));
  rec.body.querySelector('[data-act=discard]').onclick = async () => {
    if (!(await ui.confirmSheet({ title: 'Odrzucić sesję?', text: 'Ten czas nie zostanie zapisany.', ok: 'Odrzuć', danger: true }))) return;
    done = true;
    rec.close();
    await setRunning(null);
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    let page = Math.max(0, Number(String(f.page.value).replace(/\D/g, '')) || 0);
    if (b.pages) page = Math.min(page, b.pages);
    done = true;
    rec.close();
    const s = await store.put('sessions', { bookId: b.id, start: r.start, end: r.pausedAt, pausedMs: r.pausedMs || 0, fromPage: r.fromPage, toPage: page });
    await setRunning(null);
    await afterSave(b, s, page);
  };
  setTimeout(() => f.page.select(), 300);
}

async function afterSave(b, s, page) {
  await store.updateBook(b.id, { currentPage: page });
  const ms = activeMs(s), pg = sessionPages(s);
  const sp = pg > 0 && ms >= 60000 ? ` · ${Math.round(pg / (ms / 3600000))} str./h` : '';
  ui.toast(pg ? `${plN(pg, 'strona', 'strony', 'stron')} w ${durText(ms)}${sp}` : `Sesja zapisana: ${durText(ms)}`);
  if (b.pages && page >= b.pages && b.status === 'czytam') {
    if (await ui.confirmSheet({ title: 'Koniec książki?', text: 'To już ostatnia strona. Przenieść na półkę „Przeczytane”?', ok: 'Tak, przeczytana' })) {
      await store.setStatus(b.id, 'przeczytane');
      ui.toast('Gratulacje! Kolejna przeczytana.');
    }
  }
}

// ---------- manual session ----------
function openManual(b) {
  const now = new Date();
  const from = Number(b.currentPage) || 0;
  const rec = ui.openSheet(
    `<div class="sheet-head"><h2>Dodaj sesję ręcznie</h2></div>
     <p class="muted" style="margin-bottom:var(--s4)">${esc(b.title)}</p>
     <form class="ss-manual">
       <div class="field-row">
         <label class="field"><span class="t-label">Dzień</span><input type="date" name="day" value="${todayStr()}" max="${todayStr()}" required></label>
         <label class="field"><span class="t-label">Godzina</span><input type="time" name="time" value="${pad2(now.getHours())}:${pad2(now.getMinutes())}" required></label>
       </div>
       <label class="field"><span class="t-label">Ile minut</span><input name="min" inputmode="numeric" placeholder="np. 40" required></label>
       <div class="field-row">
         <label class="field"><span class="t-label">Od strony</span><input name="from" inputmode="numeric" value="${from}"></label>
         <label class="field"><span class="t-label">Do strony</span><input name="to" inputmode="numeric" placeholder="${b.pages ? 'max ' + b.pages : ''}"></label>
       </div>
       <p class="ss-err t-sm" role="alert" hidden></p>
       <button class="btn primary wide">Zapisz sesję</button>
     </form>`,
    { label: 'Dodaj sesję ręcznie' }
  );
  const f = rec.body.querySelector('form');
  const err = rec.body.querySelector('.ss-err');
  const num = (v) => Number(String(v).replace(/\D/g, '')) || 0;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const min = num(f.min.value);
    const fromP = num(f.from.value);
    let toP = f.to.value.trim() === '' ? fromP : num(f.to.value);
    if (b.pages) toP = Math.min(toP, b.pages);
    const start = new Date(`${f.day.value}T${f.time.value}`).getTime();
    const bad = !min ? 'Wpisz, ile minut trwała sesja.' : !start ? 'Podaj dzień i godzinę.' : start > Date.now() ? 'Ta sesja jest jeszcze w przyszłości.' : toP < fromP ? 'Strona końcowa nie może być przed początkową.' : '';
    if (bad) return (err.textContent = bad), (err.hidden = false);
    rec.close();
    const s = await store.put('sessions', { bookId: b.id, start, end: start + min * 60000, pausedMs: 0, fromPage: fromP, toPage: toP, manual: true });
    if (toP > (Number(b.currentPage) || 0)) await afterSave(b, s, toP);
    else ui.toast('Sesja dodana');
  };
}
