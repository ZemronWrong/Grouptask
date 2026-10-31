import { describe, test, expect, beforeEach } from '@jest/globals';
import { addRoute, initRouter, currentPath } from '../src/services/router.js';

// ─── G1: the bare site address opens the welcome page ───────────────────────

// Jest runs in Node, so stand in a minimal window whose hash changes like a browser's
function fakeWindow(hash) {
  const listeners = [];
  const location = {
    get hash() { return hash; },
    set hash(value) {
      hash = value.startsWith('#') ? value : `#${value}`;
      listeners.forEach((fn) => fn());
    },
  };
  return { location, addEventListener: (_type, fn) => listeners.push(fn) };
}

const rendered = [];
addRoute('/welcome', () => { rendered.push('welcome'); });
addRoute('/login', () => { rendered.push('login'); });
addRoute('/dashboard', () => { rendered.push('dashboard'); });

describe('bare site address', () => {
  beforeEach(() => { rendered.length = 0; });

  test('with an empty hash and no user, the first screen rendered is the welcome page', () => {
    globalThis.window = fakeWindow('');
    initRouter();
    expect(rendered[0]).toBe('welcome');
  });

  test('"#/" counts as the bare address too', () => {
    globalThis.window = fakeWindow('#/');
    expect(currentPath()).toBe('/welcome');
    initRouter();
    expect(rendered).toEqual(['welcome']);
  });

  test('an unknown address falls back to the welcome page, not Login', () => {
    globalThis.window = fakeWindow('#/no-such-page');
    initRouter();
    expect(rendered).toEqual(['welcome']);
    expect(window.location.hash).toBe('#/welcome');
  });

  test('a real path is left alone', () => {
    globalThis.window = fakeWindow('#/dashboard');
    expect(currentPath()).toBe('/dashboard');
  });
});
