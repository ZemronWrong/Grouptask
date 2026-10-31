import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// addToSyncQueue wakes the sync engine with a window event; the tests run in Node.
globalThis.window = globalThis.window || { dispatchEvent: () => {}, addEventListener: () => {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const {
  openDB, addToSyncQueue, getSyncQueue, clearSyncQueue,
  removeSyncQueueItemIfUnchanged, planSyncQueueEntry,
} = await import('../src/services/indexedDBService.js');
const { badgeDocId } = await import('../src/core/badgeEngine.js');

// E3: entries for the same document are merged, so a page load or a burst of
// edits doesn't upload (and fire snapshots on everyone's screen) repeatedly.

describe('planSyncQueueEntry', () => {
  const q = (id, collection, docId, operation, data, rev = 0) => ({ id, collection, docId, operation, data, rev });

  test('a new document is appended', () => {
    const { record, removeIds } = planSyncQueueEntry([q(1, 'tasks', 'a', 'update', {})], { collection: 'tasks', docId: 'b', operation: 'update', data: { x: 1 } }, 5);
    expect(record.id).toBeUndefined();
    expect(record).toMatchObject({ docId: 'b', timestamp: 5, rev: 0 });
    expect(removeIds).toEqual([]);
  });

  test('the same document merges into the earliest slot, latest fields winning', () => {
    const queued = [
      q(1, 'tasks', 'a', 'update', { status: 'todo', title: 'T' }),
      q(2, 'members', 'm', 'add', {}),
      q(3, 'tasks', 'a', 'update', { status: 'in-progress' }, 1),
    ];
    const { record, removeIds } = planSyncQueueEntry(queued, { collection: 'tasks', docId: 'a', operation: 'update', data: { status: 'pending-approval' } });
    expect(record.id).toBe(1);
    expect(record.data).toEqual({ status: 'pending-approval', title: 'T' });
    expect(record.rev).toBe(2);
    expect(removeIds).toEqual([3]);
  });

  test("a pending 'add' stays an 'add'", () => {
    const { record } = planSyncQueueEntry([q(1, 'tasks', 'a', 'add', { title: 'T' })], { collection: 'tasks', docId: 'a', operation: 'update', data: { title: 'U' } });
    expect(record.operation).toBe('add');
  });

  test('deletes are never merged', () => {
    const del = planSyncQueueEntry([q(1, 'tasks', 'a', 'update', {})], { collection: 'tasks', docId: 'a', operation: 'delete', data: {} });
    expect(del.record.id).toBeUndefined();
    const afterDel = planSyncQueueEntry([q(1, 'tasks', 'a', 'delete', {})], { collection: 'tasks', docId: 'a', operation: 'add', data: {} });
    expect(afterDel.record.id).toBeUndefined();
  });

  test('same id in another collection is a different document', () => {
    const { record } = planSyncQueueEntry([q(1, 'tasks', 'a', 'update', {})], { collection: 'comments', docId: 'a', operation: 'update', data: {} });
    expect(record.id).toBeUndefined();
  });
});

describe('addToSyncQueue (IndexedDB)', () => {
  beforeAll(async () => { await openDB(); });
  beforeEach(async () => { await clearSyncQueue(); });

  test('repeated edits to one document leave one queue entry', async () => {
    for (const status of ['todo', 'in-progress', 'pending-approval']) {
      await addToSyncQueue({ collection: 'tasks', docId: 't1', operation: 'update', data: { id: 't1', status } });
    }
    await addToSyncQueue({ collection: 'tasks', docId: 't2', operation: 'update', data: { id: 't2' } });
    const queue = await getSyncQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].docId).toBe('t1');
    expect(queue[0].data.status).toBe('pending-approval');
  });

  test('an upload finishing does not drop edits merged in while it was in flight', async () => {
    await addToSyncQueue({ collection: 'tasks', docId: 't1', operation: 'update', data: { status: 'todo' } });
    const [uploading] = await getSyncQueue();             // flushQueue starts uploading this
    await addToSyncQueue({ collection: 'tasks', docId: 't1', operation: 'update', data: { status: 'in-progress' } });
    expect(await removeSyncQueueItemIfUnchanged(uploading)).toBe(false);
    const queue = await getSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].data.status).toBe('in-progress');      // goes up on the next flush
    expect(await removeSyncQueueItemIfUnchanged(queue[0])).toBe(true);
    expect(await getSyncQueue()).toHaveLength(0);
  });
});

describe('badge documents', () => {
  test('one document per user and badge, whichever device awards it', () => {
    expect(badgeDocId('u1', 'first_task')).toBe('u1_first_task');
    expect(badgeDocId('u1', 'first_task')).toBe(badgeDocId('u1', 'first_task'));
  });
});
