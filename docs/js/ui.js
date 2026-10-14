// Shared UI: sheets, toasts, confirm, star rating, covers & spines, ex libris, empty states.
// Sheets push a history entry so Android's Back gesture closes them instead of leaving the app.
import { esc, hash, pl, plN, shortTitle } from './util.js';
import { icon } from './icons.js';
import * as store from './store.js';

export { pl, plN, esc, icon };

const layers = document.getElementById('layers');
const toasts = document.getElementById('toasts');

// ---------- sheets ----------
const stack = [];
let ignorePops = 0;
function flushHistory() {
  if (ignorePops > 0) return;
  for (const r of stack)
    if (!r.pushed) {
      history.pushState({ sheet: 1 }, '');
      r.pushed = true;
    }
}

/**
 * Open a bottom sheet. Returns { el, body, close }.
 * Any element with [data-close] inside closes it. `full: true` = full-screen layer.
 */
export function openSheet(html, { full = false, cls = '', label = '', onClose } = {}) {
  const el = document.createElement('div');
  el.className = `overlay ${full ? 'full' : ''} ${cls}`;
  el.innerHTML = `<div class="backdrop"></div><div class="panel-s" role="dialog" aria-modal="true" ${label ? `aria-label="${esc(label)}"` : ''}>${full ? '' : '<div class="grab-zone" aria-hidden="true"><div class="grab"></div></div>'}<div class="panel-body">${html}</div></div>`;
  layers.appendChild(el);
  const rec = { el, body: el.querySelector('.panel-body'), onClose, pushed: false, closed: false };
  rec.close = () => closeRec(rec, false);
  stack.push(rec);
  flushHistory();
  el.querySelector('.backdrop').addEventListener('click', rec.close);
  const panel = el.querySelector('.panel-s');
  panel.tabIndex = -1;
  if (!full) bindSwipe(panel, rec);
  rec.body.addEventListener('click', (e) => e.target.closest('[data-close]') && rec.close());
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  setTimeout(() => !rec.closed && !panel.contains(document.activeElement) && panel.focus({ preventScroll: true }), 30);
  return rec;
}

function bindSwipe(panel, rec) {
  const body = rec.body;
  let sy = null, sx = 0, dragging = false, fromTop = false;
  panel.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return (sy = null);
    sy = e.touches[0].clientY; sx = e.touches[0].clientX; dragging = false;
    fromTop = !!e.target.closest('.grab-zone, .sheet-head');
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (sy === null) return;
    const dy = e.touches[0].clientY - sy, dx = e.touches[0].clientX - sx;
    if (!dragging) {
      if (dy > 6 && dy > Math.abs(dx) * 1.2 && (fromTop || body.scrollTop <= 0) && !e.target.closest('input[type=range], .stars.stars-in')) {
        dragging = true;
        panel.style.transition = 'none';
      } else if (Math.abs(dx) > 12 || dy < -6) return (sy = null);
      else return;
    }
    e.preventDefault();
    panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, { passive: false });
  const end = (e) => {
    if (sy === null || !dragging) return (sy = null);
    const dy = (e.changedTouches?.[0]?.clientY ?? sy) - sy;
    sy = null;
    panel.style.transition = '';
    if (dy > 90) rec.close();
    panel.style.transform = '';
  };
  panel.addEventListener('touchend', end);
  panel.addEventListener('touchcancel', end);
}

function closeRec(rec, fromPop) {
  if (rec.closed) return;
  rec.closed = true;
  const i = stack.indexOf(rec);
  if (i >= 0) stack.splice(i, 1);
  rec.el.classList.remove('in');
  setTimeout(() => rec.el.remove(), 300);
  try {
    rec.onClose?.();
  } catch (e) {
    console.error(e);
  }
  if (!fromPop && rec.pushed) {
    ignorePops++;
    history.back();
  }
}
addEventListener('popstate', (e) => {
  if (ignorePops > 0) {
    ignorePops--;
    flushHistory();
    e.stopImmediatePropagation();
    return;
  }
  const top = stack[stack.length - 1];
  if (top) {
    top.pushed = false;
    closeRec(top, true);
    e.stopImmediatePropagation();
  }
});
export const closeAll = () => [...stack].reverse().forEach((r) => r.close());
export const topSheet = () => stack[stack.length - 1] || null;
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const top = topSheet();
  if (top) {
    e.preventDefault();
    top.close();
  }
});

