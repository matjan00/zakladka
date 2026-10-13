// Light / dark ("czytanie nocą") / auto. Mirrored to localStorage so index.html can apply it before first paint.
import * as store from './store.js';

const mq = matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const t = store.setting('theme') || 'auto';
  try {
    localStorage.setItem('zakladka.theme', t);
  } catch {}
  const dark = t === 'dark' || (t === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14120E' : '#F3EEE4');
}
mq.addEventListener?.('change', applyTheme);
