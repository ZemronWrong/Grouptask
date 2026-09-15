const CACHE_NAME = 'grouptask-v6';
const PRECACHE = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/utils.js',
  '/js/db/indexedDB.js',
  '/js/ui/router.js',
  '/js/ui/dragDrop.js',
  '/js/ui/taskBoard.js',
  '/js/ui/leaderboard.js',
  '/js/ui/members.js',
  '/js/ui/settings.js',
  '/js/ui/profile.js',
  '/js/ui/audit.js',
  '/js/ui/notifications.js',
  '/js/ui/comments.js',
  '/js/notifications/notificationService.js',
  '/js/theme/themeManager.js',
  '/js/scoring/contributionScore.js',
  '/js/scoring/peerEvaluation.js',
  '/js/scoring/freeRiderDetection.js',
  '/js/gamification/gamification.js',
  '/js/sync/syncEngine.js',
  '/js/sync/conflictResolver.js',
  '/js/auth/firebaseAuth.js',
  '/js/firebase/firebaseConfig.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.hostname === 'www.gstatic.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(e.request).then((cached) =>
          cached || fetch(e.request).then((res) => { cache.put(e.request, res.clone()); return res; })
        )
      )
    );
    return;
  }

  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
