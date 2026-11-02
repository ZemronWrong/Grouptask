/**
 * TaskBoard — Orchestrator for the Kanban board page.
 *
 * Responsibilities:
 *   - Load board data (via boardData.js).
 *   - Compose the page HTML (via boardRenderer.js).
 *   - Bind events once (via boardEvents.js, boardLayout.js).
 *   - Initialise drag-and-drop for non-viewers (via dragDrop.js).
 *   - Apply remote changes card-by-card without re-rendering (via boardPatch.js).
 *   - Show the first-time board tutorial (via boardTour.js).
 *   - A6: Export task list as CSV (via csv.js).
 *
 * Business logic (save, move, review, notify) lives in boardEvents.js.
 * HTML template helpers live in boardRenderer.js / TaskCard.js / TaskModal.js.
 * Layout management (tabs, scroll shadows) lives in boardLayout.js.
 * Remote DOM patching lives in boardPatch.js.
 * Data access lives in boardData.js.
 */

import { loadBoardData }                                      from './boardData.js';
import { boardPageHTML, getStatuses }                         from './boardRenderer.js';
import { patchBoard, isBusy }                                 from './boardPatch.js';
import { bindBoardLayout, selectBoardTab }                    from './boardLayout.js';
import { exportTasksCSV }                                     from '../../utils/csv.js';
import {
  bindBoardEvents,
  moveTask,
  undoMove,
  openProofSubmitModal,
  openProofReviewModal,
} from './boardEvents.js';
import { bindSidebarEvents }                                  from '../members/MemberList.js';
import { initDragDrop }                                       from './dragDrop.js';
import { currentUser }                                        from '../../services/authService.js';
import { dropBlockReason }                                    from './taskPermissions.js';
import { maybeStartBoardTour, startBoardTour }                from './boardTour.js';
import { captureScroll, restoreScroll }                       from '../../utils/helpers.js';
import { showToast }                                          from '../../utils/ui.js';

// ── Module-level state ────────────────────────────────────────────────────────

let currentGroupId        = null;
let dragDropInitialised   = false;
let boardEventsInitialised = false;
let fullRenderPending     = false;
let retryTimer            = null;

// Live context object — mutated on every render so delegated handlers always
// see the latest data without needing to be re-attached.
const _boardContext = {};

// Per-card HTML cache shared between boardRenderer and boardPatch.
const cardHtmlCache = new Map();

// Collections whose changes require a full page re-render (not just a patch).
const FULL_RENDER_COLLECTIONS = new Set(['members', 'groups', 'userProfiles']);

// ── Public API ────────────────────────────────────────────────────────────────

/** Reset drag-drop/event flags — call this when navigating to the board. */
export function resetBoardState() {
  dragDropInitialised = false;
  Object.keys(_boardContext).forEach((k) => delete _boardContext[k]);
}

// ── Main render ───────────────────────────────────────────────────────────────

export async function renderTaskBoard(groupId) {
  // E3: preserve scroll position when re-rendering the same board
  const scroll = currentGroupId === groupId && document.getElementById('kanban-board')
    ? captureScroll() : null;
  currentGroupId = groupId;

  const app  = document.getElementById('app');
  const data = await loadBoardData(groupId);

  app.innerHTML = boardPageHTML(groupId, data, cardHtmlCache);
  restoreScroll(scroll);

  // Refresh the shared context so delegated handlers see current data
  Object.assign(_boardContext, {
    groupId,
    members:     data.members,
    group:       data.group,
    tasks:       data.tasks,
    viewIsAdmin: data.isAdmin,
    me:          data.me,
    proofs:      data.groupProofs,
    profileMap:  data.profileMap,
  });

  // Bind layout (column tabs + scroll-edge shadows)
  bindBoardLayout(groupId, (status, opts) => selectBoardTab(groupId, status, opts));

  // Share modal trigger
  document.getElementById('btn-share-btn')?.addEventListener('click', () => {
    document.getElementById('share-modal').hidden = false;
  });

  // A6: CSV export (admin-only button)
  document.getElementById('btn-export-tasks-csv')?.addEventListener('click', () => {
    exportTasksCSV(_boardContext.tasks, _boardContext.members, _boardContext.group);
  });

  // D6: replay the board tutorial (reads the page only; never writes)
  const uid = currentUser()?.uid;
  document.getElementById('btn-board-tour')?.addEventListener('click', () =>
    startBoardTour(_boardContext.me, uid)
  );

  // Board events and sidebar are bound once via delegation — no re-attachment
  if (!boardEventsInitialised) {
    bindBoardEvents(_boardContext, renderTaskBoard);
    bindSidebarEvents(groupId);
    boardEventsInitialised = true;
  }

  // D5: drag-and-drop for everyone except viewers.
  // moveTask checks the role at drop time; dropping into Pending Approval /
  // Completed opens the modal instead of moving the card directly.
  if (data.me && data.me.role !== 'viewer' && !dragDropInitialised) {
    initDragDrop(
      async (taskId, newStatus) => {
        const gId    = _boardContext.groupId;
        const result = await moveTask(taskId, newStatus, gId, _boardContext.members);
        await renderTaskBoard(gId);
        if (result.action === 'submit') openProofSubmitModal(taskId);
        if (result.action === 'review') openProofReviewModal(taskId, _boardContext.proofs);
        // F4: brief window to undo a drag (not offered into Completed)
        if (result.action === 'moved') {
          const label = getStatuses().find((s) => s.key === newStatus)?.label || newStatus;
          showToast(`Moved to ${label}`, {
            type: 'success',
            action: {
              label: 'Undo',
              onClick: async () => {
                if (
                  await undoMove(taskId, result, gId, _boardContext.members) &&
                  currentGroupId === gId
                ) {
                  await renderTaskBoard(gId);
                }
              },
            },
          });
        }
      },
      (taskId, status) => {
        const task = _boardContext.tasks?.find((t) => t.id === taskId);
        return dropBlockReason(task, _boardContext.me, status);
      },
      {
        // H3: holding a card over a column tab opens that column
        onTabHover: (status) => selectBoardTab(currentGroupId, status),
      }
    );
    dragDropInitialised = true;
  }

  // D6: show the tutorial once on the user's first ever visit to any board
  maybeStartBoardTour(data.me, uid);
}

// ── Remote change handling (E3/E4) ────────────────────────────────────────────

function scheduleRetry(groupId) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => refreshBoard(groupId), 1000);
}

/**
 * Apply remote Firestore changes to the board on screen.
 * Card-level changes patch only the affected cards (open modals and scroll
 * position are preserved). Member/group/profile changes trigger a full
 * re-render once no modal or drag is active.
 *
 * @param {string} groupId
 * @param {Array}  changes  [{ collection, ids }] from the sync engine
 */
export async function refreshBoard(groupId, changes = []) {
  if (groupId !== currentGroupId || !document.getElementById('kanban-board')) return;
  if (changes.some((c) => FULL_RENDER_COLLECTIONS.has(c.collection))) fullRenderPending = true;

  if (document.querySelector('.task-card.dragging')) { scheduleRetry(groupId); return; }
  if (fullRenderPending && !isBusy()) {
    fullRenderPending = false;
    await renderTaskBoard(groupId);
    return;
  }
  await patchBoard(groupId, changes, _boardContext, cardHtmlCache);
  if (fullRenderPending) scheduleRetry(groupId);
}
