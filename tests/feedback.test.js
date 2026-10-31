/**
 * F4/F5: instant feedback, undo, readable errors, avatar shrinking, and no
 * browser popups left in the code.
 */
import { describe, test, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { withBusy, isBusyButton, toastDuration } from '../src/utils/ui.js';
import { authErrorMessage, syncRejectedMessage } from '../src/utils/errors.js';
import { fitWithin } from '../src/utils/image.js';
import { undoMoveBlockReason } from '../src/features/tasks/taskPermissions.js';

/** Just enough of a <button> for withBusy. */
function fakeButton(html = 'Save') {
  const attrs = {};
  const classes = new Set();
  return {
    innerHTML: html,
    set textContent(v) { this.innerHTML = v; },
    get textContent() { return this.innerHTML; },
    disabled: false,
    dataset: {},
    setAttribute: (k, v) => { attrs[k] = v; },
    removeAttribute: (k) => { delete attrs[k]; },
    getAttribute: (k) => attrs[k],
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('withBusy (F4: instant feedback, no double saves)', () => {
  test('disables the button at once and restores it afterwards', async () => {
    const btn = fakeButton('Save task');
    const run = withBusy(btn, async () => 'done');
    expect(btn.disabled).toBe(true);
    expect(isBusyButton(btn)).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(await run).toBe('done');
    expect(btn.disabled).toBe(false);
    expect(isBusyButton(btn)).toBe(false);
    expect(btn.innerHTML).toBe('Save task');
  });

  test('a second click while saving is ignored', async () => {
    const btn = fakeButton();
    let calls = 0;
    const task = async () => { calls++; await wait(20); };
    const first = withBusy(btn, task);
    const second = withBusy(btn, task);
    expect(await second).toBeUndefined();
    await first;
    expect(calls).toBe(1);
  });

  test('shows "Saving…" only when it takes longer than the delay', async () => {
    const quick = fakeButton('Save');
    await withBusy(quick, async () => {}, { delay: 30 });
    expect(quick.innerHTML).toBe('Save');

    const slow = fakeButton('Save');
    let labelDuring = null;
    await withBusy(slow, async () => { await wait(40); labelDuring = slow.innerHTML; }, { delay: 10 });
    expect(labelDuring).toBe('Saving…');
    expect(slow.innerHTML).toBe('Save');
  });

  test('restores the button even if saving fails', async () => {
    const btn = fakeButton('Approve');
    await expect(withBusy(btn, async () => { throw new Error('nope'); })).rejects.toThrow('nope');
    expect(btn.disabled).toBe(false);
    expect(btn.innerHTML).toBe('Approve');
  });
});

describe('toast durations (F5)', () => {
  test('errors stay longer than success messages', () => {
    expect(toastDuration('error')).toBeGreaterThan(toastDuration('success'));
  });
  test('a toast with Undo stays about 5 seconds', () => {
    expect(toastDuration('success', true)).toBe(5000);
  });
});

describe('undoMoveBlockReason (F4: undo for card moves)', () => {
  const applied = { status: 'in-progress', assignedTo: 'g1_u1' };
  test('allowed when the card is as the move left it', () => {
    expect(undoMoveBlockReason({ status: 'in-progress', assignedTo: 'g1_u1' }, applied)).toBeNull();
  });
  test('refused if someone moved or reassigned the card since', () => {
    expect(undoMoveBlockReason({ status: 'pending-approval', assignedTo: 'g1_u1' }, applied)).toMatch(/changed/);
    expect(undoMoveBlockReason({ status: 'in-progress', assignedTo: 'g1_u2' }, applied)).toMatch(/changed/);
  });
  test('refused if the card was approved or deleted', () => {
    expect(undoMoveBlockReason({ status: 'done', assignedTo: 'g1_u1' }, applied)).toMatch(/locked/);
    expect(undoMoveBlockReason(null, applied)).toMatch(/no longer exists/);
  });
  test('treats a missing assignee as unassigned', () => {
    expect(undoMoveBlockReason({ status: 'todo' }, { status: 'todo', assignedTo: null })).toBeNull();
  });
});

describe('authErrorMessage (F5: readable errors)', () => {
  const cases = {
    'auth/wrong-password': /password is wrong/,
    'auth/invalid-credential': /email or password is wrong/,
    'auth/user-not-found': /no account with that email/,
    'auth/email-already-in-use': /already registered/,
    'auth/weak-password': /too short/,
    'auth/network-request-failed': /No internet connection/,
  };
  for (const [code, expected] of Object.entries(cases)) {
    test(code, () => {
      expect(authErrorMessage({ code, message: `Firebase: Error (${code}).` })).toMatch(expected);
    });
  }

  test('closing the Google window shows nothing', () => {
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toBe('');
  });
  test('offline wins over an unknown error', () => {
    expect(authErrorMessage({ message: 'Failed to fetch' }, 'fallback', false)).toMatch(/No internet connection/);
  });
  test("never shows Firebase's raw text", () => {
    expect(authErrorMessage({ code: 'auth/something-new', message: 'Firebase: Error (auth/something-new).' }, 'Sign in failed.', true))
      .toBe('Sign in failed.');
  });
  test('keeps our own plain messages (Mock Mode, invite codes)', () => {
    expect(authErrorMessage(new Error('Invite code not found. Double-check the code and try again.'), 'x', true))
      .toBe('Invite code not found. Double-check the code and try again.');
  });
});

describe('syncRejectedMessage (F5)', () => {
  test('explains a permission refusal in plain words', () => {
    expect(syncRejectedMessage('tasks', 'permission-denied')).toMatch(/don't have permission/);
    expect(syncRejectedMessage('comments', 'invalid-argument')).toMatch(/comment/);
  });
  test('stays quiet for collections that show their own status', () => {
    expect(syncRejectedMessage('peerReviews', 'permission-denied')).toBeNull();
  });
});

describe('fitWithin (F4: profile pictures are shrunk, not rejected)', () => {
  test('large images are scaled down to fit 256×256, keeping the shape', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 256, height: 192 });
    expect(fitWithin(1080, 1920)).toEqual({ width: 144, height: 256 });
  });
  test('small images are left alone', () => {
    expect(fitWithin(100, 80)).toEqual({ width: 100, height: 80 });
  });
});

describe('no browser popups (F4)', () => {
  function jsFiles(dir) {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? jsFiles(path) : path.endsWith('.js') ? [path] : [];
    });
  }

  test('nothing in src/ calls alert(), confirm() or prompt()', () => {
    const srcDir = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const offenders = [];
    const files = jsFiles(decodeURIComponent(srcDir));
    expect(files.length).toBeGreaterThan(40);  // the scan really found the source
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')       // block comments
        .replace(/(^|[^:])\/\/.*$/gm, '$1');    // line comments
      if (/(^|[^.\w])(alert|confirm|prompt)\s*\(/m.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