// ---------- toast ----------
/** toast('Zapisano') or toast('Usunięto', { action: 'Cofnij', onAction }) */
export function toast(msg, { action, onAction, ms = 3200 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  while (toasts.children.length >= 3) toasts.firstChild.remove();
  toasts.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const kill = () => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 220);
  };
  const t = setTimeout(kill, action ? ms + 2500 : ms);
  el.querySelector('button')?.addEventListener('click', () => {
    clearTimeout(t);
    kill();
    onAction?.();
  });
  return kill;
}

// ---------- confirm ----------
/** await confirmSheet({ title, text, ok: 'Usuń', danger: true }) → true / false */
export function confirmSheet({ title, text = '', ok = 'OK', cancel = 'Anuluj', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const rec = openSheet(
      `<h2 class="t-title" style="margin-bottom:8px">${esc(title)}</h2>
       ${text ? `<p class="muted t-read" style="margin-bottom:20px">${esc(text)}</p>` : ''}
       <div class="btn-row"><button class="btn" data-a="no">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${esc(ok)}</button></div>`,
      { label: title, onClose: () => !answered && resolve(false) }
    );
    rec.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      answered = true;
      resolve(b.dataset.a === 'yes');
      rec.close();
    });
  });
}

// ---------- stars (half steps) ----------
const STAR = 'M12 2.8l2.75 5.95 6.5.75-4.8 4.45 1.3 6.42L12 17.1l-5.75 3.27 1.3-6.42-4.8-4.45 6.5-.75z';
function starSvg(fill /* 0 | 0.5 | 1 */, i) {
  const id = `sh${i}${Math.random().toString(36).slice(2, 6)}`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="${id}"><rect x="0" y="0" width="${fill * 24}" height="24"/></clipPath></defs>
    <path d="${STAR}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
    ${fill ? `<path d="${STAR}" fill="currentColor" clip-path="url(#${id})"/>` : ''}</svg>`;
}
/** Read-only stars for a rating 0.5…5 (null → empty string unless `always`). */
export function stars(value, { size = 16, always = false } = {}) {
  if (!value && !always) return '';
  const v = Number(value) || 0;
  let s = '';
  for (let i = 1; i <= 5; i++) s += starSvg(v >= i ? 1 : v >= i - 0.5 ? 0.5 : 0, i);
  return `<span class="stars" style="--star-size:${size}px" role="img" aria-label="Ocena ${String(v).replace('.', ',')} z 5">${s}</span>`;
}
/** Interactive stars. Put `starsInput(value)` in HTML, then bindStars(el, v => …). Tap the left half for ½. */
export const starsInput = (value) => `<div class="stars stars-in" data-stars role="slider" tabindex="0" aria-label="Ocena" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${Number(value) || 0}" data-value="${Number(value) || 0}">${[1, 2, 3, 4, 5].map((i) => starSvg((Number(value) || 0) >= i ? 1 : (Number(value) || 0) >= i - 0.5 ? 0.5 : 0, i)).join('')}</div>`;
export function bindStars(el, onChange) {
  const set = (v) => {
    v = Math.max(0, Math.min(5, Math.round(v * 2) / 2));
    el.dataset.value = v;
    el.setAttribute('aria-valuenow', v);
    el.innerHTML = [1, 2, 3, 4, 5].map((i) => starSvg(v >= i ? 1 : v >= i - 0.5 ? 0.5 : 0, i)).join('');
    onChange(v || null);
  };
  const valueAt = (x) => {
    const svgs = [...el.querySelectorAll('svg')];
    for (let i = 0; i < svgs.length; i++) {
      const r = svgs[i].getBoundingClientRect();
      if (x <= r.right + 2) return i + (x < r.left + r.width / 2 ? 0.5 : 1);
    }
    return 5;
  };
  el.addEventListener('click', (e) => {
    const v = valueAt(e.clientX);
    set(Number(el.dataset.value) === v ? 0 : v); // tapping the same value clears it
  });
  el.addEventListener('keydown', (e) => {
    const v = Number(el.dataset.value) || 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), set(v + 0.5));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), set(v - 0.5));
  });
}

