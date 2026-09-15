/**
 * Activity Log Service — Records and retrieves per-group activity events.
 * Powers the Pulse dashboard widget and Activity History page.
 *
 * Event types:
 *   task_created     — a new task was added
 *   task_moved       — task status changed (todo → in_progress → done)
 *   task_completed   — task was marked done
 *   task_deleted     — task was removed
 *   member_joined    — a new member joined the group
 *   member_removed   — a member was kicked
 *   comment_added    — a comment was posted on a task
 *   group_created    — group was first created
 */

import { STORES, add, getAllByIndex } from './indexedDBService.js';
import { generateId } from '../utils/helpers.js';

/**
 * Log a new activity event.
 * @param {object} params
 * @param {string} params.groupId
 * @param {string} params.type        — one of the event types above
 * @param {string} params.actorId     — memberId of who triggered the action
 * @param {string} params.actorName   — display name of actor
 * @param {string} params.description — human-readable description
 * @param {object} [params.meta]      — extra data (taskId, taskTitle, etc.)
 */
export async function logActivity({ groupId, type, actorId, actorName, description, meta = {} }) {
  try {
    const event = {
      id:          generateId(),
      groupId,
      type,
      actorId,
      actorName,
      description,
      meta,
      createdAt:   Date.now(),
    };
    await add(STORES.ACTIVITY_LOG, event);
    return event;
  } catch (err) {
    // Activity logging should never crash the app
    console.warn('[ActivityLog] Failed to log event:', err);
  }
}

/**
 * Get activity events for a group, newest first.
 * @param {string} groupId
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
export async function getGroupActivity(groupId, limit = 50) {
  const events = await getAllByIndex(STORES.ACTIVITY_LOG, 'groupId', groupId);
  return events
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Get activity in the last N days for pulse calculation.
 * @param {string} groupId
 * @param {number} [days=7]
 * @returns {Promise<Array>}
 */
export async function getRecentActivity(groupId, days = 7) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const events = await getAllByIndex(STORES.ACTIVITY_LOG, 'groupId', groupId);
  return events
    .filter(e => e.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Build a daily activity count array for sparkline/bar charts.
 * Returns an array of 7 numbers (oldest → newest).
 * @param {Array} events
 * @returns {number[]}
 */
export function buildDailyActivityCounts(events) {
  const days = 7;
  const counts = new Array(days).fill(0);
  const now = Date.now();
  for (const e of events) {
    const daysAgo = Math.floor((now - e.createdAt) / (24 * 60 * 60 * 1000));
    if (daysAgo < days) {
      counts[days - 1 - daysAgo]++;
    }
  }
  return counts;
}

/** Icon map for each event type */
export const ACTIVITY_ICONS = {
  task_created:   'plus-circle',
  task_assigned:  'user-check',
  task_moved:     'move-right',
  task_completed: 'check-circle',
  task_deleted:   'trash',
  member_joined:  'user-plus',
  member_removed: 'user-minus',
  comment_added:  'message-square',
  group_created:  'flag',
};

/** Color map for each event type */
export const ACTIVITY_COLORS = {
  task_created:   'var(--primary)',
  task_assigned:  'var(--accent)',
  task_moved:     'var(--warning)',
  task_completed: 'var(--success)',
  task_deleted:   'var(--danger)',
  member_joined:  'var(--accent)',
  member_removed: 'var(--danger)',
  comment_added:  'var(--text-muted)',
  group_created:  'var(--primary)',
};
