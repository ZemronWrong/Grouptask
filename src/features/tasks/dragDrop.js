/**
 * Lightweight drag-and-drop for kanban columns.
 * Uses the HTML5 Drag & Drop API — no library dependencies.
 * Uses AbortController to ensure listeners are never double-stacked.
 */

let draggedCard = null;
let _abortController = null;

export function initDragDrop(onDrop) {
  // Remove any previous listeners before adding new ones
  if (_abortController) {
    _abortController.abort();
  }
  _abortController = new AbortController();
  const signal = _abortController.signal;

  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.task-card');
    if (!card) return;
    draggedCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.taskId);
  }, { signal });

  document.addEventListener('dragend', (e) => {
    const card = e.target.closest('.task-card');
    if (card) card.classList.remove('dragging');
    draggedCard = null;
    document.querySelectorAll('.kanban-column.drag-over').forEach((col) =>
      col.classList.remove('drag-over')
    );
  }, { signal });

  document.addEventListener('dragover', (e) => {
    const col = e.target.closest('.kanban-column');
    if (!col || !draggedCard) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('drag-over');
  }, { signal });

  document.addEventListener('dragleave', (e) => {
    const col = e.target.closest('.kanban-column');
    if (col) col.classList.remove('drag-over');
  }, { signal });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const col = e.target.closest('.kanban-column');
    if (!col || !draggedCard) return;
    col.classList.remove('drag-over');
    const taskId    = draggedCard.dataset.taskId;
    const newStatus = col.dataset.status;
    if (typeof onDrop === 'function') onDrop(taskId, newStatus);
  }, { signal });
}
