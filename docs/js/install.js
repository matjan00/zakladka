// "Zainstaluj aplikację". Chrome fires `beforeinstallprompt` only sometimes, so a button is always offered:
// with the event it opens the real dialog, without it it shows step-by-step instructions.
import { openSheet } from './ui.js';

let evt = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f());
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const onInstallChange = (f) => (subs.add(f), () => subs.delete(f));
export const canPrompt = () => !!evt;

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  evt = e;
  notify();
});
addEventListener('appinstalled', () => {
  evt = null;
  notify();
});

export async function install() {
  if (evt) {
    const e = evt;
    evt = null;
    try {
      e.prompt();
      await e.userChoice;
    } catch {}
    notify();
    return;
  }
  const steps = isIos()
    ? ['Otwórz tę stronę w <b>Safari</b>.', 'Stuknij przycisk <b>Udostępnij</b>.', 'Wybierz <b>Do ekranu początkowego</b>, potem <b>Dodaj</b>.']
    : ['Otwórz tę stronę w <b>Chrome</b> (nie w Messengerze ani Instagramie).', 'Stuknij menu <b>⋮</b> w prawym górnym rogu.', 'Wybierz <b>Zainstaluj aplikację</b> (albo <b>Dodaj do ekranu głównego</b>).', 'Potwierdź <b>Zainstaluj</b> — Zakładka pojawi się na ekranie telefonu.'];
  openSheet(
    `<div class="sheet-head"><h2>Zainstaluj Zakładkę</h2></div>
     <ol class="install-steps">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
     <p class="faint t-sm" style="margin-top:12px">Nie widzisz tej opcji? Odśwież stronę raz i spróbuj ponownie.</p>
     <button class="btn primary wide" style="margin-top:18px" data-close>Rozumiem</button>`,
    { label: 'Instalacja' }
  );
}
