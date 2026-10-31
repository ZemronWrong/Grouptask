import { describe, test, expect, beforeAll } from '@jest/globals';

// addToSyncQueue wakes the sync engine with a window event; the tests run in Node.
globalThis.window = globalThis.window || { dispatchEvent: () => {}, addEventListener: () => {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const { openDB, getSyncQueue } = await import('../src/services/indexedDBService.js');
const { recordEvent, isCompletionRecorded, calculateBoardPoints, EVENT_TYPES } = await import('../src/core/eventEngine.js');

// E1a: the same guard handleReview and saveTask use before recording CARD_COMPLETE.
async function approve(boardId, taskId, userId, weight) {
  if (await isCompletionRecorded(boardId, taskId)) return false;
  await recordEvent({
    eventType: EVENT_TYPES.CARD_COMPLETE,
    userId, memberId: `${boardId}_${userId}`, boardId,
    boardPoints: weight, xpDelta: weight, repDelta: 5,
    metadata: { taskId, weight },
  });
  return true;
}

describe('approving the same task twice', () => {
  beforeAll(async () => { await openDB(); });

  test('awards the completion points only once', async () => {
    expect(await approve('g1', 't1', 'u1', 100)).toBe(true);
    expect(await approve('g1', 't1', 'u1', 100)).toBe(false);
    expect(await calculateBoardPoints('g1', 'u1')).toBe(100);
  });

  test('queues only one completion event for upload', async () => {
    const queued = (await getSyncQueue()).filter((e) => e.collection === 'events' && e.data.metadata?.taskId === 't1');
    expect(queued).toHaveLength(1);
  });

  test('other tasks on the board still earn points', async () => {
    expect(await approve('g1', 't2', 'u1', 50)).toBe(true);
    expect(await calculateBoardPoints('g1', 'u1')).toBe(150);
  });

  test('the same task id on another board is separate', async () => {
    expect(await approve('g2', 't1', 'u1', 30)).toBe(true);
    expect(await calculateBoardPoints('g2', 'u1')).toBe(30);
  });
});
