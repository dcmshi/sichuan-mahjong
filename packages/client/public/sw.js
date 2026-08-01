// Minimal offline shell service worker.
// Precaches the navigation shell on install and runtime-caches the build output
// as it is requested; serves the cached shell on offline navigations.
// Only active when served over HTTPS (Tailscale path) — not on plain LAN HTTP.

const CACHE = 'sichuan-mahjong-v2';

// Only the shell. cache.addAll is atomic and the old list also named
// '/src/main.tsx', which exists in dev but 404s in a production build — so the
// install rejected, the .catch swallowed it, and the cache stayed empty for
// every real deploy. Hashed assets are picked up by the fetch handler below
// instead of a build-time precache manifest. (F5)
const SHELL = '/';

// Content-hashed build output and static art: safe to serve cache-first.
function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/tiles/') ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/manifest.webmanifest'
  );
}

function putInCache(request, response) {
  const copy = response.clone();
  return caches.open(CACHE).then(cache => cache.put(request, copy));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.add(SHELL))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Navigations: network first (the shell changes on every deploy), cached
  // shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) void putInCache(SHELL, response);
          return response;
        })
        .catch(() => caches.match(SHELL).then(r => r ?? new Response('Offline', { status: 503 }))),
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    caches.match(request).then(
      hit =>
        hit ??
        fetch(request).then(response => {
          if (response.ok) void putInCache(request, response);
          return response;
        }),
    ),
  );
});
