// Minimal offline shell service worker.
// Caches the app shell on install; serves cached shell on offline navigations.
// Only active when served over HTTPS (Tailscale path) — not on plain LAN HTTP.

const CACHE = 'sichuan-mahjong-v1';
const SHELL = ['/', '/src/main.tsx'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only intercept same-origin navigation requests for the shell
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate' && url.origin === location.origin) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/').then(r => r ?? new Response('Offline', { status: 503 }))
      )
    );
  }
});
