import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import vm from 'vm';
import { buildId } from '../src/services/serviceWorker.js';

const SW_SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://grouptask.example';

/** Run public/sw.js in a sandbox and return its globals and registered listeners. */
function loadWorker({ query = '?v=index-AbC123', cacheNames = [] } = {}) {
  const listeners = {};
  const deleted = [];
  let skipped = false;
  const self = {
    location: { href: `${ORIGIN}/sw.js${query}`, origin: ORIGIN },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => { skipped = true; },
    clients: { claim: async () => {} },
  };
  const caches = {
    keys: async () => cacheNames,
    delete: async (k) => { deleted.push(k); return true; },
    open: async () => ({ addAll: async () => {}, put: async () => {}, match: async () => undefined }),
  };
  const ctx = vm.createContext({ self, caches, URL, Promise, Set, fetch: async () => { throw new Error('offline'); } });
  vm.runInContext(SW_SOURCE, ctx);
  // Top-level consts are script bindings, readable from a later script in the same context
  const read = (name) => vm.runInContext(name, ctx);
  return { ctx, read, listeners, deleted, wasSkipped: () => skipped };
}

const response = (status, type) => ({ ok: status >= 200 && status < 300, type: 'basic', headers: { get: () => type } });

describe('service worker caching rules (F3)', () => {
  const { ctx } = loadWorker();
  const s = (path, method) => ctx.strategyFor(path.startsWith('http') ? path : `${ORIGIN}${path}`, method);

  test('built, hashed files under /assets/ are cache-first', () => {
    expect(s('/assets/index-AbC123.js')).toBe('cache-first');
    expect(s('/assets/index-XyZ789.css')).toBe('cache-first');
    expect(s('/icons/icon-192.png')).toBe('cache-first');
  });

  test('the page itself is network-first, so updates arrive', () => {
    expect(s('/')).toBe('network-first');
    expect(s('/index.html')).toBe('network-first');
    expect(s('/manifest.json')).toBe('network-first');
  });

  test('Firebase and Google API requests are never handled', () => {
    for (const url of [
      'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?x=1',
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
      'https://securetoken.googleapis.com/v1/token',
      'https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig',
      'https://apis.google.com/js/api.js',
      'https://grouptask-123.firebaseapp.com/__/auth/handler',
      'https://grouptask-123.firebaseio.com/.lp',
      `${ORIGIN}/__/auth/iframe`,
    ]) expect([url, s(url)]).toEqual([url, null]);
  });

  test('writes and other sites are never handled', () => {
    expect(s('/index.html', 'POST')).toBeNull();
    expect(s('https://example.org/script.js')).toBeNull();
  });

  test('Google Fonts files are cached for offline starts', () => {
    expect(s('https://fonts.googleapis.com/css2?family=Nunito')).toBe('cache-first');
    expect(s('https://fonts.gstatic.com/s/nunito/v1/x.woff2')).toBe('cache-first');
  });

  test('index.html served for a missing /assets/ file is never cached as a script', () => {
    expect(ctx.isCacheable(`${ORIGIN}/assets/old-chunk.js`, response(200, 'text/html; charset=utf-8'))).toBe(false);
    expect(ctx.isCacheable(`${ORIGIN}/assets/new-chunk.js`, response(200, 'text/javascript'))).toBe(true);
    expect(ctx.isCacheable(`${ORIGIN}/index.html`, response(200, 'text/html'))).toBe(true);
    expect(ctx.isCacheable(`${ORIGIN}/assets/x.js`, response(404, 'text/plain'))).toBe(false);
  });

  test('finds every chunk named in the page and the entry script', () => {
    const html = '<script type="module" src="/assets/index-AbC.js"></script><link href="/assets/index-Def.css">';
    const entry = 'm.f||(m.f=["assets/Dashboard-1.js","assets/TaskBoard-2.js","assets/syncService-3.js"])';
    expect(ctx.buildAssetsFrom(html)).toEqual(['/assets/index-AbC.js', '/assets/index-Def.css']);
    expect(ctx.buildAssetsFrom(entry)).toEqual(['/assets/Dashboard-1.js', '/assets/TaskBoard-2.js', '/assets/syncService-3.js']);
  });
});

describe('service worker versions (F3)', () => {
  test('the cache name changes with every build', () => {
    expect(loadWorker({ query: '?v=index-AbC123' }).read('CACHE_NAME')).toBe('grouptask-index-AbC123');
    expect(loadWorker({ query: '?v=index-XyZ789' }).read('CACHE_NAME')).toBe('grouptask-index-XyZ789');
  });

  test("the page's build id is its hashed entry file name", () => {
    expect(buildId('https://grouptask.example/assets/index-AbC123.js')).toBe('index-AbC123');
  });

  test('activating deletes the caches of older builds only', async () => {
    const w = loadWorker({ query: '?v=new', cacheNames: ['grouptask-old', 'grouptask-v7', 'grouptask-new', 'other-app'] });
    let done;
    w.listeners.activate({ waitUntil: (p) => { done = p; } });
    await done;
    expect(w.deleted.sort()).toEqual(['grouptask-old', 'grouptask-v7']);
  });

  test('a new version waits until the page asks it to take over', () => {
    const w = loadWorker();
    w.listeners.install({ waitUntil: () => {} });
    expect(w.wasSkipped()).toBe(false);
    w.listeners.message({ data: { type: 'SKIP_WAITING' } });
    expect(w.wasSkipped()).toBe(true);
  });
});
