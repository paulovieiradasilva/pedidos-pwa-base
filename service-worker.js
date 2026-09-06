const CACHE_NAME = 'pedidos-cache-v7';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './config.js',
  './icon-192-sacola.png',
  './icon-512-sacola.png',
  './vendor/tailwind.js',
  './vendor/alpine.min.js',
  './js/db.js',
  './js/customers.js',
  './js/products.js',
  './js/orders.js',
  './js/printer.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
