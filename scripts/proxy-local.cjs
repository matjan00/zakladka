// Local stand-in for the Supabase edge function books-proxy (same GET API), for testing the app without deploying.
//   node scripts/proxy-local.cjs        ->  http://localhost:5211/?bn=...   /   ?sowa=...
// Point docs/js/config.js PROXY_URL at http://localhost:5211 while testing, then put it back to ''.
// Mirrors supabase/functions/books-proxy/index.ts (validation, host allow-list, timeouts) and reuses sowa.js.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ALLOWED_ORIGINS = new Set(['https://matjan00.github.io', 'http://localhost:5210']);
const ALLOWED_HOSTS = new Set(['data.bn.org.pl', 'www.nekla-bpmig.sowa.pl']);
const BN_PARAMS = new Set(['title', 'author', 'isbnIssn', 'limit', 'kind', 'publicationYear', 'sinceId']);
const MAX_INPUT = 300;
const TIMEOUT_MS = 8000;
const MAX_BYTES = 3_000_000;
const UA = 'Mozilla/5.0 (compatible; Zakladka/1.0; +https://matjan00.github.io/zakladka/)';
const port = Number(process.env.PORT) || 5211;

let parseSowa;
async function loadParser() {
  // sowa.js is an ES module without a package.json "type": load it through a data: URL.
  const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'books-proxy', 'sowa.js'), 'utf8');
  ({ parseSowa } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64')));
}

const cors = (origin) => {
  const h = { 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
  if (origin && ALLOWED_ORIGINS.has(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
};
function send(res, origin, status, body, maxAge = 0) {
  res.writeHead(status, { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store' });
  res.end(body == null ? '' : JSON.stringify(body));
}

async function fetchUpstream(url) {
  let u = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) throw new Error('host not allowed');
    const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'manual' });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      u = new URL(r.headers.get('location'), u);
      continue;
    }
    return r;
  }
  throw new Error('too many redirects');
}

async function handleBn(raw, origin, res) {
  const q = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(raw)) {
    if (!BN_PARAMS.has(k)) continue;
    const val = v.trim().slice(0, 200);
    if (!val) continue;
    if ((k === 'limit' || k === 'sinceId' || k === 'publicationYear') && !/^\d{1,12}$/.test(val)) continue;
    if (k === 'isbnIssn' && !/^[0-9Xx-]{8,17}$/.test(val)) continue;
    q.set(k, k === 'limit' ? String(Math.min(50, Number(val) || 20)) : val);
  }
  if (!q.has('title') && !q.has('author') && !q.has('isbnIssn')) return send(res, origin, 400, { error: 'need title, author or isbnIssn' });
  if (!q.has('limit')) q.set('limit', '20');
  const r = await fetchUpstream(`https://data.bn.org.pl/api/institutions/bibs.json?${q}`);
  if (!r.ok) return send(res, origin, 502, { error: `bn ${r.status}` });
  send(res, origin, 200, await r.json(), 86400);
}

async function handleSowa(phrase, origin, res) {
  const words = phrase.normalize('NFC').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 12);
  if (!words.length) return send(res, origin, 400, { error: 'empty phrase' });
  const url = `https://www.nekla-bpmig.sowa.pl/index.php?KatID=0&typ=repl&plnk=q__${words.map(encodeURIComponent).join('+')}&sort=byscore&view=1`;
  const r = await fetchUpstream(url);
  if (!r.ok) return send(res, origin, 502, { error: `sowa ${r.status}` });
  const html = await r.text();
  if (html.length > MAX_BYTES) return send(res, origin, 502, { error: 'sowa too large' });
  send(res, origin, 200, { query: words.join(' '), searchUrl: url, results: parseSowa(html).slice(0, 30) }, 3600);
}

loadParser().then(() => {
  http
    .createServer(async (req, res) => {
      const origin = req.headers.origin || null;
      if (req.method === 'OPTIONS') return (res.writeHead(204, cors(origin)), res.end());
      if (req.method !== 'GET') return send(res, origin, 405, { error: 'GET only' });
      if (origin && !ALLOWED_ORIGINS.has(origin)) return send(res, origin, 403, { error: 'origin not allowed' });
      const u = new URL(req.url, 'http://x');
      const bn = u.searchParams.get('bn');
      const sowa = u.searchParams.get('sowa');
      try {
        if (bn != null) return bn.length > MAX_INPUT ? send(res, origin, 414, { error: 'too long' }) : await handleBn(bn, origin, res);
        if (sowa != null) return sowa.length > 150 ? send(res, origin, 414, { error: 'too long' }) : await handleSowa(sowa, origin, res);
        send(res, origin, 400, { error: 'use ?bn= or ?sowa=' });
      } catch (e) {
        const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
        console.error(e.message);
        send(res, origin, timeout ? 504 : 502, { error: timeout ? 'upstream timeout' : 'upstream error' });
      }
    })
    .listen(port, () => console.log(`books-proxy (local) on http://localhost:${port}`));
});
