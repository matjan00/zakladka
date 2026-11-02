// Which books does the Nekla library catalogue (SOWA OPAC) hold? Uses the same parser as the app's books-proxy.
// Writes raw/nekla_<k>.json: book id -> {state: "dostepna"|"wypozyczona"|"jest"|"brak", url, status, title}.
// Usage: node booktube/nekla_scan.mjs k n   (be gentle: ~1.2 s between requests per worker)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { parseSowa } = await import(pathToFileURL(path.join(here, '..', 'supabase', 'functions', 'books-proxy', 'sowa.js')).href);
const [k, n] = [Number(process.argv[2]), Number(process.argv[3])];
const UA = 'zakladka-booktube/0.1 (personal reading app; contact: matjan00 on GitHub)';
const norm = (s) => String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(the|a|an) /, '');
const sn = (a) => { const w = norm(a).split(' ').filter((x) => x && x !== 'jr'); return w[w.length - 1] || ''; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const books = JSON.parse(fs.readFileSync(path.join(here, '..', 'docs', 'data', 'books.json'), 'utf8')).books
  .filter((b) => b.pl && (b.pl.t || b.pl.lc || b.pl.legimi)).sort((a, b) => a.id.localeCompare(b.id)).filter((_, i) => i % n === k);
const file = path.join(here, 'raw', `nekla_${k}.json`);
const out = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
let last = 0;
async function search(phrase) {
  const wait = last + 1200 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
  const url = 'https://www.nekla-bpmig.sowa.pl/index.php?KatID=0&typ=repl&plnk=q__' + phrase.trim().split(/\s+/).map(encodeURIComponent).join('+') + '&sort=byscore&view=1';
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA } }); if (r.ok) return parseSowa(await r.text()); } catch {}
    await sleep(3000 * (i + 1));
  }
  return null;
}
const same = (b, titles, h) => {
  const a1 = sn(b.a), a2 = sn(h.author);
  const authorOk = !a2 || (a1.slice(0, 4) === a2.slice(0, 4));
  const ht = norm(h.title);
  const titleOk = titles.some((t) => { const m = norm(String(t).split(/\s*[:–—]\s+/)[0]); return m.length > 2 && (ht === m || ht.startsWith(m + ' ') || (m.length > 8 && ht.includes(m))); });
  return authorOk && !!a2 && titleOk;
};
const todo = books.filter((b) => !(b.id in out));
console.log(todo.length, 'to scan');
let c = 0;
for (const b of todo) {
  const titles = [...new Set([b.pl.t, b.t].filter(Boolean))];
  let res = null, failed = false;
  for (const q of [`${titles[0]} ${sn(b.a)}`, ...(titles[1] ? [`${titles[1]} ${sn(b.a)}`] : [])]) {
    const hits = await search(q);
    if (hits === null) { failed = true; break; }
    const m = hits.filter((h) => same(b, titles, h));
    if (m.length) { const best = m.find((h) => h.available === true) || m[0]; res = { state: best.available === true ? 'dostepna' : best.available === false ? 'wypozyczona' : 'jest', url: best.recordUrl, status: best.statusText, title: best.title }; break; }
  }
  if (failed) continue;
  out[b.id] = res || { state: 'brak' };
  if (++c % 10 === 0) { fs.writeFileSync(file, JSON.stringify(out)); console.log(c, '/', todo.length); }
}
fs.writeFileSync(file, JSON.stringify(out));
console.log('done');
