import { describe, test, expect } from '@jest/globals';
import { dropBlockReason, canDragTask, dropAction, TASK_STATUSES } from '../src/features/tasks/taskPermissions.js';
import { hasCompletionEvent, EVENT_TYPES } from '../src/core/eventEngine.js';

const owner   = { id: 'g1_owner', uid: 'owner', role: 'owner' };
const coAdmin = { id: 'g1_co',    uid: 'co',    role: 'co-admin' };
const member  = { id: 'g1_mem',   uid: 'mem',   role: 'member' };
const other   = { id: 'g1_other', uid: 'other', role: 'member' };
const viewer  = { id: 'g1_view',  uid: 'view',  role: 'viewer' };

const task = (status, assignedTo = null) => ({ id: 't1', groupId: 'g1', status, assignedTo, weight: 100 });
const allowed = (t, me, s) => dropBlockReason(t, me, s) === null;

// ─── Members (D5) ────────────────────────────────────────────────────────────

describe('members', () => {
  test('can move their own card between To Do, In Progress and Pending Approval', () => {
    expect(allowed(task('todo', member.id), member, 'in-progress')).toBe(true);
    expect(allowed(task('in-progress', member.id), member, 'todo')).toBe(true);
    expect(allowed(task('in-progress', member.id), member, 'pending-approval')).toBe(true);
  });

  test('cannot drop into Completed', () => {
    expect(dropBlockReason(task('pending-approval', member.id), member, 'done').label).toBe('🔒 Admins approve');
    expect(allowed(task('in-progress', member.id), member, 'done')).toBe(false);
  });

  test("cannot move someone else's card, not even back to To Do", () => {
    expect(allowed(task('in-progress', other.id), member, 'todo')).toBe(false);
    expect(allowed(task('todo', other.id), member, 'in-progress')).toBe(false);
  });

  test('can take an unassigned To Do card only by dropping it into In Progress', () => {
    expect(allowed(task('todo'), member, 'in-progress')).toBe(true);
    expect(allowed(task('todo'), member, 'pending-approval')).toBe(false);
    expect(allowed(task('in-progress'), member, 'todo')).toBe(false);
  });

  test('cannot move their card while it awaits review, or once completed', () => {
    expect(allowed(task('pending-approval', member.id), member, 'in-progress')).toBe(false);
    expect(allowed(task('done', member.id), member, 'in-progress')).toBe(false);
  });
});

// ─── Admins (B4) ─────────────────────────────────────────────────────────────

describe('admins', () => {
  test("can move any card between the open columns", () => {
    expect(allowed(task('todo', member.id), owner, 'in-progress')).toBe(true);
    expect(allowed(task('in-progress', member.id), coAdmin, 'todo')).toBe(true);
  });

  test("can approve someone else's card from Pending Approval", () => {
    expect(allowed(task('pending-approval', member.id), owner, 'done')).toBe(true);
    expect(allowed(task('pending-approval', owner.id), coAdmin, 'done')).toBe(true);
  });

  test('cannot approve their own card', () => {
    expect(allowed(task('pending-approval', owner.id), owner, 'done')).toBe(false);
  });

  test('cannot approve a card that has not been submitted', () => {
    expect(allowed(task('in-progress', member.id), owner, 'done')).toBe(false);
  });
});

// ─── Viewers and draggability ────────────────────────────────────────────────

describe('canDragTask', () => {
  test('viewers can never drag', () => {
    expect(canDragTask(task('todo'), viewer)).toBe(false);
    expect(canDragTask(task('todo', viewer.id), viewer)).toBe(false);
    expect(canDragTask(task('todo'), undefined)).toBe(false);
  });

  test('admins can drag any card that is not Completed', () => {
    for (const s of ['todo', 'in-progress', 'pending-approval']) {
      expect(canDragTask(task(s, member.id), owner)).toBe(true);
    }
  });

  test('members can drag only cards they can actually move', () => {
    expect(canDragTask(task('todo', member.id), member)).toBe(true);
    expect(canDragTask(task('in-progress', member.id), member)).toBe(true);
    expect(canDragTask(task('todo'), member)).toBe(true);
    expect(canDragTask(task('pending-approval', member.id), member)).toBe(false);
    expect(canDragTask(task('done', member.id), member)).toBe(false);
    expect(canDragTask(task('todo', other.id), member)).toBe(false);
    expect(canDragTask(task('in-progress'), member)).toBe(false);
  });
});

// ─── Completed cards are locked (E1a) ────────────────────────────────────────

describe('Completed cards', () => {
  test('nobody can move a card out of Completed', () => {
    for (const who of [owner, coAdmin, member, other]) {
      for (const s of TASK_STATUSES.filter((x) => x !== 'done')) {
        expect(allowed(task('done', member.id), who, s)).toBe(false);
        expect(allowed(task('done', owner.id), who, s)).toBe(false);
      }
    }
  });

  test('the refusal explains the lock', () => {
    const r = dropBlockReason(task('done', member.id), owner, 'in-progress');
    expect(r.label).toBe('🔒 Completed');
    expect(r.message).toMatch(/locked/);
  });

  test('nobody can drag a Completed card, admins included', () => {
    for (const who of [owner, coAdmin, member, viewer]) {
      expect(canDragTask(task('done', member.id), who)).toBe(false);
    }
  });
});

describe('completion points are recorded once per task', () => {
  const ev = (eventType, taskId) => ({ eventType, metadata: { taskId } });

  test('detects an existing completion event for the task', () => {
    expect(hasCompletionEvent([ev(EVENT_TYPES.CARD_COMPLETE, 't1')], 't1')).toBe(true);
  });

  test('an overdue completion also counts as recorded', () => {
    expect(hasCompletionEvent([ev(EVENT_TYPES.CARD_COMPLETE_OVERDUE, 't1')], 't1')).toBe(true);
  });

  test('ignores other tasks and other event types', () => {
    const events = [ev(EVENT_TYPES.CARD_COMPLETE, 't2'), ev(EVENT_TYPES.COMMENT_POSTED, 't1')];
    expect(hasCompletionEvent(events, 't1')).toBe(false);
    expect(hasCompletionEvent([], 't1')).toBe(false);
    expect(hasCompletionEvent(undefined, 't1')).toBe(false);
  });
});

// ─── What a drop does (D5, E1b) ──────────────────────────────────────────────

describe('dropAction', () => {
  test('a member dropping into Pending Approval opens the Submit modal', () => {
    expect(dropAction(task('in-progress', member.id), member, 'pending-approval')).toBe('submit');
  });

  test("an admin dropping their own card into Pending Approval opens the Submit modal", () => {
    expect(dropAction(task('in-progress', owner.id), owner, 'pending-approval')).toBe('submit');
    expect(dropAction(task('todo', coAdmin.id), coAdmin, 'pending-approval')).toBe('submit');
  });

  test("an admin moving someone else's card into Pending Approval just moves it", () => {
    expect(dropAction(task('in-progress', member.id), owner, 'pending-approval')).toBe('move');
    expect(dropAction(task('in-progress'), owner, 'pending-approval')).toBe('move');
  });

  test('dropping into Completed always opens the review modal', () => {
    expect(dropAction(task('pending-approval', member.id), owner, 'done')).toBe('review');
  });

  test('other moves happen straight away', () => {
    expect(dropAction(task('todo', member.id), member, 'in-progress')).toBe('move');
    expect(dropAction(task('in-progress', owner.id), owner, 'todo')).toBe('move');
  });
});