// ---------- call numbers (sygnatury) ----------
/** A reading-room shelf mark: three letters of the author's surname + the page count (or year). */
export function callNo(b) {
  const words = String(b?.author || '').trim().split(/\s+/).filter((w) => !/^(jr|sr|junior|senior|[ivx]+)\.?$/i.test(w));
  const sur = words.at(-1) || String(b?.title || '');
  const cls = (sur.replace(/[^\p{L}]/gu, '').slice(0, 3) || 'BEZ').toLocaleUpperCase('pl-PL');
  const no = Number(b?.pages) || Number(b?.year) || (hash(String(b?.id || b?.title || '')) % 900) + 100;
  return { cls, no: String(no) };
}

// ---------- covers ----------
// A book with no cover gets an ex-libris bookplate: [paper, ink]
const PLATES = [
  ['#F3EDE0', '#2A2620'],
  ['#EADFC8', '#5C2224'],
  ['#E3E6DA', '#2C4A36'],
  ['#ECDCD3', '#3D2A44'],
  ['#DCE2E4', '#24324F'],
  ['#EFE3C4', '#6A3A22'],
];
const EMBLEMS = [
  // open book
  '<path d="M4 23c4-2 8-2 12 0 4-2 8-2 12 0V9c-4-2-8-2-12 0-4-2-8-2-12 0z"/><path d="M16 9v14"/><path d="M7 13c2-.8 4-.8 6 0M7 17c2-.8 4-.8 6 0M19 13c2-.8 4-.8 6 0M19 17c2-.8 4-.8 6 0" stroke-width=".8"/><path d="M11 4.5c3 1.5 7 1.5 10 0" stroke-width=".9"/>',
  // banker's lamp
  '<path d="M5 17c0-4.5 4.9-7 11-7s11 2.5 11 7z"/><path d="M4 17h24M16 10V6.5M16 17v7M10.5 26h11"/><circle cx="16" cy="5.5" r="1" fill="currentColor" stroke="none"/>',
  // laurel
  '<path d="M10 26C5 21 5 12 10 6M22 26c5-5 5-14 0-20"/><path d="M8.6 21.5l-3-1M7.2 16.5l-3-.2M7.6 11.5l-2.6 1M9.3 8l-2-1.8M23.4 21.5l3-1M24.8 16.5l3-.2M24.4 11.5l2.6 1M22.7 8l2-1.8" stroke-width=".9"/><path d="M13 27.5h6"/>',
  // compass star
  '<path d="M16 4l2.6 9.4L28 16l-9.4 2.6L16 28l-2.6-9.4L4 16l9.4-2.6z"/><circle cx="16" cy="16" r="2"/>',
];
export function plateOf(b) {
  const h = hash(`${b.title}|${b.author}`);
  return { paper: PLATES[h % PLATES.length], emblem: EMBLEMS[(h >>> 8) % EMBLEMS.length] };
}

/** Generated ex-libris bookplate (no image). */
export function jacketHTML(b) {
  const { paper, emblem } = plateOf(b);
  const title = shortTitle(b.title) || 'Bez tytułu';
  const len = title.length;
  const fs = len <= 10 ? 13 : len <= 18 ? 11.5 : len <= 30 ? 10 : len <= 48 ? 8.5 : 7.2;
  const ini = (title.match(/\p{L}|\d/u)?.[0] || 'Z').toLocaleUpperCase('pl-PL');
  return `<div class="jacket bookplate" style="--bp:${paper[0]};--bpi:${paper[1]};--fs:${fs}">
    <div class="bp-frame">
      <span class="bp-ex">Ex libris</span>
      <svg class="bp-emb" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${emblem}</svg>
      <span class="bp-ini" aria-hidden="true">${esc(ini)}</span>
      <span class="bp-title">${esc(title)}</span>
      ${b.author ? `<span class="bp-author">${esc(b.author)}</span>` : ''}
    </div>
  </div>`;
}

/**
 * Book cover: own photo → remote cover → generated bookplate (always underneath as the fallback).
 * size: 'xs' | 's' | 'm' | 'l' | 'xl'. Call hydrate(root) after inserting HTML to load stored photos.
 * `ribbon: true` marks the book in hand: a call slip sticks out of its top edge.
 */
