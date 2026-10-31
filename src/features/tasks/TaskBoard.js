/**
 * TaskBoard — Top-level orchestrator for the Kanban board page.
 *
 * Responsibilities:
 *   - Fetch all data required for the board view.
 *   - Compose HTML from TaskCard, TaskModal, and column templates.
 *   - Bind delegated events once via boardEvents.
 *   - Initialise drag-and-drop for every non-viewer.
 *   - Apply remote changes card by card (refreshBoard), without a full re-render.
 *   - Show the first-time board tutorial (boardTour) once the board is on screen.
 *   - H1: the board lays itself out from its own width (CSS container queries):
 *     wide = three columns + Completed panel, medium = one sideways-scrolling
 *     row, narrow = one column at a time behind column tabs.
 *
 * Business logic (save, move, review, notify) lives in boardEvents.js.
 * HTML templates live in TaskCard.js and TaskModal.js.
 */

import { STORES, getAllByIndex, get, getAll } from '../../services/indexedDBService.js';
import { escapeHtml, captureScroll, restoreScroll } from '../../utils/helpers.js';
import { initDragDrop } from './dragDrop.js';
import { currentUser } from '../../services/authService.js';
import { sidebarHTML, bindSidebarEvents } from '../members/MemberList.js';
import { getTerm } from '../../services/themeService.js';
import { ICONS } from '../../assets/icons/icons.js';
import { taskCardHTML } from './TaskCard.js';
import {
  taskModalHTML,
  shareModalHTML,
  boardMembersModalHTML,
  proofReviewModalHTML,
  proofSubmitModalHTML,
} from './TaskModal.js';
import { bindBoardEvents, moveTask, undoMove, openProofSubmitModal, openProofReviewModal } from './boardEvents.js';
import { showToast } from '../../utils/ui.js';
import { dropBlockReason } from './taskPermissions.js';
import { maybeStartBoardTour, startBoardTour } from './boardTour.js';
import { readBoardTab, writeBoardTab, showBoardTab, stepTab } from './boardTabs.js';

// ── Module-level state (preserved across re-renders within the same session) ──
let currentGroupId      = null;
let dragDropInitialised  = false;
let boardEventsInitialised = false;

// Live context object — mutated on every render so delegated handlers always
// see the latest members/proofs without being re-attached.
const _boardContext = {};

const DIFFICULTIES = [
  { key: 'easy',      label: 'Easy'       },
  { key: 'medium',    label: 'Medium'     },
  { key: 'hard',      label: 'Hard'       },
  { key: 'legendary', label: 'Legendary'  },
];

function getStatuses() {
  return [
    { key: 'todo',             label: getTerm('todoColumn'), icon: ICONS.todo       },
    { key: 'in-progress',      label: 'In Progress',         icon: ICONS.inProgress },
    { key: 'pending-approval', label: 'Pending Approval',    icon: ICONS.pending,  tab: 'Pending' },
    { key: 'done',             label: 'Completed',           icon: ICONS.done       },
  ];
}

/** Reset drag-drop/event flags — must be called when navigating to the board. */
export function resetBoardState() {
  dragDropInitialised = false;
  Object.keys(_boardContext).forEach((k) => delete _boardContext[k]);
}


// ── Data ──────────────────────────────────────────────────────────────────────

async function loadBoardData(groupId) {
  const user = currentUser();
  const [group, tasks, members, allProofs, comments, allProfiles] = await Promise.all([
    get(STORES.GROUPS, groupId),
    getAllByIndex(STORES.TASKS,    'groupId', groupId),
    getAllByIndex(STORES.MEMBERS,  'groupId', groupId),
    getAll(STORES.PROOF_SUBMISSIONS),
    getAllByIndex(STORES.COMMENTS, 'groupId', groupId),
    getAll(STORES.USER_PROFILES),
  ]);

  const groupProofs = (allProofs || []).filter((p) => p.groupId === groupId);
  const me          = members.find((m) => m.uid === user.uid);
  const isAdmin     = me?.role === 'owner' || me?.role === 'co-admin';

  // Build a uid → profile lookup for avatar images
  const profileMap = {};
  (allProfiles || []).forEach(p => { profileMap[p.uid] = p; });

  const pendingProofsCount = groupProofs.filter((p) => p.status === 'pending').length;
  return { group, tasks, members, groupProofs, comments, profileMap, me, isAdmin, pendingProofsCount };
}

