const CACHE = 'building-ledger-2026.11.14-01';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './ledger-mark.svg',
  './pwa-icon-192.png',
  './pwa-icon-512.png',
  './vendor/font.css',
  './vendor/fonts/ibm-plex-sans-arabic-400.ttf',
  './vendor/fonts/ibm-plex-sans-arabic-500.ttf',
  './vendor/fonts/ibm-plex-sans-arabic-700.ttf',
  './styles.css?v=2026.11.14-01',
  './backup-core.js?v=2026.11.14-01',
  './drive-backup.js?v=2026.11.14-01',
  './script-backup.js?v=2026.11.14-01',
  './ledger.js?v=2026.11.14-01',
  './vendor/xlsx.full.min.js',
  './vendor/html2canvas.min.js',
  './vendor/jspdf.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.webmanifest') || url.pathname.endsWith('.png') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.ttf'))) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
