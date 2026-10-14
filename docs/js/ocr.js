// OCR of a photographed page. tesseract.js is loaded from jsdelivr ONLY when the user starts a scan.
//   openOcr({ onUse(text) })  → sheet: take/choose photo → progress in Polish → pick lines / edit text → onUse(text)
import * as ui from './ui.js';
import { icon } from './icons.js';
import { esc } from './util.js';

const TESS_VERSION = '5.1.1';
const CORE_VERSION = '5.1.1';
const POL_DATA = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/pol@1.0.0/4.0.0_best_int';
const BASE = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESS_VERSION}/dist`;

let libPromise = null;
function loadLib() {
  libPromise ||= import(/* @vite-ignore */ `${BASE}/tesseract.esm.min.js`).then((m) => m.default || m).catch((e) => ((libPromise = null), Promise.reject(e)));
  return libPromise;
}

/** Make the photo friendlier for OCR: bounded size, grey, a little contrast. Returns a canvas. */
export async function prepareImage(file, max = 2000) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < px.length; i += 4) {
    const y = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) | 0;
    px[i] = px[i + 1] = px[i + 2] = y;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const span = Math.max(40, hi - lo);
  for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / span));
  g.putImageData(d, 0, 0);
  return c;
}

const STATUS_PL = {
  'loading tesseract core': 'Pobieram silnik rozpoznawania…',
  'initializing tesseract': 'Uruchamiam silnik…',
  'loading language traineddata': 'Pobieram słownik języka polskiego…',
  'initializing api': 'Przygotowuję rozpoznawanie…',
  'recognizing text': 'Czytam tekst ze zdjęcia…',
};

/**
 * Recognise Polish text on an image/canvas/blob.
 * onProgress({ label, p }) with p in 0…1. Resolves { text, lines:[string] }.
 */
export async function recognize(image, onProgress = () => {}) {
  onProgress({ label: 'Pobieram moduł rozpoznawania (tylko za pierwszym razem)…', p: 0 });
  const T = await loadLib();
  const worker = await T.createWorker('pol', 1, {
    workerPath: `${BASE}/worker.min.js`,
    corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE_VERSION}`,
    langPath: POL_DATA,
    gzip: true,
    logger: (m) => onProgress({ label: STATUS_PL[m.status] || 'Pracuję…', p: m.progress ?? 0, status: m.status }),
  });
  try {
    const { data } = await worker.recognize(image);
    return { text: data.text || '', lines: tidyLines(data.text || '') };
  } finally {
    worker.terminate().catch(() => {});
  }
}

/** Raw OCR text → clean lines: no empty lines, hyphenated line-ends are left for joinLines. */
export function tidyLines(text) {
  return String(text)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 1);
}
/** Join selected lines into running text, mending "prze-\nczytać". */
export function joinLines(lines) {
  let out = '';
  for (const l of lines) {
    if (!out) out = l;
    else if (/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]-$/.test(out) && /^[a-ząćęłńóśźż]/.test(l)) out = out.slice(0, -1) + l;
    else out += ' ' + l;
  }
  return out.replace(/\s+([,.;:!?])/g, '$1').trim();
}

