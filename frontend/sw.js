// CivicSphere Service Worker for PWA / WebAPK
const CACHE_NAME = 'civicsphere-cache-v1';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './assets/logo_icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './js/app.js',
  './js/data.js',
  './js/map.js',
  './js/agents.js',
  './js/voice.js',
  './js/config.js',
  './js/api.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
