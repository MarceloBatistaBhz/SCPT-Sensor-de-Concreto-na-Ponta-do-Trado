// Service worker minimo: cache-first pros assets do app, network passa direto
// pra qualquer outra coisa (como o http://192.168.4.1/log.csv).
const CACHE = 'loggerp-pwa-v16';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' bypassa o HTTP cache do navegador. Sem isto, em
    // updates rapidos o GitHub Pages serve via Cache-Control: max-age=600
    // e o SW novo acaba armazenando o HTML antigo no cache novo.
    const requests = ASSETS.map((url) => new Request(url, { cache: 'reload' }));
    await cache.addAll(requests);
    await self.skipWaiting();
  })());
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
