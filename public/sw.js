/* STARLINK HYPERCORE AI service worker.
   - Precaches the app shell.
   - Navigation: network-first with offline fallback to the cached shell.
   - Same-origin static assets: cache-first, filled as they are used.
   - Never touches /api: chat and status always go to the network. */
const CACHE = 'starlink-hypercore-ai-shell-v3';
const SCOPE = self.registration.scope;
const SHELL = [
  SCOPE,
  SCOPE + 'index.html',

  SCOPE + 'icons/icon.svg',
  SCOPE + 'icons/icon-maskable.svg',
  SCOPE + 'icons/icon-192.png',
  SCOPE + 'icons/icon-512.png',
  SCOPE + 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return url.pathname.indexOf('/api/') !== -1 || url.pathname.endsWith('/api');
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(SCOPE, response.clone()).catch(() => undefined);
    }
    return response;
  } catch (err) {
    const cached =
      (await cache.match(request)) ||
      (await cache.match(SCOPE)) ||
      (await cache.match(SCOPE + 'index.html'));
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>STARLINK HYPERCORE AI – Offline</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#050A14;color:#E8F1FF;font-family:system-ui,sans-serif;text-align:center"><p>You are offline.<br>Reconnect to open STARLINK HYPERCORE AI.</p></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApi(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
