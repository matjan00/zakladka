// Shared UI: sheets, toasts, confirm, star rating, covers & spines, ex libris, empty states.
// Sheets push a history entry so Android's Back gesture closes them instead of leaving the app.
import { esc, hash, pl, plN } from './util.js';
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
  return `<span class="stars" style="--star:${size}px" role="img" aria-label="Ocena ${String(v).replace('.', ',')} z 5">${s}</span>`;
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

// ---------- covers ----------
// Jacket inks of a Polish publisher's series: [ground, lettering, figure]
export const JACKETS = [
  ['#C8922A', '#1C1A16', '#7A2E1C'], // ochre
  ['#C3402A', '#F6EEDF', '#1C1A16'], // vermilion
  ['#2C4A8C', '#F3EBDA', '#E2B54A'], // cobalt
  ['#1F4A40', '#EBD9A6', '#C3402A'], // bottle green
  ['#5E2B47', '#F0D9C9', '#D98C78'], // plum
  ['#6B7135', '#F4EFE6', '#D9B64C'], // olive
  ['#D98C78', '#2A1C18', '#5E2B47'], // rose
  ['#3E4A52', '#E9C46A', '#8FB3C4'], // slate
  ['#6E1F22', '#E8D8B8', '#C8922A'], // oxblood
  ['#8FB3C4', '#1C1A16', '#2C4A8C'], // sky
];
const MOTIFS = ['sun', 'arch', 'bands', 'half', 'diag', 'stack', 'label'];
const FIG = {
  sun: (a) => `<circle cx="72" cy="44" r="34" fill="${a}"/>`,
  arch: (a) => `<path d="M22 150V96a28 28 0 0 1 56 0v54z" fill="${a}"/>`,
  bands: (a) => `<rect x="0" y="16" width="100" height="5" fill="${a}"/><rect x="0" y="25" width="100" height="2" fill="${a}"/><rect x="0" y="128" width="100" height="2" fill="${a}"/><rect x="0" y="133" width="100" height="5" fill="${a}"/>`,
  half: (a) => `<path d="M-4 150a54 54 0 0 1 108 0z" fill="${a}"/>`,
  diag: (a) => `<path d="M100 58 100 150 8 150z" fill="${a}"/>`,
  // figure in the upper half: the lettering sits underneath it, never across it
  stack: (a, f) => `<rect x="14" y="16" width="40" height="40" fill="${a}"/><rect x="38" y="34" width="40" height="40" fill="none" stroke="${f}" stroke-width="2.4"/>`,
  label: (a, f) => `<rect x="7" y="7" width="86" height="136" fill="none" stroke="${a}" stroke-width="1.6"/><rect x="14" y="44" width="72" height="56" fill="${f}"/>`,
};
export function jacketOf(b) {
  const h = hash(`${b.title}|${b.author}`);
  return { ink: JACKETS[h % JACKETS.length], motif: MOTIFS[(h >>> 8) % MOTIFS.length] };
}

/** Generated typographic jacket (no image). */
export function jacketHTML(b) {
  const { ink, motif } = jacketOf(b);
  const [bg, fg, ac] = ink;
  const title = String(b.title || 'Bez tytułu');
  const len = title.length;
  const fs = len <= 8 ? 15 : len <= 16 ? 12.5 : len <= 28 ? 10.5 : len <= 48 ? 9 : 7.5;
  const pos = motif === 'sun' || motif === 'stack' ? 'bottom' : motif === 'half' || motif === 'arch' || motif === 'diag' ? 'top' : 'mid';
  return `<div class="jacket j-${motif} j-${pos}" style="--bg:${bg};--fg:${fg};--ac:${ac};--fs:${fs}">
    <svg class="j-fig" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">${FIG[motif](ac, fg)}</svg>
    <div class="j-text"><div class="j-title">${esc(title)}</div>${b.author ? `<div class="j-author">${esc(b.author)}</div>` : ''}</div>
  </div>`;
}

/**
 * Book cover: own photo → remote cover → generated jacket (always underneath as the fallback).
 * size: 'xs' | 's' | 'm' | 'l' | 'xl'. Call hydrate(root) after inserting HTML to load stored photos.
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
  return `<div class="cover c-${size}" role="img" aria-label="Okładka: ${esc(b.title)}">${jacketHTML(b)}${img}${ribbon ? '<i class="cover-ribbon" aria-hidden="true"></i>' : ''}</div>`;
}

/** Fill in stored photos (data-photo) inside root. */
export function hydrate(root) {
  for (const img of root.querySelectorAll('img[data-photo]:not([src])')) {
    store.photoUrl(img.dataset.photo).then((u) => (u ? (img.src = u) : img.remove()));
  }
}
// A remote cover that fails (404 with ?default=false, offline) is removed, revealing the jacket.
// Tiny images (OL's 1×1 "no cover") are treated the same.
document.addEventListener('error', (e) => e.target?.classList?.contains('cover-img') && e.target.remove(), true);
document.addEventListener('load', (e) => {
  const t = e.target;
  if (t?.classList?.contains('cover-img') && t.naturalWidth < 8) t.remove();
  else if (t?.classList?.contains('cover-img')) t.classList.add('ok');
}, true);

