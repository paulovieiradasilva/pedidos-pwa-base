// Service Worker: faz o app funcionar como PWA (funcionar offline e poder ser
// "instalado" no celular). Guarda uma cópia dos arquivos do app em cache.
//
// REGRA IMPORTANTE: toda vez que qualquer arquivo do app mudar, é preciso
// aumentar o número aqui (CACHE_NAME) E o "?v=N" do <script> que registra este
// arquivo em index.html, ambos para o MESMO número. Se só um dos dois for
// aumentado, o celular do usuário pode continuar mostrando a versão antiga
// (já aconteceu antes neste projeto).
const CACHE_NAME = 'pedidos-cache-v41';

// Lista de arquivos que ficam salvos em cache para o app funcionar offline.
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

// Ao instalar uma nova versão: baixa e guarda em cache todos os arquivos da
// lista acima, e assume o controle imediatamente (sem esperar recarregar).
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Ao ativar a nova versão: apaga caches de versões antigas (evita acumular
// lixo e garante que arquivos antigos não sejam usados por engano).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  event.waitUntil(clients.claim());
});

// Toda requisição de arquivo: responde com a versão em cache se existir,
// senão busca na rede (é isso que permite o app abrir sem internet).
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
