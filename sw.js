// sw.js — Service Worker for discrete-math-quiz
// Strategy: NetworkFirst for HTML/JS/CSS so updates land immediately on refresh
const CACHE_NAME = 'dmq-v1';

// Files to cache on install (core shell)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/questions.js',
  '/animations.js',
];

// ── Install: pre-cache core assets ──────────────────────────────────
self.addEventListener('install', (event) => {
  // Skip waiting so the new SW activates immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// ── Activate: clean up old caches ───────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Network-first for HTML/JS/CSS, cache-first for libs ──────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Libs: cache-first (they never change)
  if (url.pathname.startsWith('/libs/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // API calls: always network, never cache
  if (url.pathname.startsWith('/api/')) return;

  // HTML, JS, CSS: network-first → falls back to cache
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_) {
    const cached = await cache.match(request);
    return cached || new Response('离线中，暂时无法加载。', { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const networkResponse = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, networkResponse.clone());
  return networkResponse;
}

// ── Update notification: tell clients when new SW is waiting ────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