export function coverHTML(b, size = 'm', { ribbon = false } = {}) {
  if (!b) return '';
  let img = '';
  if (b.coverPhotoId) {
    const u = store.cachedPhotoUrl(b.coverPhotoId);
    img = `<img class="cover-img" alt="" data-photo="${esc(b.coverPhotoId)}" ${u ? `src="${u}"` : ''}>`;
  } else if (b.coverUrl) {
    img = `<img class="cover-img" alt="" loading="lazy" decoding="async" crossorigin="anonymous" referrerpolicy="no-referrer" src="${esc(b.coverUrl)}">`;
  }
  return `<div class="cover c-${size}" role="img" aria-label="Okładka: ${esc(b.title)}">${jacketHTML(b)}${img}${ribbon ? '<i class="cover-slip" aria-hidden="true"></i>' : ''}</div>`;
}

/** Fill in stored photos (data-photo) inside root. */
export function hydrate(root) {
  for (const img of root.querySelectorAll('img[data-photo]:not([src])')) {
    store.photoUrl(img.dataset.photo).then((u) => (u ? (img.src = u) : img.remove()));
  }
}
// A remote cover that fails (404 with ?default=false, offline) is removed, revealing the bookplate.
// Tiny images (OL's 1×1 "no cover") are treated the same.
document.addEventListener('error', (e) => e.target?.classList?.contains('cover-img') && e.target.remove(), true);
document.addEventListener('load', (e) => {
  const t = e.target;
  if (t?.classList?.contains('cover-img') && t.naturalWidth < 8) t.remove();
  else if (t?.classList?.contains('cover-img')) t.classList.add('ok');
}, true);

// Library buckram for the spines on the shelf
export const BUCKRAM = ['#2C4A36', '#5C2224', '#24324F', '#7E5A33', '#231D19', '#47525A', '#3D2A44', '#6A3A22'];
export const spineWidth = (b) => Math.round(Math.max(26, Math.min(56, 20 + (Number(b.pages) || 300) / 18)));

/** A buckram spine for the shelf. Height & thickness follow the page count; a white call-number label at the foot. */
export function spineHTML(b, { current = false } = {}) {
  const pages = Number(b.pages) || 300;
  const w = spineWidth(b);
  const h = 150 + (hash(b.id || b.title) % 5) * 8 + Math.min(20, pages / 60);
  const full = String(b.title || 'Bez tytułu');
  const title = shortTitle(full) || full; // a spine carries the main title only
  const bg = BUCKRAM[hash(`${b.title}|${b.author}`) % BUCKRAM.length];
  const { cls, no } = callNo(b);
  // fit the title along the spine: shrink the type, and on thick spines allow a second line
  const avail = h - 62; // minus padding, band and the call-number label
  let fs = Math.max(9, Math.min(13.5, avail / (title.length * 0.55)));
  const two = title.length * 0.55 * fs > avail && w >= 36;
  if (two) fs = Math.max(9, Math.min(12, (avail * 2) / (title.length * 0.55)));
  return `<button class="spine${two ? ' two' : ''}${current ? ' current' : ''}${b.status === 'przeczytane' ? ' done' : ''}" data-book="${esc(b.id)}" style="--bg:${bg};--w:${w}px;--h:${Math.round(h)}px;--fs:${fs.toFixed(1)}px" aria-label="${esc(full)}${b.author ? `, ${esc(b.author)}` : ''}">
    <span class="sp-band"></span>
    <span class="sp-title">${esc(title)}</span>
    <span class="sp-label" aria-hidden="true">${esc(cls)}<br>${esc(no)}</span>
    ${current ? '<i class="sp-slip" aria-hidden="true"></i>' : ''}
  </button>`;
}

// ---------- ex libris ----------
/** Round library stamp for a finished book, in violet stamp ink. */
export function exlibris(year, size = 74) {
  const id = `ex${Math.random().toString(36).slice(2, 7)}`;
  return `<svg class="exlibris" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Przeczytane${year ? ` w ${year}` : ''}">
    <defs><path id="${id}" d="M50 50m-35 0a35 35 0 1 1 70 0a35 35 0 1 1-70 0"/></defs>
    <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" stroke-width="2.6"/>
    <circle cx="50" cy="50" r="43.5" fill="none" stroke="currentColor" stroke-width=".9"/>
    <circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <text font-family="Marcellus, serif" font-size="10" letter-spacing="2.4" fill="currentColor"><textPath href="#${id}">EX LIBRIS · PRZECZYTANE ·</textPath></text>
    <g transform="translate(36 30) scale(.875)" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${EMBLEMS[1]}</g>
    ${year ? `<text x="50" y="69" text-anchor="middle" font-family="Marcellus, serif" font-size="9" letter-spacing="1" fill="currentColor">${year}</text>` : ''}
  </svg>`;
}