/** Cards for one column, in display order. */
function tasksForStatus(tasks, status) {
  return status === 'done'
    ? tasks.filter((t) => t.status === 'done').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    : tasks.filter((t) => t.status === status).sort((a, b) => (b.weight || 0) - (a.weight || 0));
}

const COMPLETED_EMPTY_HTML = `<div class="completed-empty" style="padding:24px 12px; text-align:center; color:var(--text-muted); font-size:0.85rem;"><div style="font-size:2rem; margin-bottom:8px;">🏆</div>Completed tasks will appear here.</div>`;

/** What an empty column shows (D6: To Do tells people where tasks come from). */
function emptyColumnHTML(status, isAdmin) {
  if (status === 'done') return COMPLETED_EMPTY_HTML;
  if (status === 'todo') {
    return `<div class="column-empty-hint">${isAdmin
      ? `Add your first task with ${escapeHtml(getTerm('addQuest'))} below.`
      : `No tasks yet. Your ${escapeHtml(getTerm('owner').toLowerCase())} adds them with ${escapeHtml(getTerm('addQuest'))}.`}</div>`;
  }
  return '';
}

function pendingBadgeHTML(count) {
  return `<span class="pulse-badge">⚠️ ${count} ${getTerm('pendingProof')}</span>`;
}

// Last rendered HTML per card, so refreshBoard only replaces cards that changed.
const cardHtmlCache = new Map();

function cardHTML(t, d) {
  const html = taskCardHTML(t, d.members, d.groupProofs, d.comments, d.isAdmin, d.me, d.profileMap);
  cardHtmlCache.set(t.id, html);
  return html;
}

// ── Main render ───────────────────────────────────────────────────────────────

