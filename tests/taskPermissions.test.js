import { describe, test, expect } from '@jest/globals';
import { dropBlockReason, canDragTask } from '../src/features/tasks/taskPermissions.js';

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

  test('admins can drag any card', () => {
    for (const s of ['todo', 'in-progress', 'pending-approval', 'done']) {
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
