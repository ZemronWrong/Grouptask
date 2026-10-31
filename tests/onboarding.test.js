import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import {
  boardTourSteps, boardTourKey, hasSeenBoardTour, markBoardTourSeen, clearTourFlags,
  BOARD_TOUR_VERSION, DRAG_DEMO_HTML,
} from '../src/features/tasks/boardTour.js';
import { filterVisibleSteps, placePopup } from '../src/utils/tour.js';
import { DEMO_STEPS, DEMO_COLUMNS, DEMO_STEP_MS, stepAfter } from '../src/features/auth/WelcomePage.js';
import { dropBlockReason, TASK_STATUSES } from '../src/features/tasks/taskPermissions.js';

const owner   = { id: 'g1_owner', uid: 'owner', role: 'owner' };
const coAdmin = { id: 'g1_co',    uid: 'co',    role: 'co-admin' };
const member  = { id: 'g1_mem',   uid: 'mem',   role: 'member' };
const viewer  = { id: 'g1_view',  uid: 'view',  role: 'viewer' };

/** Minimal localStorage stand-in. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    keys: () => [...data.keys()],
  };
}

function throwingStorage() {
  const fail = () => { throw new Error('blocked'); };
  return { get length() { return fail(); }, key: fail, getItem: fail, setItem: fail, removeItem: fail };
}

const sourceOf = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const importsOf = (path) => [...sourceOf(path).matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

// ─── D6: tour step lists ─────────────────────────────────────────────────────

describe('board tour steps', () => {
  const titles = (me) => boardTourSteps(me).map((s) => s.title);

  test('owner and co-admin get the same five-step admin tour', () => {
    expect(boardTourSteps(owner)).toHaveLength(5);
    expect(boardTourSteps(coAdmin)).toEqual(boardTourSteps(owner));
    expect(titles(owner)).toEqual(['How tasks move', 'Add tasks', 'Drag and drop', 'Approve submitted work', 'Points and scores']);
  });

  test('members get a five-step tour without the Add task step', () => {
    expect(titles(member)).toEqual(['How tasks move', 'Drag and drop', 'Submit for approval', 'Completed', 'Points and scores']);
    expect(boardTourSteps(member).some((s) => s.selector === '.btn-add-task-col')).toBe(false);
  });

  test('a missing member record falls back to the member tour', () => {
    expect(boardTourSteps(undefined)).toEqual(boardTourSteps(member));
  });

  test('everyone except viewers gets the drag-and-drop step with the mini demo', () => {
    for (const me of [owner, coAdmin, member]) {
      const drag = boardTourSteps(me).find((s) => s.title === 'Drag and drop');
      expect(drag.demo).toBe(DRAG_DEMO_HTML);
      // Highlights a draggable card, or the board if there is none yet
      expect(drag.selector).toEqual(['.task-card[draggable="true"]', '.kanban-wrapper']);
    }
    expect(boardTourSteps(viewer).some((s) => s.demo)).toBe(false);
    expect(boardTourSteps(viewer).some((s) => /drag/i.test(s.text))).toBe(false);
  });

  test('first and last steps are shared by every role', () => {
    for (const me of [owner, member, viewer]) {
      const steps = boardTourSteps(me);
      expect(steps[0].text).toBe('Tasks move left to right: To Do → In Progress → Pending Approval → Completed.');
      expect(steps.at(-1).text).toBe('The leaderboard shows points. Each person sees only their own contribution score.');
    }
  });

  test('every step has a target, a title and text', () => {
    for (const me of [owner, member, viewer]) {
      for (const s of boardTourSteps(me)) {
        expect(s.selector).toBeTruthy();
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.text.length).toBeGreaterThan(0);
      }
    }
  });

  test('wording matches the board rules', () => {
    const memberText = boardTourSteps(member).map((s) => s.text).join(' ');
    const adminText = boardTourSteps(owner).map((s) => s.text).join(' ');
    const t = (status, assignedTo = null) => ({ id: 't', status, assignedTo });

    // "Only the leader or co-leader can move cards here"
    expect(memberText).toMatch(/Only the leader or co-leader can move cards here/);
    expect(dropBlockReason(t('pending-approval', member.id), member, 'done')).not.toBeNull();
    // "Drag an unassigned card into In Progress to take it"
    expect(memberText).toMatch(/unassigned card into In Progress/);
    expect(dropBlockReason(t('todo'), member, 'in-progress')).toBeNull();
    // "Drag your card here (or press 🚀 Submit for approval)" — the card's button label
    expect(memberText).toMatch(/🚀 Submit for approval/);
    expect(dropBlockReason(t('in-progress', member.id), member, 'pending-approval')).toBeNull();
    // "You can't approve a task that's assigned to you" / "Completed cards are locked"
    expect(adminText).toMatch(/can't approve a task that's assigned to you/);
    expect(dropBlockReason(t('pending-approval', owner.id), owner, 'done')).not.toBeNull();
    expect(adminText).toMatch(/Completed cards are locked/);
    TASK_STATUSES.filter((s) => s !== 'done').forEach((s) => {
      expect(dropBlockReason(t('done', member.id), owner, s)).not.toBeNull();
    });
  });
});

// ─── D6: "seen" flag ─────────────────────────────────────────────────────────

describe('board tour seen flag', () => {
  test('key is per user and versioned', () => {
    expect(BOARD_TOUR_VERSION).toBe('v1');
    expect(boardTourKey('abc')).toBe('grouptask_tour_board_v1_abc');
  });

  test('not seen until marked, then seen', () => {
    const storage = memoryStorage();
    expect(hasSeenBoardTour('u-fresh', storage)).toBe(false);
    markBoardTourSeen('u-fresh', storage);
    expect(storage.getItem('grouptask_tour_board_v1_u-fresh')).toBe('1');
    expect(hasSeenBoardTour('u-fresh', storage)).toBe(true);
  });

  test('a stored flag from an earlier visit counts as seen', () => {
    const storage = memoryStorage({ 'grouptask_tour_board_v1_u-old': '1' });
    expect(hasSeenBoardTour('u-old', storage)).toBe(true);
  });

  test('one user having seen it does not hide it for another user', () => {
    const storage = memoryStorage();
    markBoardTourSeen('u-a', storage);
    expect(hasSeenBoardTour('u-b', storage)).toBe(false);
  });

  test('an older version flag does not count', () => {
    const storage = memoryStorage({ 'grouptask_tour_board_v0_u-ver': '1' });
    expect(hasSeenBoardTour('u-ver', storage)).toBe(false);
  });

  test("Replay tutorials clears only this user's tour keys", () => {
    const storage = memoryStorage({
      'grouptask_tour_board_v1_u-c': '1',
      'grouptask_tour_board_v0_u-c': '1',
      'grouptask_tour_board_v1_u-other': '1',
      grouptask_theme: 'dark',
    });
    markBoardTourSeen('u-c', storage);
    expect(clearTourFlags('u-c', storage)).toBe(2);
    expect(hasSeenBoardTour('u-c', storage)).toBe(false);
    expect(storage.keys().sort()).toEqual(['grouptask_theme', 'grouptask_tour_board_v1_u-other']);
  });

  test('blocked storage never throws and still remembers for this session', () => {
    const storage = throwingStorage();
    expect(hasSeenBoardTour('u-blocked', storage)).toBe(false);
    expect(() => markBoardTourSeen('u-blocked', storage)).not.toThrow();
    expect(hasSeenBoardTour('u-blocked', storage)).toBe(true);
    expect(clearTourFlags('u-blocked', storage)).toBe(0);
    expect(hasSeenBoardTour('u-blocked', storage)).toBe(false);
  });

  test('no storage at all still works', () => {
    expect(hasSeenBoardTour('u-none', null)).toBe(false);
    markBoardTourSeen('u-none', null);
    expect(hasSeenBoardTour('u-none', null)).toBe(true);
  });
});

// ─── D6: tour helper ─────────────────────────────────────────────────────────

describe('tour helper', () => {
  test('steps whose element is not on screen are skipped', () => {
    const steps = [{ selector: '.a' }, { selector: '.missing' }, { selector: null }, { selector: ['.missing', '.b'] }];
    const onScreen = (sel) => [].concat(sel).some((s) => s === '.a' || s === '.b');
    expect(filterVisibleSteps(steps, onScreen)).toEqual([steps[0], steps[2], steps[3]]);
    expect(filterVisibleSteps(undefined, onScreen)).toEqual([]);
  });

  const vp = { width: 1280, height: 800 };
  const size = { width: 340, height: 200 };
  const rect = (top, left, width, height) => ({ top, left, width, height, bottom: top + height, right: left + width });

  test('popup goes below the target when there is room', () => {
    const pos = placePopup(rect(100, 500, 200, 50), size, vp);
    expect(pos.side).toBe('bottom');
    expect(pos.top).toBe(164);
  });

  test('popup goes above a target near the bottom', () => {
    expect(placePopup(rect(650, 500, 200, 50), size, vp).side).toBe('top');
  });

  test('popup beside a tall column', () => {
    expect(placePopup(rect(20, 100, 300, 760), size, vp).side).toBe('right');
    expect(placePopup(rect(20, 900, 370, 760), size, vp).side).toBe('left');
  });

  test('a target filling the screen gets the popup over it, inside the viewport', () => {
    const pos = placePopup(rect(8, 8, 1264, 784), size, vp);
    expect(pos.side).toBe('over');
    expect(pos.top + size.height).toBeLessThanOrEqual(vp.height);
  });

  test('no target: centred', () => {
    expect(placePopup(null, size, vp)).toEqual({ top: 300, left: 470, side: 'center' });
  });

  test('popup is always kept inside the viewport', () => {
    const pos = placePopup(rect(100, 1200, 70, 40), size, vp);
    expect(pos.left + size.width).toBeLessThanOrEqual(vp.width - 8);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });
});

// ─── D4: welcome page demo ───────────────────────────────────────────────────

describe('welcome demo', () => {
  test('four steps, one per column, left to right', () => {
    expect(DEMO_STEPS.map((s) => s.column)).toEqual(['todo', 'in-progress', 'pending-approval', 'done']);
    expect(DEMO_COLUMNS.map((c) => c.key)).toEqual(TASK_STATUSES);
    DEMO_STEPS.forEach((s) => expect(s.caption.length).toBeGreaterThan(0));
  });

  test('auto-advances every 3–4 s and one loop stays under 20 s', () => {
    expect(DEMO_STEP_MS).toBeGreaterThanOrEqual(3000);
    expect(DEMO_STEP_MS).toBeLessThanOrEqual(4000);
    expect(DEMO_STEP_MS * DEMO_STEPS.length).toBeLessThan(20000);
  });

  test('◀ ▶ wrap around', () => {
    expect(stepAfter(0, 1)).toBe(1);
    expect(stepAfter(3, 1)).toBe(0);
    expect(stepAfter(0, -1)).toBe(3);
    expect(stepAfter(2, -1)).toBe(1);
  });
});

// ─── Neither feature can write data ──────────────────────────────────────────

describe('onboarding code is display-only', () => {
  const NO_DATA = /services\/|firebase|indexedDB|syncService/i;

  test('the welcome page imports no services', () => {
    importsOf('src/features/auth/WelcomePage.js').forEach((p) => expect(p).not.toMatch(NO_DATA));
  });

  // F2: the theme's wording is allowed; it only reads display settings
  const THEME = '../../services/themeService.js';

  test('the tour helper and board tour import no data services', () => {
    importsOf('src/utils/tour.js').forEach((p) => expect(p).not.toMatch(NO_DATA));
    importsOf('src/features/tasks/boardTour.js').filter((p) => p !== THEME).forEach((p) => expect(p).not.toMatch(NO_DATA));
  });

  test('the theme service itself imports nothing', () => {
    expect(importsOf('src/services/themeService.js')).toEqual([]);
  });
});