// ---------- empty state ----------
const OPEN_BOOK = `<svg class="fig" viewBox="0 0 112 76" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M8 18c16-6 32-5 48 4 16-9 32-10 48-4v48c-16-6-32-5-48 4-16-9-32-10-48-4z"/><path d="M56 22v48"/>
  <path d="M18 30c9-2 18-1.5 28 2M18 38c9-2 18-1.5 28 2M18 46c9-2 18-1.5 28 2M66 32c10-3.5 19-4 28-2M66 40c10-3.5 19-4 28-2" opacity=".5"/>
  <path d="M79 4h10v30l-5-4-5 4z" stroke="var(--glass)" stroke-width="1.8"/></svg>`;
/** empty({ title, text, action: 'Dodaj książkę', actionAttr: 'data-act="add"' }) */
export function empty({ title, text = '', action = '', actionAttr = '' }) {
  return `<div class="empty">${OPEN_BOOK}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action ? `<button class="btn primary" ${actionAttr}>${icon('plus', 19)}${esc(action)}</button>` : ''}</div>`;
}

/** Progress (0..1): a brass ruler with a green glass bead. Update live by setting --k on .thread. */
export const thread = (p) => `<div class="thread" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}" style="--k:${p.toFixed(3)}"><i></i><b></b></div>`;

/** Yearly goal as numbered brass tokens; one is polished for each finished book. */
export function tokens(done, goal, { small = false } = {}) {
  const n = Math.max(0, Math.min(Number(goal) || 0, 120));
  let s = '';
  for (let i = 0; i < n; i++) s += `<i class="${i < done ? 'f' : ''}">${i + 1}</i>`;
  return `<div class="tokens${small ? ' small' : ''}" role="img" aria-label="${done} z ${goal}">${s}</div>`;
}

/** The green-glass banker's lamp over the Start panel. */
export const LAMP = `<svg class="lamp" viewBox="0 0 120 88" aria-hidden="true"><defs>
  <linearGradient id="lmp-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:#4DB27E"/><stop offset=".5" style="stop-color:var(--glass)"/><stop offset="1" style="stop-color:#0C3A23"/></linearGradient>
  <radialGradient id="lmp-l" cx=".5" cy="0" r="1"><stop offset="0" style="stop-color:var(--glow);stop-opacity:.6"/><stop offset="1" style="stop-color:var(--glow);stop-opacity:0"/></radialGradient>
  <linearGradient id="lmp-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--brass-hi)"/><stop offset="1" style="stop-color:#7E6128"/></linearGradient></defs>
  <path class="lamp-light" d="M16 44h88l16 44H0z" fill="url(#lmp-l)"/>
  <rect x="57.5" y="0" width="5" height="16" fill="url(#lmp-b)"/><circle cx="60" cy="16" r="3.4" fill="url(#lmp-b)"/>
  <path d="M8 43C8 25 30 18 60 18s52 7 52 25z" fill="url(#lmp-g)"/>
  <path d="M20 34c9-8 24-11 40-11" stroke="rgba(255,255,255,.45)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <rect x="6" y="41.5" width="108" height="4" rx="2" fill="url(#lmp-b)"/>
  <path d="M88 45v16" stroke="var(--brass-hi)" stroke-width="1" stroke-dasharray="1.6 1.2"/><circle cx="88" cy="63" r="2.4" fill="url(#lmp-b)"/></svg>`;

/** Close every sheet, wait for the Back-history to settle, then run fn (used before navigating). */
export function closeAllThen(fn) {
  if (!stack.length) return fn();
  closeAll();
  const t0 = Date.now();
  const wait = () => (ignorePops === 0 || Date.now() - t0 > 600 ? fn() : setTimeout(wait, 16));
  setTimeout(wait, 16);
}