/** The sheet. onUse(text) is called with the chosen text (sheet closes first). */
export function openOcr({ onUse }) {
  let closed = false;
  const rec = ui.openSheet(
    `<div class="sheet-head"><h2>Zdjęcie strony</h2><button class="icon-btn" data-close aria-label="Zamknij">${icon('close')}</button></div>
     <div class="ocr" data-stage="pick">
       <p class="t-read muted">Sfotografuj stronę z książki. Rozpoznam tekst, a Ty zaznaczysz fragment, który chcesz zachować.</p>
       <div class="btn-row" style="margin-top:16px">
         <label class="btn primary">${icon('camera')}Zrób zdjęcie<input type="file" accept="image/*" capture="environment" hidden data-ocr-file></label>
         <label class="btn">${icon('upload')}Wybierz plik<input type="file" accept="image/*" hidden data-ocr-file></label>
       </div>
       <p class="faint t-sm" style="margin-top:12px">Za pierwszym razem pobiorę moduł rozpoznawania (kilka MB, potrzebny internet). Zdjęcie nie opuszcza telefonu.</p>
     </div>`,
    { label: 'Zdjęcie strony', cls: 'tall', onClose: () => (closed = true) }
  );
  const box = rec.body.querySelector('.ocr');

  const progress = (label, p) => {
    box.innerHTML = `<div class="ocr-progress" role="status"><p class="t-read" data-label>${esc(label)}</p>${ui.thread(p || 0)}<p class="faint t-sm num" data-pct></p></div>`;
  };
  const setProgress = ({ label, p, status }) => {
    if (closed) return;
    const lab = box.querySelector('[data-label]');
    if (!lab) return progress(label, p);
    lab.textContent = label;
    box.querySelector('.thread').style.setProperty('--k', String(p || 0));
    box.querySelector('[data-pct]').textContent = status === 'recognizing text' ? `${Math.round((p || 0) * 100)}%` : '';
  };

  function review(lines) {
    const sel = new Set();
    const draw = () => {
      box.innerHTML = `
        <p class="t-label" style="margin-bottom:8px">Rozpoznany tekst</p>
        ${lines.length ? `<p class="faint t-sm" style="margin-bottom:10px">Dotknij linijek, które chcesz zachować, a potem popraw tekst poniżej.</p>
        <div class="ocr-lines" role="group" aria-label="Linijki tekstu">${lines.map((l, i) => `<button type="button" class="ocr-line ${sel.has(i) ? 'on' : ''}" data-i="${i}" aria-pressed="${sel.has(i)}">${esc(l)}</button>`).join('')}</div>
        <div class="btn-row" style="margin:10px 0 16px"><button type="button" class="btn ghost" data-all>Zaznacz wszystko</button><button type="button" class="btn ghost" data-none>Wyczyść</button></div>`
          : `<p class="t-read muted" style="margin-bottom:14px">Nie udało się rozpoznać tekstu. Spróbuj z lepszym światłem i prosto z góry — albo wpisz cytat ręcznie.</p>`}
        <div class="field"><span class="t-label">Tekst cytatu</span><textarea data-text rows="5" placeholder="Zaznaczone linijki pojawią się tutaj"></textarea></div>
        <div class="btn-row"><button type="button" class="btn" data-again>${icon('camera')}Inne zdjęcie</button><button type="button" class="btn primary" data-use>Użyj tekstu</button></div>`;
      const ta = box.querySelector('[data-text]');
      const sync = () => (ta.value = joinLines([...sel].sort((a, b) => a - b).map((i) => lines[i])));
      box.onclick = (e) => {
        const ln = e.target.closest('[data-i]');
        if (ln) {
          const i = +ln.dataset.i;
          sel.has(i) ? sel.delete(i) : sel.add(i);
          ln.classList.toggle('on', sel.has(i));
          ln.setAttribute('aria-pressed', sel.has(i));
          return sync();
        }
        if (e.target.closest('[data-all]')) {
          lines.forEach((_, i) => sel.add(i));
          box.querySelectorAll('.ocr-line').forEach((b) => (b.classList.add('on'), b.setAttribute('aria-pressed', 'true')));
          return sync();
        }
        if (e.target.closest('[data-none]')) {
          sel.clear();
          box.querySelectorAll('.ocr-line').forEach((b) => (b.classList.remove('on'), b.setAttribute('aria-pressed', 'false')));
          return sync();
        }
        if (e.target.closest('[data-again]')) return pick();
        if (e.target.closest('[data-use]')) {
          const text = ta.value.trim();
          if (!text) return ui.toast('Zaznacz linijki albo wpisz tekst');
          rec.close();
          onUse(text);
        }
      };
    };
    draw();
  }

  function pick() {
    box.onclick = null;
    box.innerHTML = `<p class="t-read muted">Wybierz zdjęcie strony.</p>
      <div class="btn-row" style="margin-top:16px"><label class="btn primary">${icon('camera')}Zrób zdjęcie<input type="file" accept="image/*" capture="environment" hidden data-ocr-file></label>
      <label class="btn">${icon('upload')}Wybierz plik<input type="file" accept="image/*" hidden data-ocr-file></label></div>`;
  }

  rec.body.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-ocr-file]')) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    box.onclick = null;
    progress('Przygotowuję zdjęcie…', 0);
    try {
      const img = await prepareImage(file);
      const { lines } = await recognize(img, setProgress);
      if (closed) return;
      review(lines);
    } catch (err) {
      console.error(err);
      if (closed) return;
      box.innerHTML = `<p class="t-read">Nie udało się rozpoznać tekstu.</p><p class="faint t-sm" style="margin:6px 0 16px">${navigator.onLine ? 'Spróbuj jeszcze raz albo wpisz cytat ręcznie.' : 'Wygląda na to, że nie ma internetu — moduł rozpoznawania trzeba pobrać przynajmniej raz.'}</p>
        <div class="btn-row"><button class="btn" data-close>Zamknij</button><button class="btn primary" data-retry>Spróbuj ponownie</button></div>`;
      box.querySelector('[data-retry]').onclick = pick;
    }
  });
  return rec;
}
