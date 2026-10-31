/**
 * Part I: toasts never cover open modals (I1) and the weight field is called
 * "Weight" in every theme (I2).
 */
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { showToast, dismissActionToasts, placeToasts, withCount } from '../src/utils/ui.js';
import { TERMS, BOARD_THEMES } from '../src/services/themeService.js';
import { rewardTooltip } from '../src/features/tasks/TaskCard.js';

// ─── A DOM just big enough for the toast code ────────────────────────────────

function fakeElement(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    parentElement: null,
    hidden: false,
    textContent: '',
    className: '',
    attrs: {},
    listeners: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    appendChild(child) {
      child.remove();
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    remove() {
      const p = this.parentElement;
      if (p) p.children.splice(p.children.indexOf(this), 1);
      this.parentElement = null;
    },
    get firstElementChild() { return this.children[0] || null; },
    get isConnected() {
      let n = this;
      while (n.parentElement) n = n.parentElement;
      return n === globalThis.document?.body;
    },
    getClientRects() { return this.hidden ? [] : [{}]; },
    click() { return this.listeners.click?.(); },
  };
  el.classList = {
    toggle(c, on) {
      const set = new Set(el.className.split(' ').filter(Boolean));
      if (on) set.add(c); else set.delete(c);
      el.className = [...set].join(' ');
    },
    contains: (c) => el.className.split(' ').includes(c),
  };
  return el;
}

function all(root, match) {
  const out = [];
  const walk = (n) => n.children.forEach((c) => { if (match(c)) out.push(c); walk(c); });
  walk(root);
  return out;
}

let body;
beforeEach(() => {
  jest.useFakeTimers();
  body = fakeElement('body');
  globalThis.document = {
    body,
    createElement: fakeElement,
    querySelectorAll: (sel) => {
      const classes = sel.split(',').map((s) => s.trim().slice(1));
      return all(body, (n) => classes.some((c) => n.className.split(' ').includes(c)));
    },
  };
});
afterEach(() => {
  dismissActionToasts();
  all(body, (n) => n.className.includes('toast ')).forEach((n) => n.remove());
  delete globalThis.document;
  jest.clearAllTimers();
  jest.useRealTimers();
});

const region = () => all(body, (n) => n.className.split(' ').includes('toast-region'))[0];
const toasts = () => region()?.children || [];

describe('I1: toasts and open modals', () => {
  test('the region moves to the top while a modal is open and back afterwards', () => {
    showToast('Saved');
    expect(region().classList.contains('toast-region-top')).toBe(false);
    const modal = fakeElement('div');
    modal.className = 'modal-overlay';
    body.appendChild(modal);
    placeToasts();
    expect(region().classList.contains('toast-region-top')).toBe(true);
    modal.hidden = true;
    placeToasts();
    expect(region().classList.contains('toast-region-top')).toBe(false);
  });

  test('the confirm dialog counts as a modal', () => {
    const dlg = fakeElement('div');
    dlg.className = 'confirm-overlay';
    body.appendChild(dlg);
    showToast('Deleted');
    expect(region().classList.contains('toast-region-top')).toBe(true);
  });

  test('opening a modal dismisses Undo toasts but keeps the others', () => {
    showToast('Moved to In Progress', { type: 'success', action: { label: 'Undo', onClick: () => {} } });
    showToast('Could not save', { type: 'error' });
    expect(toasts()).toHaveLength(2);
    dismissActionToasts();
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].children[0].textContent).toBe('Could not save');
  });

  test('identical messages collapse into one toast with a count', () => {
    const undo = { label: 'Undo', onClick: () => {} };
    showToast('Moved to In Progress', { type: 'success', action: undo });
    showToast('Moved to In Progress', { type: 'success', action: undo });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].children[1].textContent).toBe('Undo (2)');
    showToast('Saved');
    showToast('Saved');
    expect(toasts()).toHaveLength(2);
    expect(toasts()[1].children[0].textContent).toBe('Saved (2)');
  });

  test('Undo on a collapsed toast takes back every move, newest first', async () => {
    const order = [];
    showToast('Moved to In Progress', { type: 'success', action: { label: 'Undo', onClick: () => order.push('a') } });
    showToast('Moved to In Progress', { type: 'success', action: { label: 'Undo', onClick: () => order.push('b') } });
    await toasts()[0].children[1].click();
    expect(order).toEqual(['b', 'a']);
    expect(toasts()).toHaveLength(0);
  });

  test('never more than 3 toasts', () => {
    ['a', 'b', 'c', 'd', 'e'].forEach((m) => showToast(m));
    expect(toasts()).toHaveLength(3);
    expect(toasts().map((t) => t.children[0].textContent)).toEqual(['c', 'd', 'e']);
  });

  test('withCount only adds a count from 2 up', () => {
    expect(withCount('Undo', 1)).toBe('Undo');
    expect(withCount('Undo', 3)).toBe('Undo (3)');
  });

  test('the stylesheet has the top position for the region', () => {
    const css = readFileSync('src/assets/styles/styles.css', 'utf8');
    expect(css).toMatch(/\.toast-region\.toast-region-top\s*\{[^}]*top:\s*\d+px;[^}]*bottom:\s*auto/);
  });
});

describe('I2: "Weight" label', () => {
  test('every theme has a weight label, separate from what is earned', () => {
    for (const theme of BOARD_THEMES) {
      expect(TERMS[theme].weightLabel).toMatch(/weight/i);
      expect(TERMS[theme].rewardLabel).not.toMatch(/weight/i);
    }
    expect(TERMS.standard.weightLabel).toBe('Weight');
    expect(TERMS.standard.rewardLabel).toBe('Points');
    expect(TERMS.guild.rewardLabel).toBe('Gold');
  });

  test('the task modal labels the weight input with weightLabel', () => {
    const src = readFileSync('src/features/tasks/TaskModal.js', 'utf8');
    expect(src).toMatch(/<label for="task-weight-input">\$\{getTerm\('weightLabel'\)\}<\/label>/);
  });

  test('the card chip explains weight and points', () => {
    expect(rewardTooltip(100)).toBe('Weight 100. Earns 100 points when approved.');
  });
});
