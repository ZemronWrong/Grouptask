/**
 * boardTabs — the column tabs of the narrow board layout (H1).
 *
 * Below ~600 px of board width one column shows at a time and a row of tabs
 * picks which. The chosen tab is remembered per board for this browser
 * session (sessionStorage when available, otherwise in memory).
 */

export const TAB_STATUSES = ['todo', 'in-progress', 'pending-approval', 'done'];
const KEY_PREFIX = 'grouptask_board_tab_';

const memory = new Map();

function defaultStorage() {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

/** The remembered tab for a board, or 'todo'. */
export function readBoardTab(groupId, storage = defaultStorage()) {
  let value = memory.get(groupId);
  try { value = storage?.getItem(KEY_PREFIX + groupId) ?? value; } catch { /* blocked: memory only */ }
  return TAB_STATUSES.includes(value) ? value : 'todo';
}

export function writeBoardTab(groupId, status, storage = defaultStorage()) {
  if (!TAB_STATUSES.includes(status)) return;
  memory.set(groupId, status);
  try { storage?.setItem(KEY_PREFIX + groupId, status); } catch { /* memory only */ }
}

/** The tab after/before `status` (arrow keys), wrapping around. */
export function stepTab(status, dir) {
  const i = TAB_STATUSES.indexOf(status);
  const n = TAB_STATUSES.length;
  return TAB_STATUSES[((i < 0 ? 0 : i) + dir + n) % n];
}

/** Show `status` as the active column tab inside `area` (the .kanban-area element). */
export function showBoardTab(area, status, { focus = false } = {}) {
  if (!area || !TAB_STATUSES.includes(status)) return;
  area.dataset.activeTab = status;
  area.querySelectorAll('.column-tab').forEach((tab) => {
    const on = tab.dataset.status === status;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  });
}
