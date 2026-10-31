/**
 * GroupTask service worker (F3, was C1).
 *
 * - Built files under /assets/ have a content hash in their name: cache-first.
 * - The page itself (index.html, navigations): network-first with the cached
 *   copy as fallback, so updates arrive but the app still starts offline.
 * - Firebase / Google API requests are never touched (Firestore and Auth have
 *   their own offline handling; the app's own sync queue covers writes).
 * - The page registers /sw.js?v=<build>, so every build gets its own cache and
 *   old caches are deleted when the new version takes over.
 * - A new version waits until the page asks it to take over (the
 *   "A new version is available · Refresh" toast), never mid-work.
 */

const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `grouptask-${BUILD}`;
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

// Never handled: Firebase Auth/Firestore and other Google APIs
const NETWORK_ONLY_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'www.googleapis.com',
  'apis.google.com',
  'www.gstatic.com',
  'accounts.google.com',
];
const NETWORK_ONLY_SUFFIXES = ['.firebaseapp.com', '.firebaseio.com', '.web.app', '.cloudfunctions.net'];
// Google Fonts are static files, not API calls: keep them for offline starts
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/**
 * How a request is answered:
 *   'cache-first'   — hashed build files, icons, fonts;
 *   'network-first' — the page and other same-origin files;
 *   null            — not handled here (non-GET, Firebase/Google APIs, other sites).
 */
function strategyFor(url, method = 'GET', origin = self.location.origin) {
  if (method !== 'GET') return null;
  const u = new URL(url);
  if (u.origin !== origin) {
    if (NETWORK_ONLY_HOSTS.includes(u.hostname)) return null;
    if (NETWORK_ONLY_SUFFIXES.some((s) => u.hostname.endsWith(s))) return null;
    if (FONT_HOSTS.includes(u.hostname)) return 'cache-first';
    return null;
  }
  if (u.pathname.startsWith('/__/')) return null;   // Firebase Auth helper pages
  if (u.pathname.startsWith('/assets/') || u.pathname.startsWith('/icons/')) return 'cache-first';
  return 'network-first';
}

/**
 * Only keep real files. The host answers a missing /assets/ file with
 * index.html (status 200), which must never be stored as a script.
 */
function isCacheable(url, response) {
  if (!response || !(response.ok || response.type === 'opaque')) return false;
  const type = response.headers?.get?.('content-type') || '';
  if (new URL(url).pathname.startsWith('/assets/') && type.includes('text/html')) return false;
  return true;
}

/** File names of every chunk the built app can load, found in the page and its entry script. */
function buildAssetsFrom(text) {
  return [...new Set([...text.matchAll(/\/?assets\/[\w.-]+\.(?:js|css)/g)].map((m) => `/${m[0].replace(/^\//, '')}`))];
}

async function precacheBuild(cache) {
  // Cache every screen's code now, so a screen never opened online still opens offline
  const page = await fetch('/index.html', { cache: 'no-cache' });
  if (!page.ok) return;
  await cache.put('/index.html', page.clone());
  const first = buildAssetsFrom(await page.text());
  const entries = await Promise.all(first.filter((p) => p.endsWith('.js')).map((p) => fetch(p).then((r) => r.text()).catch(() => '')));
  const all = new Set([...first, ...entries.flatMap(buildAssetsFrom)]);
  await Promise.all([...all].map(async (path) => {
    try {
      const res = await fetch(path);
      if (isCacheable(new URL(path, self.location.origin).href, res)) await cache.put(path, res);
    } catch { /* fetched again on first use */ }
  }));
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await cache.addAll(APP_SHELL);
    await precacheBuild(cache).catch(() => {});
  }));
  // No skipWaiting() here: a waiting update takes over only when the page asks (see 'message')
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('grouptask-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (isCacheable(request.url, res)) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (isCacheable(request.url, res)) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // Offline navigation to any route: the app is a single page
    if (request.mode === 'navigate') {
      const shell = await cache.match('/index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const strategy = strategyFor(e.request.url, e.request.method);
  if (strategy === 'cache-first') e.respondWith(cacheFirst(e.request));
  else if (strategy === 'network-first') e.respondWith(networkFirst(e.request));
});
