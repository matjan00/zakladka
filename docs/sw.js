// Offline cache. Bump VERSION (scripts/release.cjs does it) so phones replace their saved copy.
const VERSION = 'zakladka-v1';
// Fonts and book covers come from other hosts: they live in their own long-lived caches (not wiped on update).
const FONT_CACHE = 'zakladka-fonts';
const COVER_CACHE = 'zakladka-covers';
// FILES-START
const FILES = ["./","css/base.css","css/books.css","css/home.css","css/library.css","css/next.css","css/quotes.css","css/session.css","css/stats.css","favicon.ico","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","index.html","js/app.js","js/books.js","js/config.js","js/goodreads-parse.js","js/goodreads.js","js/home.js","js/icons.js","js/install.js","js/kindle-parse.js","js/kindle.js","js/library.js","js/next.js","js/ocr.js","js/placeholder.js","js/quotes.js","js/routes.js","js/session.js","js/settings.js","js/slots.js","js/sources.js","js/stats.js","js/store.js","js/theme.js","js/ui.js","js/util.js","js/version.js","manifest.webmanifest"];
// FILES-END

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => Promise.all(FILES.map((f) => fetch(new Request(f, { cache: 'reload' })).then((r) => r.ok && c.put(f, r)).catch(() => {}))))
  );
  // no skipWaiting here: the page shows "Aktualizacja dostępna" and asks the new worker to take over
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  const keep = new Set([VERSION, FONT_CACHE, COVER_CACHE]);
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// cache-first for things that never change at the same URL
function cacheFirst(cacheName, req) {
  return caches.open(cacheName).then((c) =>
    c.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          if (r.ok) c.put(req, r.clone());
          return r;
        })
    )
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(FONT_CACHE, req));
    return;
  }
  if (url.hostname === 'covers.openlibrary.org') {
    e.respondWith(cacheFirst(COVER_CACHE, req).catch(() => Response.error()));
    return;
  }
  if (url.origin !== location.origin) return;
  if (location.hostname === 'localhost') {
    // local preview: always fresh files, cache only as the offline fallback
    e.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
