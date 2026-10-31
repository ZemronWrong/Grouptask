import { describe, test, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'fs';
import { oncePerKey } from '../src/utils/once.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const staticImports = (src) => [...src.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] || m[2]);

// ─── F3.4: bootstrap runs once ───────────────────────────────────────────────

describe('oncePerKey (bootstrap runs only once)', () => {
  test('calls made while a run is in progress reuse it', async () => {
    let runs = 0;
    let release;
    const once = oncePerKey(() => { runs++; return new Promise((r) => { release = r; }); });
    const a = once('uid1');
    const b = once('uid1');
    expect(a).toBe(b);
    await Promise.resolve();
    release(true);
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(runs).toBe(1);
  });

  test('after it succeeded, later calls do not run it again', async () => {
    let runs = 0;
    const once = oncePerKey(async () => { runs++; return 'done'; });
    await once('uid1');
    await once('uid1');
    expect(await once('uid1')).toBe('done');
    expect(runs).toBe(1);
  });

  test('each user gets their own run', async () => {
    const seen = [];
    const once = oncePerKey(async (uid) => { seen.push(uid); });
    await Promise.all([once('a'), once('b'), once('a')]);
    expect(seen).toEqual(['a', 'b']);
  });

  test('a failed run is forgotten, so the next call tries again', async () => {
    let runs = 0;
    const once = oncePerKey(async () => { runs++; if (runs === 1) throw new Error('offline'); return 'ok'; });
    await expect(once('uid1')).rejects.toThrow('offline');
    expect(await once('uid1')).toBe('ok');
    expect(runs).toBe(2);
  });

  test('reset() forgets a user (sign-out)', async () => {
    let runs = 0;
    const once = oncePerKey(async () => { runs++; });
    await once('uid1');
    once.reset('uid1');
    await once('uid1');
    expect(runs).toBe(2);
  });
});

describe('bootstrapUserData has a single caller', () => {
  test('login and register no longer bootstrap on their own', () => {
    for (const page of ['src/features/auth/LoginPage.js', 'src/features/auth/RegisterPage.js']) {
      expect(read(page)).not.toMatch(/bootstrapUserData/);
    }
  });

  test('the app only goes through the once-only wrapper', () => {
    const app = read('src/app.js');
    expect(app).toMatch(/bootstrapUserDataOnce\(/);
    expect(app).not.toMatch(/\bbootstrapUserData\(/);
    expect(read('src/services/session.js')).toMatch(/oncePerKey\(/);
  });
});

// ─── F3.1: what the first download contains ─────────────────────────────────

/** Every module reachable from src/main.js through static imports only. */
function startupGraph() {
  const seen = new Set();
  const packages = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const dir = file.slice(0, file.lastIndexOf('/') + 1);
    for (const spec of staticImports(read(file))) {
      if (!spec.startsWith('.')) { packages.add(spec); continue; }
      const resolved = new URL(spec, `file:///${dir}`).pathname.replace(/^\//, '');
      if (resolved.endsWith('.js') && existsSync(new URL(`../${resolved}`, import.meta.url))) visit(resolved);
    }
  };
  visit('src/main.js');
  return { modules: [...seen], packages: [...packages] };
}

describe('welcome/login/register download only what they need', () => {
  const { modules, packages } = startupGraph();

  test('the walk found the start-up modules', () => {
    expect(modules).toEqual(expect.arrayContaining(['src/app.js', 'src/features/auth/WelcomePage.js', 'src/features/auth/LoginPage.js']));
  });

  test('no Firestore or Chart.js', () => {
    expect(packages).not.toContain('firebase/firestore');
    expect(packages.filter((p) => p.startsWith('chart.js'))).toEqual([]);
  });

  test('no board, dashboard, members, profile or audit screens', () => {
    expect(modules.filter((m) => /features\/(tasks|dashboard|members|profile|audit)\//.test(m))).toEqual([]);
  });

  test('no sync engine or member service (they bring Firestore)', () => {
    expect(modules.filter((m) => /services\/(syncService|memberService)\.js$/.test(m) || m.endsWith('firestoreDb.js'))).toEqual([]);
  });

  test('Chart.js is imported piece by piece, not chart.js/auto', () => {
    expect(read('src/features/dashboard/Leaderboard.js')).not.toMatch(/chart\.js\/auto/);
  });
});
