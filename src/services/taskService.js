import { STORES, getAllByIndex } from './indexedDBService.js';

/**
 * Fetches all tasks for a specific group from IndexedDB.
 * @param {string} groupId
 * @returns {Promise<Array<object>>}
 */
export function getGroupTasks(groupId) {
  return getAllByIndex(STORES.TASKS, 'groupId', groupId);
}
