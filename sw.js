/* sw.js — 오프라인 100% 동작 (앱 셸 캐시 우선) */
const VERSION = 'car-log-v1.0.4';
const CORE_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/core.js',
  './js/seed.js',
  './js/manuals.js',
  './js/db.js',
  './js/parser.js',
  './js/ai.js',
  './js/xlsx-export.js',
  './js/app.js',
  './vendor/xlsx.full.min.js',
  './manifest.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Gemini 등 외부 호출은 그대로

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(hit => hit || fetch(req).catch(() => caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