/** A spine for the shelf view. Height & thickness follow the page count. */
export function spineHTML(b, { current = false } = {}) {
  const { ink } = jacketOf(b);
  const pages = Number(b.pages) || 300;
  const w = Math.round(Math.max(26, Math.min(58, 20 + pages / 18)));
  const h = 150 + (hash(b.id || b.title) % 5) * 9 + Math.min(20, pages / 60);
  const title = String(b.title || 'Bez tytułu');
  // fit the title along the spine: shrink the type, and on thick spines allow a second line
  const last = String(b.author || '').split(' ').at(-1) || '';
  const avail = h - 34 - (last ? last.length * 6.4 + 10 : 0);
  let fs = Math.max(9, Math.min(13.5, avail / (title.length * 0.6)));
  const two = title.length * 0.6 * fs > avail && w >= 36;
  if (two) fs = Math.max(9, Math.min(12, (avail * 2) / (title.length * 0.6)));
  return `<button class="spine${two ? ' two' : ''}${current ? ' current' : ''}${b.status === 'przeczytane' ? ' done' : ''}" data-book="${esc(b.id)}" style="--bg:${ink[0]};--fg:${ink[1]};--ac:${ink[2]};--w:${w}px;--h:${Math.round(h)}px;--fs:${fs.toFixed(1)}px" aria-label="${esc(title)}${b.author ? `, ${esc(b.author)}` : ''}">
    <span class="sp-band"></span>
    <span class="sp-title">${esc(title)}</span>
    ${b.author ? `<span class="sp-author">${esc(last)}</span>` : ''}
    ${current ? '<i class="sp-ribbon" aria-hidden="true"></i>' : ''}
  </button>`;
}

// ---------- ex libris ----------
/** Round rubber-stamp ex libris for a finished book. */
export function exlibris(year, size = 74) {
  const id = `ex${Math.random().toString(36).slice(2, 7)}`;
  return `<svg class="exlibris" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Przeczytane${year ? ` w ${year}` : ''}">
    <defs><path id="${id}" d="M50 50m-36 0a36 36 0 1 1 72 0a36 36 0 1 1-72 0"/></defs>
    <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" stroke-width="2.4"/>
    <circle cx="50" cy="50" r="27" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <text font-family="Bricolage Grotesque, sans-serif" font-size="10.5" font-weight="700" letter-spacing="2.2" fill="currentColor"><textPath href="#${id}">EX LIBRIS · PRZECZYTANE ·</textPath></text>
    <path d="M37 47c4.5-1.6 9-1.3 13 1.2 4-2.5 8.5-2.8 13-1.2v12c-4.5-1.6-9-1.3-13 1.2-4-2.5-8.5-2.8-13-1.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    ${year ? `<text x="50" y="72" text-anchor="middle" font-family="Literata, serif" font-size="8.5" font-weight="600" fill="currentColor">${year}</text>` : ''}
  </svg>`;
}

// ---------- empty state ----------
const OPEN_BOOK = `<svg class="fig" viewBox="0 0 112 72" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M8 14c16-6 32-5 48 4 16-9 32-10 48-4v48c-16-6-32-5-48 4-16-9-32-10-48-4z"/><path d="M56 18v48"/>
  <path d="M18 26c9-2 18-1.5 28 2M18 34c9-2 18-1.5 28 2M18 42c9-2 18-1.5 28 2M66 28c10-3.5 19-4 28-2M66 36c10-3.5 19-4 28-2" opacity=".5"/>
  <path d="M80 8v22l4-4 4 4V8" stroke="var(--ribbon)" stroke-width="1.8"/></svg>`;
/** empty({ title, text, action: 'Dodaj książkę', actionAttr: 'data-act="add"' }) */
export function empty({ title, text = '', action = '', actionAttr = '' }) {
  return `<div class="empty">${OPEN_BOOK}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action ? `<button class="btn primary" ${actionAttr}>${icon('plus', 19)}${esc(action)}</button>` : ''}</div>`;
}

/** Progress thread (0..1). */
export const thread = (p) => `<div class="thread" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><i style="--k:${p.toFixed(3)}"></i></div>`;

/** Close every sheet, wait for the Back-history to settle, then run fn (used before navigating). */
export function closeAllThen(fn) {
  if (!stack.length) return fn();
  closeAll();
  const t0 = Date.now();
  const wait = () => (ignorePops === 0 || Date.now() - t0 > 600 ? fn() : setTimeout(wait, 16));
  setTimeout(wait, 16);
}
