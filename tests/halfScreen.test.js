/**
 * Part H: half-screen windows — nav modes, board column tabs, drag auto-scroll,
 * and a few checks on the stylesheet that keep the layout from regressing.
 */
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import {
  navMode, toggledPref, readSidebarPref, writeSidebarPref, SIDEBAR_PREF_KEY,
  NAV_DRAWER_BELOW, NAV_RAIL_BELOW,
} from '../src/utils/navLayout.js';
import { readBoardTab, writeBoardTab, stepTab, TAB_STATUSES } from '../src/features/tasks/boardTabs.js';
import { edgeScrollStep, axisScrollStep, EDGE_ZONE_PX, MAX_SCROLL_STEP_PX } from '../src/features/tasks/dragDrop.js';
import { boardTourSteps } from '../src/features/tasks/boardTour.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}

function throwingStorage() {
  const fail = () => { throw new Error('blocked'); };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

const CSS = readFileSync(new URL('../src/assets/styles/styles.css', import.meta.url), 'utf8');

// ─── H2: navigation modes ────────────────────────────────────────────────────

describe('navMode', () => {
  test('full sidebar on wide windows, icon rail on medium, drawer on narrow', () => {
    expect(navMode(1920)).toBe('full');
    expect(navMode(1366)).toBe('full');
    expect(navMode(1280)).toBe('full');
    expect(navMode(960)).toBe('rail');    // half of 1920
    expect(navMode(768)).toBe('rail');
    expect(navMode(683)).toBe('drawer');  // half of 1366
    expect(navMode(360)).toBe('drawer');
  });

  test('breakpoints sit exactly at the documented widths', () => {
    expect(navMode(NAV_RAIL_BELOW)).toBe('full');
    expect(navMode(NAV_RAIL_BELOW - 1)).toBe('rail');
    expect(navMode(NAV_DRAWER_BELOW)).toBe('rail');
    expect(navMode(NAV_DRAWER_BELOW - 1)).toBe('drawer');
  });

  test('the manual toggle wins on medium and wide windows', () => {
    expect(navMode(1920, 'collapsed')).toBe('rail');
    expect(navMode(960, 'expanded')).toBe('full');
  });

  test('narrow windows always use the drawer, whatever was saved', () => {
    expect(navMode(683, 'expanded')).toBe('drawer');
    expect(navMode(683, 'collapsed')).toBe('drawer');
  });

  test('the toggle flips between rail and full', () => {
    expect(toggledPref('rail')).toBe('expanded');
    expect(toggledPref('full')).toBe('collapsed');
    expect(navMode(960, toggledPref(navMode(960)))).toBe('full');
    expect(navMode(1366, toggledPref(navMode(1366)))).toBe('rail');
  });
});

describe('sidebar preference storage', () => {
  test('is remembered per device', () => {
    const storage = memoryStorage();
    expect(readSidebarPref(storage)).toBe(null);
    writeSidebarPref('collapsed', storage);
    expect(storage.getItem(SIDEBAR_PREF_KEY)).toBe('collapsed');
    expect(readSidebarPref(storage)).toBe('collapsed');
  });

  test('ignores unknown values', () => {
    expect(readSidebarPref(memoryStorage({ [SIDEBAR_PREF_KEY]: 'sideways' }))).not.toBe('sideways');
  });

  test('blocked storage falls back to this session without throwing', () => {
    const blocked = throwingStorage();
    expect(() => writeSidebarPref('expanded', blocked)).not.toThrow();
    expect(readSidebarPref(blocked)).toBe('expanded');
  });
});

// ─── H1: column tabs (narrow board) ──────────────────────────────────────────

describe('board column tabs', () => {
  test('default to To Do', () => {
    expect(readBoardTab('g-new', memoryStorage())).toBe('todo');
  });

  test('are remembered per board', () => {
    const storage = memoryStorage();
    writeBoardTab('g1', 'pending-approval', storage);
    writeBoardTab('g2', 'done', storage);
    expect(readBoardTab('g1', storage)).toBe('pending-approval');
    expect(readBoardTab('g2', storage)).toBe('done');
  });

  test('ignore values that are not columns', () => {
    const storage = memoryStorage({ grouptask_board_tab_g1: 'archived' });
    expect(readBoardTab('g1', storage)).toBe('todo');
    writeBoardTab('g1', 'nonsense', storage);
    expect(readBoardTab('g1', storage)).toBe('todo');
  });

  test('blocked storage keeps the tab for this page instead of throwing', () => {
    const blocked = throwingStorage();
    expect(() => writeBoardTab('g-blocked', 'in-progress', blocked)).not.toThrow();
    expect(readBoardTab('g-blocked', blocked)).toBe('in-progress');
  });

  test('arrow keys step through the four columns and wrap', () => {
    expect(TAB_STATUSES).toEqual(['todo', 'in-progress', 'pending-approval', 'done']);
    expect(stepTab('todo', 1)).toBe('in-progress');
    expect(stepTab('done', 1)).toBe('todo');
    expect(stepTab('todo', -1)).toBe('done');
  });
});

// ─── H3: auto-scroll while dragging ──────────────────────────────────────────

describe('drag auto-scroll speed', () => {
  test('is zero outside the edge zone', () => {
    expect(edgeScrollStep(EDGE_ZONE_PX)).toBe(0);
    expect(edgeScrollStep(500)).toBe(0);
  });

  test('speeds up closer to the edge', () => {
    const far = edgeScrollStep(EDGE_ZONE_PX - 5);
    const mid = edgeScrollStep(EDGE_ZONE_PX / 2);
    const edge = edgeScrollStep(0);
    expect(far).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(far);
    expect(edge).toBe(MAX_SCROLL_STEP_PX);
    expect(edgeScrollStep(-20)).toBe(MAX_SCROLL_STEP_PX);   // pointer past the edge
  });

  test('points the right way along an axis', () => {
    expect(axisScrollStep(5, 0, 600)).toBeLessThan(0);      // near the start: scroll back
    expect(axisScrollStep(595, 0, 600)).toBeGreaterThan(0); // near the end: scroll on
    expect(axisScrollStep(300, 0, 600)).toBe(0);            // middle: stay
  });

  test('uses a smaller zone in a small box so its middle never scrolls', () => {
    expect(axisScrollStep(50, 0, 100)).toBe(0);
    expect(axisScrollStep(10, 0, 0)).toBe(0);
  });
});

// ─── H1/H2: the tutorial still finds its targets in the narrow layouts ───────

describe('board tour targets', () => {
  const steps = boardTourSteps({ role: 'member' });
  const selectorsOf = (title) => [].concat(steps.find((s) => s.title === title).selector);

  test('hidden columns fall back to their tab', () => {
    expect(selectorsOf('Submit for approval')).toContain('.column-tab[data-status="pending-approval"]');
    expect(selectorsOf('Completed')).toContain('.column-tab[data-status="done"]');
  });

  test('the leaderboard link falls back to the menu button', () => {
    expect(selectorsOf('Points and scores')).toContain('.nav-menu-btn');
  });
});

// ─── Stylesheet guards ───────────────────────────────────────────────────────

describe('stylesheet', () => {
  const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

  test('the sidebar is never simply hidden', () => {
    expect(rules).not.toMatch(/\.sidebar\s*\{\s*display:\s*none/);
  });

  test('the board lays out from its own width (container queries)', () => {
    expect(rules).toMatch(/\.kanban-area\s*\{[^}]*container:\s*board\s*\/\s*inline-size/);
    expect(rules).toMatch(/@container board \(width < 1000px\)/);
    expect(rules).toMatch(/@container board \(width < 600px\)/);
  });

  test('modals always fit the window', () => {
    const modal = rules.match(/\n\.modal \{[^}]*\}/g).pop();
    expect(modal).toMatch(/max-height:\s*90dvh/);
  });
});
