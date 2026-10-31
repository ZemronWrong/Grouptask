/**
 * Lightweight drag-and-drop for kanban columns.
 * Uses the HTML5 Drag & Drop API — no library dependencies.
 * Uses AbortController to ensure listeners are never double-stacked.
 *
 * Drop targets are the kanban columns, the Completed side panel and (in the
 * narrow layout) the column tabs, each carrying `data-status`. While a card is
 * dragged, targets this user may drop into get `.drop-allowed`; the rest get
 * `.drop-blocked` plus a short label.
 *
 * H3: while dragging near an edge, the board row scrolls sideways and the
 * column (or page) under the pointer scrolls up/down, faster closer to the edge.
 * Holding a card over a column tab for a moment switches to that column.
 */

const DROP_TARGETS = '.kanban-column, .completed-panel, .column-tab';

export const EDGE_ZONE_PX = 60;
export const MAX_SCROLL_STEP_PX = 22;
export const TAB_HOVER_MS = 400;

/**
 * Auto-scroll step for a pointer `distance` px inside an edge: 0 outside the
 * zone, rising to `max` at the edge itself (eased, so it starts gently).
 */
export function edgeScrollStep(distance, zone = EDGE_ZONE_PX, max = MAX_SCROLL_STEP_PX) {
  if (!(distance < zone)) return 0;
  const t = 1 - Math.max(distance, 0) / zone;
  return Math.max(1, Math.round(max * t * t));
}

/** Signed scroll step along one axis for `pos` inside [start, end]. */
export function axisScrollStep(pos, start, end, zone = EDGE_ZONE_PX, max = MAX_SCROLL_STEP_PX) {
  const room = end - start;
  if (room <= 0) return 0;
  const z = Math.min(zone, room / 3);   // small boxes get a smaller edge zone
  const back = edgeScrollStep(pos - start, z, max);
  const fwd = edgeScrollStep(end - pos, z, max);
  return fwd - back;
}

let draggedCard = null;
let _abortController = null;

function canScroll(el, axis) {
  if (!el) return false;
  const style = getComputedStyle(el);
  const overflow = axis === 'x' ? style.overflowX : style.overflowY;
  if (!/(auto|scroll)/.test(overflow)) return false;
  return axis === 'x' ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight;
}

/**
 * @param {function} onDrop         - (taskId, newStatus) => void
 * @param {function} getBlockReason - (taskId, status) => null | { label, message }
 * @param {object}   [options]
 * @param {function} [options.onTabHover] - (status) => void, a card is held over a column tab
 */
export function initDragDrop(onDrop, getBlockReason = () => null, { onTabHover } = {}) {
  // Remove any previous listeners before adding new ones
  if (_abortController) {
    _abortController.abort();
  }
  _abortController = new AbortController();
  const signal = _abortController.signal;

  const pointer = { x: 0, y: 0, known: false };
  let scrollFrame = 0;
  let hoverTab = null;
  let hoverTimer = null;

  const stopAutoScroll = () => {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    pointer.known = false;
  };

  const clearTabHover = () => {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverTab = null;
  };

  const clearDragState = () => {
    stopAutoScroll();
    clearTabHover();
    document.querySelector('.kanban-area')?.classList.remove('is-dragging');
    document.querySelectorAll(DROP_TARGETS).forEach((col) => {
      col.classList.remove('drag-over', 'drop-allowed', 'drop-blocked');
      delete col.dataset.dropLabel;
    });
  };

  /** Mark every target as allowed/blocked for the card being dragged. */
  const markTargets = (card) => {
    const sourceStatus = card.closest('.kanban-column, .completed-panel')?.dataset.status;
    document.querySelectorAll(DROP_TARGETS).forEach((col) => {
      col.classList.remove('drop-allowed', 'drop-blocked');
      delete col.dataset.dropLabel;
      if (col.dataset.status === sourceStatus) return;
      const blocked = getBlockReason(card.dataset.taskId, col.dataset.status);
      col.classList.add(blocked ? 'drop-blocked' : 'drop-allowed');
      if (blocked?.label) col.dataset.dropLabel = blocked.label;
    });
  };

  // One frame of auto-scroll, repeated while the pointer stays near an edge
  const autoScroll = () => {
    scrollFrame = 0;
    if (!draggedCard || !pointer.known) return;
    let moved = false;

    // Sideways: the board row (medium layout)
    const row = document.querySelector('.kanban-wrapper');
    if (canScroll(row, 'x')) {
      const r = row.getBoundingClientRect();
      if (pointer.y >= r.top && pointer.y <= r.bottom) {
        const dx = axisScrollStep(pointer.x, r.left, r.right);
        if (dx) { row.scrollLeft += dx; moved = true; }
      }
    }

    // Up/down: the column under the pointer, else the page
    const under = document.elementFromPoint(pointer.x, pointer.y);
    const list = under?.closest('.column-cards');
    if (canScroll(list, 'y')) {
      const r = list.getBoundingClientRect();
      const dy = axisScrollStep(pointer.y, r.top, r.bottom);
      if (dy) { list.scrollTop += dy; moved = true; }
    }
    if (!moved) {
      const dy = axisScrollStep(pointer.y, 0, window.innerHeight);
      const page = document.scrollingElement;
      if (dy && page && page.scrollHeight > window.innerHeight) {
        window.scrollBy(0, dy);
        moved = true;
      }
    }
    if (moved) scrollFrame = requestAnimationFrame(autoScroll);
  };

  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.task-card[draggable="true"]');
    if (!card) return;
    draggedCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.taskId);

    // Show where this card can and can't go
    document.querySelector('.kanban-area')?.classList.add('is-dragging');
    markTargets(card);
  }, { signal });

  document.addEventListener('dragend', (e) => {
    const card = draggedCard;
    draggedCard = null;
    if (card) card.classList.remove('dragging');

    // Released over a blocked target: let onDrop refuse it so the user sees why.
    if (card && e.dataTransfer?.dropEffect === 'none') {
      const col = document.elementFromPoint(e.clientX, e.clientY)?.closest(DROP_TARGETS);
      if (col?.classList.contains('drop-blocked') && typeof onDrop === 'function') {
        onDrop(card.dataset.taskId, col.dataset.status);
      }
    }
    clearDragState();
  }, { signal });

  document.addEventListener('dragover', (e) => {
    if (!draggedCard) return;

    // Track the pointer for auto-scroll (dragover keeps firing while the pointer rests)
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.known = true;
    if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);

    // Hold over a column tab to open that column
    const tab = e.target.closest?.('.column-tab');
    if (tab !== hoverTab) {
      clearTabHover();
      if (tab && !tab.classList.contains('active') && typeof onTabHover === 'function') {
        hoverTab = tab;
        hoverTimer = setTimeout(() => {
          hoverTimer = null;
          if (draggedCard && hoverTab === tab) onTabHover(tab.dataset.status);
        }, TAB_HOVER_MS);
      }
    }

    const col = e.target.closest?.(DROP_TARGETS);
    if (!col || !col.classList.contains('drop-allowed')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('drag-over');
  }, { signal });

  document.addEventListener('dragleave', (e) => {
    const col = e.target.closest?.(DROP_TARGETS);
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  }, { signal });

  document.addEventListener('drop', (e) => {
    const col = e.target.closest?.(DROP_TARGETS);
    if (!col || !draggedCard || !col.classList.contains('drop-allowed')) return;
    e.preventDefault();
    col.classList.remove('drag-over');
    const taskId    = draggedCard.dataset.taskId;
    const newStatus = col.dataset.status;
    if (typeof onDrop === 'function') onDrop(taskId, newStatus);
  }, { signal });
}
