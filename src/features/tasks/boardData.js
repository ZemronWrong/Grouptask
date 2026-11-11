/**
 * boardData.js
 * Data loading for the Kanban board.
 *
 * Reads all data required to render or patch the board from IndexedDB.
 * No HTML, no events, no DOM writes — pure data access.
 */

import { STORES, getAllByIndex, get, getAll } from '../../services/indexedDBService.js';
import { currentUser } from '../../services/authService.js';

/**
 * Load all data needed to render or patch the board.
 * Returns a plain data object — no DOM, no side effects.
 *
 * @param  {string} groupId
 * @returns {Promise<{
 *   group, tasks, members, groupProofs, comments,
 *   profileMap, me, isAdmin, pendingProofsCount
 * }>}
 */
export async function loadBoardData(groupId) {
  const user = currentUser();
  const [group, tasks, members, allProofs, comments, allProfiles] = await Promise.all([
    get(STORES.GROUPS,            groupId),
    getAllByIndex(STORES.TASKS,    'groupId', groupId),
    getAllByIndex(STORES.MEMBERS,  'groupId', groupId),
    getAll(STORES.PROOF_SUBMISSIONS),
    getAllByIndex(STORES.COMMENTS, 'groupId', groupId),
    getAll(STORES.USER_PROFILES),
  ]);

  const groupProofs = (allProofs || []).filter((p) => p.groupId === groupId);
  const me          = members.find((m) => m.uid === user?.uid);
  const isAdmin     = me?.role === 'owner' || me?.role === 'co-admin';

  // uid → profile lookup for avatar images
  const profileMap = {};
  (allProfiles || []).forEach((p) => { profileMap[p.uid] = p; });

  const pendingProofsCount = groupProofs.filter((p) => p.status === 'pending').length;
  const pendingJoinRequestsCount = isAdmin ? ((group?.joinRequests || []).filter((r) => r.status === 'pending').length) : 0;

  return { group, tasks, members, groupProofs, comments, profileMap, me, isAdmin, pendingProofsCount, pendingJoinRequestsCount };
}
