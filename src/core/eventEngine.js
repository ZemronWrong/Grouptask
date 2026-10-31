/**
 * Event Engine
 *
 * Single point of entry for all gamification and reputation events.
 * Writes a unified event record to IndexedDB that serves as the source of truth
 * for Board Points (BP), Global XP, and Reputation.
 */

import { STORES, add, addToSyncQueue, getAllByIndex, getAll } from '../services/indexedDBService.js';
import { generateId } from '../utils/helpers.js';
import { countsTowardReputation } from './reputationEngine.js';

/**
 * Valid event types that can be recorded.
 */
export const EVENT_TYPES = {
  CARD_COMPLETE:           'card_complete',
  CARD_COMPLETE_OVERDUE:   'card_complete_overdue',
  COMMENT_POSTED:          'comment_posted',
  STREAK_DAY:              'streak_day',
  FREELOADER_FLAGGED:      'freeloaded_flagged',
  APPEAL_ACCEPTED:         'appeal_accepted',
};

/**
 * Records a gamification event.
 *
 * @param {object} params
 * @param {string} params.eventType - One of EVENT_TYPES
 * @param {string} params.userId - Global user ID
 * @param {string} [params.memberId] - Board-specific member ID (if applicable)
 * @param {string} [params.boardId] - Board ID (null for global events like streak)
 * @param {number} [params.boardPoints=0] - Points added to the board leaderboard
 * @param {number} [params.xpDelta=0] - XP added to the global profile
 * @param {number} [params.repDelta=0] - Reputation delta
 * @param {object} [params.metadata={}] - Contextual info (e.g., taskId, taskWeight)
 */
export async function recordEvent({
  eventType,
  userId,
  memberId = null,
  boardId = null,
  boardPoints = 0,
  xpDelta = 0,
  repDelta = 0,
  metadata = {},
}) {
  const eventRecord = {
    id: generateId(),
    userId,
    memberId,
    boardId,
    eventType,
    boardPoints,
    xpDelta,
    repDelta,
    metadata,
    createdAt: Date.now(),
  };

  await add(STORES.EVENTS, eventRecord);
  await addToSyncQueue({
    collection: 'events',
    docId: eventRecord.id,
    operation: 'add',
    data: eventRecord
  });

  return eventRecord;
}

/**
 * True if `events` already holds a completion event (on time or overdue) for
 * `taskId`. The ledger is append-only, so a task must only ever earn its
 * completion points once (E1a).
 */
export function hasCompletionEvent(events, taskId) {
  return (events || []).some((e) =>
    (e.eventType === EVENT_TYPES.CARD_COMPLETE || e.eventType === EVENT_TYPES.CARD_COMPLETE_OVERDUE) &&
    e.metadata?.taskId === taskId
  );
}

/** True if the task's completion has already been recorded on this board. */
export async function isCompletionRecorded(boardId, taskId) {
  return hasCompletionEvent(await getBoardEvents(boardId), taskId);
}

/**
 * Gets all gamification events for a user across all boards.
 */
export async function getUserEvents(userId) {
  const allEvents = await getAll(STORES.EVENTS);
  return allEvents.filter(e => e.userId === userId);
}

/**
 * Gets all gamification events for a specific board.
 */
export async function getBoardEvents(boardId) {
  return await getAllByIndex(STORES.EVENTS, 'boardId', boardId);
}

/**
 * Computes a user's total Board Points for a specific board.
 */
export async function calculateBoardPoints(boardId, userId) {
  const events = await getBoardEvents(boardId);
  const eventPts = events
    .filter(e => e.userId === userId)
    .reduce((sum, e) => sum + (e.boardPoints || 0), 0);

  // Include legacy tasks (tasks marked 'done' that have no corresponding EVENT)
  const allTasks = await getAllByIndex(STORES.TASKS, 'groupId', boardId);
  const allMembers = await getAllByIndex(STORES.MEMBERS, 'groupId', boardId);
  const member = allMembers.find(m => m.uid === userId);
  
  if (!member) return eventPts;

  const legacyPts = allTasks
    .filter(t => t.assignedTo === member.id && t.status === 'done' && !events.some(e => e.metadata?.taskId === t.id))
    .reduce((sum, t) => sum + (Number(t.weight) || 0), 0); // 1:1 scaling for legacy to match new rules

  return eventPts + legacyPts;
}

/**
 * Computes a user's total Global XP across all boards.
 */
export async function calculateGlobalXP(userId) {
  const events = await getUserEvents(userId);
  const eventXP = events.reduce((sum, e) => sum + (e.xpDelta || 0), 0);

  const allTasks = await getAll(STORES.TASKS);
  const allMembers = await getAll(STORES.MEMBERS);
  const userMemberIds = allMembers.filter(m => m.uid === userId).map(m => m.id);

  const legacyXP = allTasks
    .filter(t => userMemberIds.includes(t.assignedTo) && t.status === 'done' && !events.some(e => e.metadata?.taskId === t.id))
    .reduce((sum, t) => sum + (Number(t.weight) || 0), 0);

  return eventXP + legacyXP;
}

/**
 * Computes a user's total global Reputation.
 */
export async function calculateTotalReputation(userId) {
  const events = await getUserEvents(userId);
  return events
    .filter(countsTowardReputation)
    .reduce((sum, e) => sum + (e.repDelta || 0), 0);
}
