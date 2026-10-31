/**
 * taskPermissions — Who may move which card where on the Kanban board.
 *
 * Pure functions (no DOM, no IndexedDB) shared by TaskCard (is the card
 * draggable?), dragDrop (which columns light up) and moveTask (is the drop
 * accepted?). They mirror the `tasks` update rule in firestore.rules, so a
 * move refused here would also be refused by Firestore.
 */

export const TASK_STATUSES = ['todo', 'in-progress', 'pending-approval', 'done'];

export function isAdminMember(me) {
  return me?.role === 'owner' || me?.role === 'co-admin';
}

/**
 * Why `me` may not drop `task` into `status`.
 * Returns null when the drop is allowed (or is a no-op into the same column),
 * otherwise `{ label, message }`: a short column label shown while dragging
 * and the toast text shown if the drop is attempted anyway.
 */
export function dropBlockReason(task, me, status) {
  if (!task || task.status === status) return null;

  if (!me || me.role === 'viewer') {
    return { label: '🔒 View only', message: "Viewers can't move tasks." };
  }

  // E1a: approval is final. Moving a card out of Completed and approving it
  // again would award its points twice, so nobody can move it.
  if (task.status === 'done') {
    return { label: '🔒 Completed', message: 'Completed tasks are locked. Ask the owner if one was approved by mistake.' };
  }

  if (isAdminMember(me)) {
    if (status !== 'done') return null;
    // B4: an admin never approves their own task
    if (task.assignedTo === me.id) {
      return { label: '🔒 Another admin approves', message: 'Admins cannot approve their own tasks. Another admin must approve this.' };
    }
    if (task.status !== 'pending-approval') {
      return { label: '🔒 Submit first', message: 'Only tasks in Pending Approval can be approved.' };
    }
    return null;
  }

  // ── Members ──
  if (status === 'done') {
    return { label: '🔒 Admins approve', message: 'Only an admin can approve tasks. Submit it for approval instead.' };
  }
  const isMine = !!task.assignedTo && task.assignedTo === me.id;
  if (isMine) {
    if (task.status === 'pending-approval') {
      return { label: '🔒 Awaiting review', message: 'This task is waiting for review.' };
    }
    return null;
  }

  // Dragging an unassigned To Do card into In Progress = accepting it
  if (!task.assignedTo && task.status === 'todo') {
    return status === 'in-progress'
      ? null
      : { label: '🔒', message: 'Drag an unassigned task to In Progress to take it.' };
  }
  return { label: '🔒', message: 'You can only move your own tasks.' };
}

/** True if `me` can drop `task` into at least one other column. */
export function canDragTask(task, me) {
  return TASK_STATUSES.some((s) => s !== task?.status && !dropBlockReason(task, me, s));
}

/**
 * What an allowed drop does (call dropBlockReason first):
 *   'review' — into Completed: open REVIEW APPROVAL, so approval goes through handleReview.
 *   'submit' — into Pending Approval by a member, or by an admin with their own
 *              card: open the SUBMIT modal so there is a submission to review (E1b).
 *   'move'   — anything else: move the card straight away.
 */
export function dropAction(task, me, status) {
  if (status === 'done') return 'review';
  if (status === 'pending-approval' && (!isAdminMember(me) || task?.assignedTo === me?.id)) return 'submit';
  return 'move';
}
