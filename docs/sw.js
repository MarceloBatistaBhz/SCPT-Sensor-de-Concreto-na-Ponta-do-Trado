// Service worker minimo: cache-first pros assets do app, network passa direto
// pra qualquer outra coisa (como o http://192.168.4.1/log.csv).
const CACHE = 'loggerp-pwa-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // So intercepta requests do mesmo origin (PWA). Tudo que e externo
  // (ex.: 192.168.4.1) passa direto sem cache.
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
