/* ============================================================
   Service Worker для PWA «5 mots par jour».
   Кэширует оболочку приложения для работы офлайн и быстрого
   запуска. Данные и вход остаются в Firebase (нужна сеть).
   ============================================================ */
const CACHE = '5mots-par-jour-v2';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './auth.js',
  './words.js',
  './firebase-config.js',
  './logo.png',
  './favicon.ico',
  './icon-192.png?v=2',
  './icon-512.png?v=2',
  './icon-maskable-512.png?v=2',
  './apple-touch-icon.png?v=2',
  './manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    }).catch(function () {
      if (req.mode === 'navigate') return caches.match('./index.html');
    })
  );
});
