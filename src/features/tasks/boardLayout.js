/**
 * boardLayout.js
 * Layout management for the Kanban board.
 *
 * Handles:
 *   - Column tab switching (narrow viewport)
 *   - Horizontal scroll-edge shadows
 *   - ResizeObserver for the kanban row
 *
 * No data access, no business logic, no rendering.
 */

import { writeBoardTab, showBoardTab, stepTab } from './boardTabs.js';

let rowObserver = null;

// ── Scroll-edge shadows ────────────────────────────────────────────────────────

/** Update left/right fade shadows when the kanban row scrolls. */
function updateRowEdges() {
  const area = document.getElementById('kanban-area');
  const row  = area?.querySelector('.kanban-wrapper');
  if (!row) return;
  const max = row.scrollWidth - row.clientWidth;
  area.classList.toggle('more-left',  max > 1 && row.scrollLeft > 1);
  area.classList.toggle('more-right', max > 1 && row.scrollLeft < max - 1);
}

// ── Tab switching ──────────────────────────────────────────────────────────────

/**
 * Switch the narrow layout to another column and persist the choice.
 *
 * @param {string}  groupId  Active group ID (used for storage key)
 * @param {string}  status   Target column status key
 * @param {object?} opts     Options forwarded to showBoardTab (e.g. { focus: true })
 */
export function selectBoardTab(groupId, status, opts) {
  const area = document.getElementById('kanban-area');
  if (!area || !groupId) return;
  writeBoardTab(groupId, status);
  showBoardTab(area, status, opts);
  area.querySelector('.kanban-wrapper')?.scrollTo?.({ top: 0 });
}

// ── Layout binding ─────────────────────────────────────────────────────────────

/**
 * Bind layout event listeners after a full board render.
 * Safe to call on every render — replaces the previous observer.
 *
 * @param {string}   groupId     Active group ID (passed through to tab switching)
 * @param {Function} onTabSelect Called with (status, opts?) when a tab is activated
 */
export function bindBoardLayout(groupId, onTabSelect) {
  const area = document.getElementById('kanban-area');
  if (!area) return;
  const row = area.querySelector('.kanban-wrapper');

  // Click a column tab
  area.querySelector('.column-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.column-tab');
    if (tab) onTabSelect(tab.dataset.status);
  });

  // Arrow-key navigation between column tabs (H2)
  area.querySelector('.column-tabs')?.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    onTabSelect(stepTab(area.dataset.activeTab, dir), { focus: true });
  });

  // H4: recompute shadows live while the window or row content changes size
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; updateRowEdges(); }); };
  row?.addEventListener('scroll', schedule, { passive: true });
  rowObserver?.disconnect();
  rowObserver = new ResizeObserver(schedule);
  if (row) {
    rowObserver.observe(row);
    const board = row.querySelector('.kanban-board');
    if (board) rowObserver.observe(board);
  }
  updateRowEdges();
}