export async function renderTaskBoard(groupId) {
  // E3: re-rendering the board that is already on screen keeps its scroll position
  const scroll = currentGroupId === groupId && document.getElementById('kanban-board') ? captureScroll() : null;
  currentGroupId = groupId;
  const app  = document.getElementById('app');

  const data = await loadBoardData(groupId);
  const { group, tasks, members, groupProofs, profileMap, me, isAdmin, pendingProofsCount } = data;
  const STATUSES = getStatuses();
  const activeTab = readBoardTab(groupId);
  cardHtmlCache.clear();

  // Build member avatar stack HTML for header
  const MAX_AVATAR_SHOW = 5;
  const shownMembers = members.slice(0, MAX_AVATAR_SHOW);
  const extraCount = members.length - MAX_AVATAR_SHOW;
  const memberAvatarStack = `
    <div class="member-avatar-stack" id="btn-board-members" title="Board members (${members.length})" style="cursor:pointer; display:flex; align-items:center; gap:4px; margin-right:8px;">
      <div style="display:flex; flex-direction:row-reverse; align-items:center;">
        ${shownMembers.map((m, i) => {
          const prof = profileMap[m.uid];
          const avatarContent = (prof?.avatarType === 'custom' && prof?.avatar)
            ? `<img src="${prof.avatar}" alt="${escapeHtml(m.displayName?.[0] || '?')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : escapeHtml(m.displayName?.[0] || '?');
          return `<div class="avatar avatar-stack-item" title="${escapeHtml(m.displayName)}" style="z-index:${MAX_AVATAR_SHOW - i}; margin-left:-8px; width:28px; height:28px; font-size:0.75rem; border:2px solid var(--bg); overflow:hidden;">${avatarContent}</div>`;
        }).join('')}
      </div>
      ${extraCount > 0 ? `<span style="font-size:0.75rem; color:var(--text-secondary); font-family:var(--font-heading);">+${extraCount}</span>` : ''}
      <span class="member-count-label" style="font-size:0.75rem; color:var(--text-secondary); font-family:var(--font-heading); margin-left:2px;">${members.length} member${members.length !== 1 ? 's' : ''}</span>
    </div>
  `;

  app.innerHTML = `
    <div class="app-layout board-layout">
      ${sidebarHTML(groupId, 'board', members, tasks)}
      <div class="main-content">
        <header class="board-header">
          <div class="board-header-left">
            <h1 class="board-title" title="${escapeHtml(group?.name || getTerm('appTitle'))}">
              <span class="board-title-icon">${getTerm('boardTitlePrefix')}</span>
              <span class="board-title-text">${escapeHtml(group?.name || getTerm('appTitle'))}</span>
            </h1>
          </div>
          <div class="board-header-right">
            ${isAdmin && pendingProofsCount > 0 ? pendingBadgeHTML(pendingProofsCount) : ''}
            ${memberAvatarStack}
            <button class="btn btn-secondary btn-sm" id="btn-share-btn" title="Share" aria-label="Share">
              <span class="btn-icon-inline">${ICONS.link}</span><span class="btn-label"> Share</span>
            </button>
            <button class="btn btn-secondary btn-sm btn-board-tour" id="btn-board-tour" type="button"
              title="How this board works" aria-label="How this board works">?</button>
          </div>
        </header>

        <div class="kanban-area" id="kanban-area" data-active-tab="${activeTab}">
        <div class="column-tabs" role="tablist" aria-label="Board columns">
          ${STATUSES.map((s) => `
            <button type="button" role="tab" class="column-tab${s.key === activeTab ? ' active' : ''}" data-status="${s.key}"
              aria-selected="${s.key === activeTab}" tabindex="${s.key === activeTab ? 0 : -1}" title="${escapeHtml(s.label)}">
              <span class="column-tab-label">${escapeHtml(s.tab || s.label)}</span>
              <span class="column-count">${tasks.filter((t) => t.status === s.key).length}</span>
            </button>
          `).join('')}
        </div>
        <div class="kanban-wrapper">
          <div class="kanban-board" id="kanban-board">
            ${STATUSES.filter(s => s.key !== 'done').map((s) => `
              <div class="kanban-column" data-status="${s.key}">
                <div class="column-header">
                  <span class="column-icon">${s.icon}</span>
                  <span class="column-title">${s.label}</span>
                  <span class="column-count">${tasks.filter((t) => t.status === s.key).length}</span>
                </div>
                <div class="column-cards">
                  ${tasksForStatus(tasks, s.key).map((t) => cardHTML(t, data)).join('') || emptyColumnHTML(s.key, isAdmin)}
                </div>
                ${isAdmin && s.key === 'todo' ? `
                  <button class="btn btn-secondary btn-block btn-add-task-col" data-status="${s.key}"
                    style="margin-top:16px; background:transparent; border-style:dashed; color:var(--text-muted);">
                    ${getTerm('addQuest')}
                  </button>
                ` : ''}
              </div>
            `).join('')}
          </div>

          <!-- Completed side panel -->
          <aside class="completed-panel" id="completed-panel" data-status="done">
            <div class="column-header" style="margin-bottom:12px;">
              <span class="column-icon">${STATUSES.find(s => s.key === 'done')?.icon || ''}</span>
              <span class="column-title">Completed</span>
              <span class="column-count">${tasks.filter(t => t.status === 'done').length}</span>
            </div>
            <div class="column-cards" id="completed-cards">
              ${tasksForStatus(tasks, 'done').map((t) => cardHTML(t, data)).join('') || emptyColumnHTML('done', isAdmin)}
            </div>
          </aside>
        </div>
        </div>
      </div>
    </div>

    ${taskModalHTML(members, STATUSES, isAdmin)}
    ${shareModalHTML(members, group, profileMap)}
    ${boardMembersModalHTML(members, profileMap)}
    ${proofReviewModalHTML()}
    ${proofSubmitModalHTML()}
    <div id="task-detail-modal-container"></div>
  `;
  restoreScroll(scroll);
  bindBoardLayout();

  // Update the shared context that delegated handlers read
  Object.assign(_boardContext, { groupId, members, group, tasks, viewIsAdmin: isAdmin, me, proofs: groupProofs, profileMap });

  // Wire the separate share button (not the avatar stack)
  document.getElementById('btn-share-btn')?.addEventListener('click', () => {
    document.getElementById('share-modal').hidden = false;
  });

  // D6: replay the board tutorial. The tour only reads the page; it never writes.
  const uid = currentUser()?.uid;
  document.getElementById('btn-board-tour')?.addEventListener('click', () => startBoardTour(_boardContext.me, uid));

  if (!boardEventsInitialised) {
    bindBoardEvents(_boardContext, renderTaskBoard);
    bindSidebarEvents(groupId);
    boardEventsInitialised = true;
  }

  // D5: drag and drop for everyone except viewers. moveTask checks the role at
  // drop time; dropping into Pending Approval / Completed opens the same modal
  // as the SUBMIT / REVIEW APPROVAL buttons instead of moving the card.
  if (me && me.role !== 'viewer' && !dragDropInitialised) {
    initDragDrop(async (taskId, newStatus) => {
      const groupId = _boardContext.groupId;
      const result = await moveTask(taskId, newStatus, groupId, _boardContext.members);
      await renderTaskBoard(groupId);
      if (result.action === 'submit') openProofSubmitModal(taskId);
      if (result.action === 'review') openProofReviewModal(taskId, _boardContext.proofs);
      // F4: a few seconds to take a drag back (never offered into Completed,
      // which only happens through the review modal)
      if (result.action === 'moved') {
        const label = getStatuses().find((s) => s.key === newStatus)?.label || newStatus;
        showToast(`Moved to ${label}`, {
          type: 'success',
          action: {
            label: 'Undo',
            onClick: async () => {
              if (await undoMove(taskId, result, groupId, _boardContext.members) && currentGroupId === groupId) {
                await renderTaskBoard(groupId);
              }
            },
          },
        });
      }
    }, (taskId, status) => {
      const task = _boardContext.tasks?.find((t) => t.id === taskId);
      return dropBlockReason(task, _boardContext.me, status);
    }, {
      // H3: holding a card over a column tab opens that column
      onTabHover: (status) => selectBoardTab(status),
    });
    dragDropInitialised = true;
  }

  // D6: first visit to any board shows the tutorial (once per user)
  maybeStartBoardTour(me, uid);
}

// ── Layout (H1) ───────────────────────────────────────────────────────────────

let rowObserver = null;

/** Switch the narrow layout to another column and remember it for this board. */
function selectBoardTab(status, opts) {
  const area = document.getElementById('kanban-area');
  if (!area || !currentGroupId) return;
  writeBoardTab(currentGroupId, status);
  showBoardTab(area, status, opts);
  area.querySelector('.kanban-wrapper')?.scrollTo?.({ top: 0 });
}

/** Edge shadows on the sideways-scrolling row: is there more to the left/right? */
function updateRowEdges() {
  const area = document.getElementById('kanban-area');
  const row = area?.querySelector('.kanban-wrapper');
  if (!row) return;
  const max = row.scrollWidth - row.clientWidth;
  area.classList.toggle('more-left', max > 1 && row.scrollLeft > 1);
  area.classList.toggle('more-right', max > 1 && row.scrollLeft < max - 1);
}

function bindBoardLayout() {
  const area = document.getElementById('kanban-area');
  if (!area) return;
  const row = area.querySelector('.kanban-wrapper');

  area.querySelector('.column-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.column-tab');
    if (tab) selectBoardTab(tab.dataset.status);
  });
  area.querySelector('.column-tabs')?.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    selectBoardTab(stepTab(area.dataset.activeTab, dir), { focus: true });
  });

  // H4: recompute the shadows live while the window (or the row's content) changes size
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; updateRowEdges(); }); };
  row.addEventListener('scroll', schedule, { passive: true });
  rowObserver?.disconnect();
  rowObserver = new ResizeObserver(schedule);
  rowObserver.observe(row);
  rowObserver.observe(row.querySelector('.kanban-board'));
  updateRowEdges();
}

// ── Remote changes (E3/E4) ────────────────────────────────────────────────────

// Changes to these affect the header, sidebar, share modal or member lists, so
// they need a full render; everything else only affects cards and counts.
const FULL_RENDER_COLLECTIONS = new Set(['members', 'groups', 'userProfiles']);
let fullRenderPending = false;
let retryTimer = null;

function isBusy() {
  return !!document.querySelector(
    '.modal-overlay:not([hidden]), #task-detail-modal, #member-popup-overlay, .confirm-overlay, .task-card.dragging, .tour-overlay'
  );
}

/**
 * Apply remote changes to the board on screen. `changes` is a list of
 * `{ collection, ids }` from the sync engine. Card-level changes patch only the
 * cards and counts that changed (open modals, popups and scroll position stay);
 * member/group/profile changes re-render the page once nothing is open.
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
  await patchBoard(groupId, changes);
  if (fullRenderPending) scheduleRetry(groupId);
}

function scheduleRetry(groupId) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => refreshBoard(groupId), 1000);
}

/** Replace only the cards whose HTML changed; move cards between columns; update counts. */
async function patchBoard(groupId, changes) {
  const data = await loadBoardData(groupId);
  if (groupId !== currentGroupId) return;
  Object.assign(_boardContext, {
    groupId, members: data.members, group: data.group, tasks: data.tasks, viewIsAdmin: data.isAdmin,
    me: data.me, proofs: data.groupProofs, profileMap: data.profileMap,
  });

  const changedTaskIds = new Set(changes.filter((c) => c.collection === 'tasks').flatMap((c) => c.ids));
  const board = document.querySelector('.kanban-wrapper');
  if (!board) return;

  // Detach the existing card nodes, keyed by task id
  const existing = new Map();
  board.querySelectorAll('.task-card[data-task-id]').forEach((el) => existing.set(el.dataset.taskId, el));

  board.querySelectorAll('[data-status]').forEach((col) => {
    const status = col.dataset.status;
    const container = col.querySelector('.column-cards');
    if (!container) return;
    const list = tasksForStatus(data.tasks, status);

    const nodes = list.map((t) => {
      const before = cardHtmlCache.get(t.id);
      const html = cardHTML(t, data);
      let node = existing.get(t.id);
      if (!node || html !== before) {
        const tpl = document.createElement('template');
        tpl.innerHTML = html.trim();
        node = tpl.content.firstElementChild;
        // E4: a short highlight on cards someone else changed
        if (changedTaskIds.has(t.id)) node.classList.add('remote-updated');
      }
      existing.delete(t.id);
      return node;
    });

    // Keep nodes that didn't change (no flicker); only reorder/insert/remove
    container.querySelectorAll(':scope > :not(.task-card)').forEach((el) => el.remove());
    nodes.forEach((node, i) => {
      if (container.children[i] !== node) container.insertBefore(node, container.children[i] || null);
    });
    while (container.children.length > nodes.length) container.lastElementChild.remove();
    if (nodes.length === 0) container.innerHTML = emptyColumnHTML(status, data.isAdmin);

    const count = col.querySelector('.column-count');
    if (count) count.textContent = String(list.length);
  });

  // Column tab counts (narrow layout)
  document.querySelectorAll('.column-tab').forEach((tab) => {
    const count = tab.querySelector('.column-count');
    if (count) count.textContent = String(data.tasks.filter((t) => t.status === tab.dataset.status).length);
  });

  // Cards that no longer exist (deleted remotely)
  existing.forEach((el, id) => { el.remove(); cardHtmlCache.delete(id); });

  // Pending-approval badge in the header
  const headerRight = document.querySelector('.board-header-right');
  const badge = headerRight?.querySelector('.pulse-badge');
  const showBadge = data.isAdmin && data.pendingProofsCount > 0;
  if (badge && !showBadge) badge.remove();
  if (showBadge) {
    if (badge) badge.outerHTML = pendingBadgeHTML(data.pendingProofsCount);
    else headerRight?.insertAdjacentHTML('afterbegin', pendingBadgeHTML(data.pendingProofsCount));
  }
}
