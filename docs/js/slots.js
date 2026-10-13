// Slots on the Start screen that other features fill in later.
// A slot loader resolves to a function (el, ctx) that renders into the slot element (replacing the placeholder).
// TO FILL A SLOT: point its loader at your module's export, e.g.
//   'cytat-dnia': () => import('./quotes.js').then((m) => m.renderQuoteOfDay),
export const SLOTS = {
  'cytat-dnia': () => import('./quotes.js').then((m) => m.renderQuoteOfDay), // quotes builder: quote of the day
  'co-dalej': () => import('./next.js').then((m) => m.renderSlot), // what-next builder: one suggestion from "Chcę przeczytać"
};

/** Render a slot. Resolves true when a feature filled it, false when the placeholder stays. */
export async function fillSlot(name, el, ctx) {
  const loader = SLOTS[name];
  if (!loader) return false;
  try {
    const fn = await loader();
    if (typeof fn !== 'function') return false;
    await fn(el, ctx);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}
