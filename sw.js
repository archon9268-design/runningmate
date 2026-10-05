// 온라인이면 항상 최신 파일을 쓰고, 오프라인일 때만 캐시를 쓴다. 파일을 추가하면 ASSETS에 넣고 VERSION을 올린다.
const VERSION = 'rm-v6';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/util.js',
  './js/db.js',
  './js/audio.js',
  './js/wakelock.js',
  './js/interval.js',
  './js/tracker.js',
  './js/stats.js',
  './js/ui.js',
  './js/views/home.js',
  './js/views/start-goal.js',
  './js/views/plan.js',
  './js/views/intervals.js',
  './js/views/interval-edit.js',
  './js/views/live.js',
  './js/views/history.js',
  './js/views/run-detail.js',
  './js/views/manual.js',
  './js/views/settings.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './fonts/PretendardVariable.woff2',
  './fonts/barlow-condensed-500.woff2',
  './fonts/barlow-condensed-600.woff2',
  './fonts/barlow-condensed-700.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req, { ignoreSearch: true })) || Response.error();
      }
    }),
  );
});
