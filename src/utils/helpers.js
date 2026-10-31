export { formatDate, formatRelative, todayDateString, formatTimeAgo } from './formatters.js';
export { clamp, isValidEmail, isValidPassword, isValidInviteCode, isNonEmptyString } from './validators.js';

export function generateId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

export function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// Scrollable areas whose position is kept when a screen re-renders (E3).
const SCROLL_AREAS = ['.main-content', '.kanban-wrapper', '.kanban-board', '.column-cards', '.completed-panel', '.leaderboard-container'];

/** Remember the page and panel scroll positions before a re-render. */
export function captureScroll() {
  return {
    x: window.scrollX,
    y: window.scrollY,
    areas: SCROLL_AREAS.map((sel) => [...document.querySelectorAll(sel)].map((el) => [el.scrollLeft, el.scrollTop])),
  };
}

/** Put the scroll positions from captureScroll() back after a re-render. */
export function restoreScroll(state) {
  if (!state) return;
  SCROLL_AREAS.forEach((sel, i) => {
    document.querySelectorAll(sel).forEach((el, j) => {
      const pos = state.areas[i]?.[j];
      if (pos) { el.scrollLeft = pos[0]; el.scrollTop = pos[1]; }
    });
  });
  window.scrollTo(state.x, state.y);
}
