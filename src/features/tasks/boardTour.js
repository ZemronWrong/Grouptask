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
import { getTerm, getApproversPhrase } from '../../services/themeService.js';

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

// F2: wording comes from the current board theme (Standard by default), so the
// tour names the same buttons and roles the board shows.
function columnsStep() {
  return {
    selector: SEL.columns,
    title: 'How tasks move',
    text: `Tasks move left to right: ${getTerm('todoColumn')} → In Progress → Pending Approval → Completed.`,
  };
}

function scoreStep() {
  return {
    selector: SEL.score,
    title: 'Points and scores',
    text: `The leaderboard shows ${getTerm('rewardLabel').toLowerCase()}. Each person sees only their own contribution score.`,
  };
}

function adminSteps() {
  return [
    columnsStep(),
    {
      selector: SEL.addTask,
      title: 'Add tasks',
      text: `Add tasks here with ${getTerm('addQuest')}. Set a weight: bigger or harder tasks get a higher weight, and that's what contribution scores are based on.`,
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
      text: `When a ${getTerm('member').toLowerCase()} submits a task it lands here. Press ${getTerm('reviewProof')} to approve or reject it. You can't approve a task that's assigned to you: the other ${getApproversPhrase()} approves yours.`,
    },
    scoreStep(),
  ];
}

function memberSteps() {
  return [
    columnsStep(),
    {
      selector: SEL.dragCard,
      title: 'Drag and drop',
      text: 'Drag your cards (look for the ⋮⋮ handle) to move them. Drag an unassigned card into In Progress to take it.',
      demo: DRAG_DEMO_HTML,
    },
    {
      selector: SEL.pending,
      title: 'Submit for approval',
      text: `Finished? Drag your card here (or press 🚀 ${getTerm('submitProof')}) and add a link to your work. Your ${getApproversPhrase()} checks it and moves it to Completed.`,
    },
    {
      selector: SEL.completed,
      title: 'Completed',
      text: `Only the ${getApproversPhrase()} can move cards here. That's the approval step.`,
    },
    scoreStep(),
  ];
}

function viewerSteps() {
  return [
    columnsStep(),
    {
      selector: SEL.completed,
      title: 'View only',
      text: `You can open cards and follow progress, but viewers can't move tasks. The ${getApproversPhrase()} approves cards into Completed.`,
    },
    scoreStep(),
  ];
}

/** The tour for this member's role. */
export function boardTourSteps(me) {
  if (isAdminMember(me)) return adminSteps();
  if (me?.role === 'viewer') return viewerSteps();
  return memberSteps();
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
