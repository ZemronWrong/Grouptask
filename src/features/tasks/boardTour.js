/**
 * boardTour — the first-time task board tutorial (D6).
 *
 * The step lists follow the current board rules (taskPermissions.js): everyone
 * except viewers can drag, Completed cards are locked, members (and admins with
 * their own card) drop into Pending Approval through the Submit window, and
 * only an admin who isn't the assignee can approve.
 *
 * Whether the tour has been seen is kept per user in localStorage. Nothing here
 * writes to IndexedDB, the sync queue or Firestore.
 */

import { startTour, isTourActive } from '../../utils/tour.js';
import { isAdminMember } from './taskPermissions.js';

// Bump to show the tour to everyone again after it changes.
export const BOARD_TOUR_VERSION = 'v1';
const KEY_PREFIX = 'grouptask_tour_';

// ── Steps ─────────────────────────────────────────────────────────────────────

const SEL = {
  columns:   '.kanban-wrapper',
  addTask:   '.btn-add-task-col',
  dragCard:  ['.task-card[draggable="true"]', '.kanban-wrapper'],
  pending:   '.kanban-column[data-status="pending-approval"]',
  completed: '#completed-panel',
  score:     '.sidebar-link[href$="/leaderboard"]',
};

/** Ghost card picked up, carried one column over and dropped, on a loop. */
export const DRAG_DEMO_HTML = `
  <div class="tour-dnd">
    <div class="tour-dnd-col"><span>To Do</span></div>
    <div class="tour-dnd-col"><span>In Progress</span></div>
    <div class="tour-dnd-card"><span class="tour-dnd-grip">⋮⋮</span></div>
    <div class="tour-dnd-hand">✋</div>
  </div>
`;

const COLUMNS_STEP = {
  selector: SEL.columns,
  title: 'How tasks move',
  text: 'Tasks move left to right: To Do → In Progress → Pending Approval → Completed.',
};

const SCORE_STEP = {
  selector: SEL.score,
  title: 'Points and scores',
  text: 'The leaderboard shows points. Each person sees only their own contribution score.',
};

const ADMIN_STEPS = [
  COLUMNS_STEP,
  {
    selector: SEL.addTask,
    title: 'Add tasks',
    text: "Add tasks here. Set a weight: bigger or harder tasks get a higher weight, and that's what contribution scores are based on.",
  },
  {
    selector: SEL.dragCard,
    title: 'Drag and drop',
    text: 'Drag cards (look for the ⋮⋮ handle) to another column. Dropping a submitted card on Completed opens the review. Completed cards are locked.',
    demo: DRAG_DEMO_HTML,
  },
  {
    selector: SEL.pending,
    title: 'Approve submitted work',
    text: "When a member submits a task it lands here. Open it and approve or reject it. You can't approve a task that's assigned to you. Your co-leader approves yours.",
  },
  SCORE_STEP,
];

const MEMBER_STEPS = [
  COLUMNS_STEP,
  {
    selector: SEL.dragCard,
    title: 'Drag and drop',
    text: 'Drag your cards (look for the ⋮⋮ handle) to move them. Drag an unassigned card into In Progress to take it.',
    demo: DRAG_DEMO_HTML,
  },
  {
    selector: SEL.pending,
    title: 'Submit for approval',
    text: 'Finished? Drag your card here (or press 🚀 SUBMIT) and add a link to your work. An admin checks it and moves it to Completed.',
  },
  {
    selector: SEL.completed,
    title: 'Completed',
    text: "Only admins can move cards here. That's the approval step.",
  },
  SCORE_STEP,
];

const VIEWER_STEPS = [
  COLUMNS_STEP,
  {
    selector: SEL.completed,
    title: 'View only',
    text: "You can open cards and follow progress, but viewers can't move tasks. Admins approve cards into Completed.",
  },
  SCORE_STEP,
];

/** The tour for this member's role. */
export function boardTourSteps(me) {
  if (isAdminMember(me)) return ADMIN_STEPS;
  if (me?.role === 'viewer') return VIEWER_STEPS;
  return MEMBER_STEPS;
}

// ── "Seen" flag ───────────────────────────────────────────────────────────────

// Also remembered for this session, so a blocked localStorage doesn't replay it on every render
const seenThisSession = new Set();

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function boardTourKey(uid) {
  return `${KEY_PREFIX}board_${BOARD_TOUR_VERSION}_${uid}`;
}

export function hasSeenBoardTour(uid, storage = defaultStorage()) {
  if (seenThisSession.has(uid)) return true;
  try { return storage?.getItem(boardTourKey(uid)) === '1'; } catch { return false; }
}

export function markBoardTourSeen(uid, storage = defaultStorage()) {
  seenThisSession.add(uid);
  try { storage?.setItem(boardTourKey(uid), '1'); } catch { /* private mode: session only */ }
}

/** Forget every tutorial this user has seen (Settings → Replay tutorials). Returns how many keys were removed. */
export function clearTourFlags(uid, storage = defaultStorage()) {
  seenThisSession.delete(uid);
  try {
    if (!storage) return 0;
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(KEY_PREFIX) && k.endsWith(`_${uid}`)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
    return keys.length;
  } catch {
    return 0;
  }
}

// ── Starting it ───────────────────────────────────────────────────────────────

/** Start the board tour now (the "?" button). Closing it in any way marks it seen. */
export function startBoardTour(me, uid) {
  return startTour(boardTourSteps(me), { onFinish: () => markBoardTourSeen(uid) });
}

let pendingStart = null;

/**
 * Show the tour the first time this user opens a board. Safe to call after
 * every render: it does nothing once seen, while open, or while a start is pending.
 */
export function maybeStartBoardTour(me, uid) {
  if (!me || !uid || pendingStart || isTourActive() || hasSeenBoardTour(uid)) return;
  // Let the cards finish their entrance animation first
  pendingStart = setTimeout(() => {
    pendingStart = null;
    if (!document.getElementById('kanban-board') || isTourActive() || hasSeenBoardTour(uid)) return;
    if (document.querySelector('.modal-overlay:not([hidden]), #task-detail-modal')) return;
    startBoardTour(me, uid);
  }, 450);
}
