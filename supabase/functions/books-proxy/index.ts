// books-proxy — tiny read-only proxy for Zakładka (Supabase Edge Function, Deno).
// Deploy (later, by the owner): supabase functions deploy books-proxy --project-ref txhcnqwrdazgaxjwabln --no-verify-jwt
//
//   GET ?bn=<query string>     → https://data.bn.org.pl/api/institutions/bibs.json?<allowed params>   (JSON passthrough)
//   GET ?sowa=<search phrase>  → Nekla SOWA catalogue search, parsed to
//                                [{ title, author, available: boolean|null, statusText, recordUrl }]
//
// Only these two upstream hosts are ever contacted. Inputs are length-limited, upstream calls time out quickly,
// and responses carry cache headers (BN 1 day, SOWA 1 hour).
import { parseSowa } from './sowa.js';

const ALLOWED_ORIGINS = new Set(['https://matjan00.github.io', 'http://localhost:5210']);
const ALLOWED_HOSTS = new Set(['data.bn.org.pl', 'www.nekla-bpmig.sowa.pl']);
const BN_PARAMS = new Set(['title', 'author', 'isbnIssn', 'limit', 'kind', 'publicationYear', 'sinceId']);
const MAX_INPUT = 300;
const TIMEOUT_MS = 8000;
const MAX_BYTES = 3_000_000; // refuse absurdly large upstream pages
const UA = 'Mozilla/5.0 (compatible; Zakladka/1.0; +https://matjan00.github.io/zakladka/)';

function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body: unknown, status: number, origin: string | null, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}, s-maxage=${maxAge}` : 'no-store',
    },
  });
}

async function fetchUpstream(first: URL): Promise<Response> {
  // Redirects are followed by hand so that every hop stays on the allow-list (no open-redirect / SSRF).
  let url = first;
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) throw new Error('host not allowed');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal, redirect: 'manual' });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        url = new URL(loc, url);
        continue;
      }
      return r;
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error('too many redirects');
}

async function handleBn(raw: string, origin: string | null): Promise<Response> {
  const given = new URLSearchParams(raw);
  const q = new URLSearchParams();
  for (const [k, v] of given) {
    if (!BN_PARAMS.has(k)) continue;
    const val = v.trim().slice(0, 200);
    if (!val) continue;
    if ((k === 'limit' || k === 'sinceId' || k === 'publicationYear') && !/^\d{1,12}$/.test(val)) continue;
    if (k === 'isbnIssn' && !/^[0-9Xx-]{8,17}$/.test(val)) continue;
    q.set(k, k === 'limit' ? String(Math.min(50, Number(val) || 20)) : val);
  }
  if (!q.has('title') && !q.has('author') && !q.has('isbnIssn')) return json({ error: 'need title, author or isbnIssn' }, 400, origin);
  if (!q.has('limit')) q.set('limit', '20');
  const url = new URL(`https://data.bn.org.pl/api/institutions/bibs.json?${q}`);
  const r = await fetchUpstream(url);
  if (!r.ok) return json({ error: `bn ${r.status}` }, 502, origin);
  const data = await r.json();
  return json(data, 200, origin, 86400);
}

async function handleSowa(phrase: string, origin: string | null): Promise<Response> {
  const words = phrase
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12);
  if (!words.length) return json({ error: 'empty phrase' }, 400, origin);
  const plnk = 'q__' + words.map((w) => encodeURIComponent(w)).join('+');
  const url = new URL(`https://www.nekla-bpmig.sowa.pl/index.php?KatID=0&typ=repl&plnk=${plnk}&sort=byscore&view=1`);
  const r = await fetchUpstream(url);
  if (!r.ok) return json({ error: `sowa ${r.status}` }, 502, origin);
  const html = await r.text();
  if (html.length > MAX_BYTES) return json({ error: 'sowa too large' }, 502, origin);
  const results = parseSowa(html).slice(0, 30);
  return json({ query: words.join(' '), searchUrl: url.toString(), results }, 200, origin, 3600);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: 'origin not allowed' }, 403, origin);

  const u = new URL(req.url);
  const bn = u.searchParams.get('bn');
  const sowa = u.searchParams.get('sowa');
  try {
    if (bn != null) {
      if (bn.length > MAX_INPUT) return json({ error: 'too long' }, 414, origin);
      return await handleBn(bn, origin);
    }
    if (sowa != null) {
      if (sowa.length > 150) return json({ error: 'too long' }, 414, origin);
      return await handleSowa(sowa, origin);
    }
    return json({ error: 'use ?bn= or ?sowa=' }, 400, origin);
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === 'AbortError';
    return json({ error: timeout ? 'upstream timeout' : 'upstream error' }, timeout ? 504 : 502, origin);
  }
});
