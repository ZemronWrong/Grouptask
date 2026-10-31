/**
 * Lightweight drag-and-drop for kanban columns.
 * Uses the HTML5 Drag & Drop API — no library dependencies.
 * Uses AbortController to ensure listeners are never double-stacked.
 *
 * Drop targets are the kanban columns and the Completed side panel, each
 * carrying `data-status`. While a card is dragged, targets this user may drop
 * into get `.drop-allowed`; the rest get `.drop-blocked` plus a short label.
 */

const DROP_TARGETS = '.kanban-column, .completed-panel';

let draggedCard = null;
let _abortController = null;

/**
 * @param {function} onDrop         - (taskId, newStatus) => void
 * @param {function} getBlockReason - (taskId, status) => null | { label, message }
 */
export function initDragDrop(onDrop, getBlockReason = () => null) {
  // Remove any previous listeners before adding new ones
  if (_abortController) {
    _abortController.abort();
  }
  _abortController = new AbortController();
  const signal = _abortController.signal;

  const clearDragState = () => {
    document.querySelector('.kanban-wrapper')?.classList.remove('is-dragging');
    document.querySelectorAll(DROP_TARGETS).forEach((col) => {
      col.classList.remove('drag-over', 'drop-allowed', 'drop-blocked');
      delete col.dataset.dropLabel;
    });
  };

  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.task-card[draggable="true"]');
    if (!card) return;
    draggedCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.taskId);

    // Show where this card can and can't go
    const sourceStatus = card.closest(DROP_TARGETS)?.dataset.status;
    document.querySelector('.kanban-wrapper')?.classList.add('is-dragging');
    document.querySelectorAll(DROP_TARGETS).forEach((col) => {
      if (col.dataset.status === sourceStatus) return;
      const blocked = getBlockReason(card.dataset.taskId, col.dataset.status);
      col.classList.add(blocked ? 'drop-blocked' : 'drop-allowed');
      if (blocked?.label) col.dataset.dropLabel = blocked.label;
    });
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
    const col = e.target.closest?.(DROP_TARGETS);
    if (!col || !draggedCard || !col.classList.contains('drop-allowed')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('drag-over');
  }, { signal });

  document.addEventListener('dragleave', (e) => {
    const col = e.target.closest?.(DROP_TARGETS);
    if (col) col.classList.remove('drag-over');
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
