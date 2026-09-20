// Service Worker: faz o app funcionar como PWA (funcionar offline e poder ser
// "instalado" no celular). Guarda uma cópia dos arquivos do app em cache.
//
// Estratégia: network-first (tenta a rede primeiro, cai pro cache só se
// estiver offline) — por causa disso, uma mudança de código chega pro
// usuário assim que ele reabre o app com internet, sem precisar aumentar
// CACHE_NAME nem o "?v=N" do <script> em index.html a cada deploy. Só
// aumente esse número se precisar forçar a limpeza de tudo que já está em
// cache (ex.: renomeou/removeu arquivos da lista ASSETS abaixo).
const CACHE_NAME = 'pedidos-cache-v43';

// Lista de arquivos pré-carregados em cache na primeira visita, pra já
// funcionar offline mesmo antes de qualquer requisição bem-sucedida.
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
  './js/auditLog.js',
  './js/backup.js',
  './js/drive.js',
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

// Toda requisição de arquivo: tenta a rede primeiro (pra sempre pegar a
// versão mais nova quando tem internet) e guarda uma cópia da resposta em
// cache; só usa a cópia em cache se a rede falhar (app offline).
// "cache: 'no-cache'" faz revalidar com o servidor em vez de usar o cache HTTP
// do navegador (o GitHub Pages manda max-age=600): sem isso, logo após um
// deploy o celular podia misturar index.html novo com app.js velho.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
