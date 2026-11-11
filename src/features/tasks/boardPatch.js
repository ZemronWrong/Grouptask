/**
 * boardPatch.js
 * Card-level DOM patching for real-time remote Firestore changes.
 *
 * Avoids full page re-renders by diffing the current board DOM against
 * freshly-loaded data, only touching the cards and counts that changed.
 * Open modals, scroll position, and keyboard focus are preserved.
 */

import { loadBoardData } from './boardData.js';
import { tasksForStatus, emptyColumnHTML, pendingBadgeHTML, cardHTML } from './boardRenderer.js';

// ── Busy detection ─────────────────────────────────────────────────────────────

/**
 * Returns true when a modal, confirmation dialog, drag, or tour is active.
 * A full re-render is deferred until the board is idle.
 * @returns {boolean}
 */
export function isBusy() {
  return !!document.querySelector(
    '.modal-overlay:not([hidden]), #task-detail-modal, #member-popup-overlay, .confirm-overlay, .task-card.dragging, .tour-overlay'
  );
}

// ── Card-level DOM patch ───────────────────────────────────────────────────────

/**
 * Replace only the cards whose HTML changed; move cards between columns;
 * update column counts and the pending-approval badge.
 *
 * @param {string}   groupId      Active group ID
 * @param {Array}    changes      Change descriptors: [{ collection, ids }]
 * @param {object}   boardContext Mutable context object owned by TaskBoard (modified in place)
 * @param {Map}      cardHtmlCache Per-card HTML string cache (modified in place)
 */
export async function patchBoard(groupId, changes, boardContext, cardHtmlCache) {
  const data = await loadBoardData(groupId);

  // Abort if the user navigated away while we were loading
  if (groupId !== boardContext.groupId) return;

  // Update the shared context so delegated handlers see fresh data immediately
  Object.assign(boardContext, {
    groupId,
    members:     data.members,
    group:       data.group,
    tasks:       data.tasks,
    viewIsAdmin: data.isAdmin,
    me:          data.me,
    proofs:      data.groupProofs,
    profileMap:  data.profileMap,
  });

  const changedTaskIds = new Set(
    changes.filter((c) => c.collection === 'tasks').flatMap((c) => c.ids)
  );
  const board = document.querySelector('.kanban-wrapper');
  if (!board) return;

  // Snapshot the current card elements, keyed by task id
  const existing = new Map();
  board.querySelectorAll('.task-card[data-task-id]').forEach((el) => existing.set(el.dataset.taskId, el));

  board.querySelectorAll('[data-status]').forEach((col) => {
    const status    = col.dataset.status;
    const container = col.querySelector('.column-cards');
    if (!container) return;

    const list  = tasksForStatus(data.tasks, status);
    const nodes = list.map((t) => {
      const before = cardHtmlCache.get(t.id);
      const html   = cardHTML(t, data, cardHtmlCache);
      let   node   = existing.get(t.id);

      if (!node || html !== before) {
        const tpl = document.createElement('template');
        tpl.innerHTML = html.trim();
        node = tpl.content.firstElementChild;
        // E4: brief highlight on cards that a teammate just changed
        if (changedTaskIds.has(t.id)) node.classList.add('remote-updated');
      }
      existing.delete(t.id);
      return node;
    });

    // Keep unchanged nodes in-place (no flicker); only reorder / insert / remove
    container.querySelectorAll(':scope > :not(.task-card)').forEach((el) => el.remove());
    nodes.forEach((node, i) => {
      if (container.children[i] !== node) container.insertBefore(node, container.children[i] || null);
    });
    while (container.children.length > nodes.length) container.lastElementChild.remove();
    if (nodes.length === 0) container.innerHTML = emptyColumnHTML(status, data.isAdmin);

    const count = col.querySelector('.column-count');
    if (count) count.textContent = String(list.length);
  });

  // Update narrow-layout column tab counts
  document.querySelectorAll('.column-tab').forEach((tab) => {
    const count = tab.querySelector('.column-count');
    if (count) count.textContent = String(data.tasks.filter((t) => t.status === tab.dataset.status).length);
  });

  // Remove card elements for tasks deleted remotely
  existing.forEach((el, id) => { el.remove(); cardHtmlCache.delete(id); });

  // Update the pending-approval badge in the board header
  const headerRight = document.querySelector('.board-header-right');
  const badge       = headerRight?.querySelector('.pulse-badge');
  const showBadge   = data.isAdmin && data.pendingProofsCount > 0;
  if (badge && !showBadge) badge.remove();
  if (showBadge) {
    if (badge) badge.outerHTML = pendingBadgeHTML(data.pendingProofsCount);
    else headerRight?.insertAdjacentHTML('afterbegin', pendingBadgeHTML(data.pendingProofsCount));
  }

  // Update the join requests banner in the board header
  const joinBadge     = headerRight?.querySelector('.join-requests-badge');
  const joinCount     = data.pendingJoinRequestsCount ?? 0;
  const showJoinBadge = data.isAdmin && joinCount > 0;
  if (joinBadge && !showJoinBadge) joinBadge.remove();
  if (showJoinBadge) {
    const jHtml = `<button class="pulse-badge join-requests-badge" id="btn-join-requests-badge" title="Review join requests" style="cursor:pointer;border:none;background:var(--warning);color:#fff;">📬 ${joinCount} join request${joinCount > 1 ? 's' : ''}</button>`;
    if (joinBadge) joinBadge.outerHTML = jHtml;
    else headerRight?.insertAdjacentHTML('afterbegin', jHtml);
  }
  // Click the badge → open Share modal on the Requests tab
  document.getElementById('btn-join-requests-badge')?.addEventListener('click', () => {
    document.getElementById('btn-share-btn')?.click();
    setTimeout(() => document.querySelector('.share-tab-btn[data-tab="requests"]')?.click(), 50);
  });
}
