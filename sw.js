const CACHE_NAME = 'agenda-bebe-v19';
const appFiles = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/vendor/firebase-10.7.1/firebase-app-compat.js',
  '/vendor/firebase-10.7.1/firebase-auth-compat.js',
  '/vendor/firebase-10.7.1/firebase-firestore-compat.js',
  '/vendor/chart.js-4.6.2/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const requests = appFiles.map(path => new Request(path, { cache: 'reload' }));
    await cache.addAll(requests);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const outdated = names.filter(name => name.startsWith('agenda-bebe-') && name !== CACHE_NAME);
    await Promise.all(outdated.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !appFiles.includes(url.pathname)) {
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const stored = await cache.match(url.pathname);
    return stored || fetch(request);
  })());
});
