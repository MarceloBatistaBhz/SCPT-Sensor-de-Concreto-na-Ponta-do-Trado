// Service worker minimo: cache-first pros assets do app, network passa direto
// pra qualquer outra coisa (como o http://192.168.4.1/log.csv).
const CACHE = 'loggerp-pwa-v31';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];
// Manual em PDF (~4 MB): fora do CACHE versionado pra nao ser baixado de novo
// a cada versao do app. Rede primeiro (pega o manual novo), cache sem sinal.
const MANUAL_CACHE = 'scpt-manual';

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
      Promise.all(keys.filter((k) => k !== CACHE && k !== MANUAL_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function manualNetworkFirst(req) {
  const key = req.url.split('?')[0];
  try {
    const res = await fetch(req);
    // So resposta inteira: 206 (pedido parcial do leitor de PDF) nao vai pro cache
    if (res.status === 200) {
      const copy = res.clone();
      caches.open(MANUAL_CACHE).then((c) => c.put(key, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await caches.match(key, { cacheName: MANUAL_CACHE });
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // So intercepta requests do mesmo origin (PWA). Tudo que e externo
  // (ex.: 192.168.4.1) passa direto sem cache.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/MANUAL.pdf')) {
    e.respondWith(manualNetworkFirst(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
