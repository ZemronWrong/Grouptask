import { STORES, add, put, get, remove, getAll, getAllByIndex, addToSyncQueue } from './indexedDBService.js';
import { flushQueue, fetchGroupDataOnce } from './syncService.js';
import { generateId, generateInviteCode } from '../utils/helpers.js';
import { notify } from './notificationService.js';
import { logActivity } from './activityLogService.js';
import { fsDb, isMock } from '../config/firestoreDb.js';
import {
  collection,
  doc as fsDoc,
  getDoc,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

export function getGroupMembers(groupId) {
  return getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
}

export async function getMembershipsForUser(uid) {
  const all = await getAll(STORES.MEMBERS);
  return all.filter((m) => m.uid === uid);
}

/**
 * Bootstraps a returning user's data from Firestore into IndexedDB.
 *
 * Only does anything when the local IndexedDB has no memberships for this
 * user (a new device). Queries Firestore for all member records belonging to
 * this user, then fetches each associated group and seeds both into IndexedDB
 * so the Dashboard shows the correct boards even on a new device.
 *
 * Call it through session.js (bootstrapUserDataOnce) so it runs only once (F3).
 *
 * @param {string} uid - Firebase Auth UID of the signed-in user.
 * @returns {Promise<boolean>} true if anything was downloaded.
 * @throws if the download failed, so the caller can try again later.
 */
export async function bootstrapUserData(uid) {
  if (!uid || isMock) return false;

  // Only bootstrap if local DB appears empty for this user
  const localMembers = await getAll(STORES.MEMBERS);
  const myLocalMembers = localMembers.filter((m) => m.uid === uid);
  if (myLocalMembers.length > 0) return false; // Already have local data, skip
  if (!navigator.onLine) throw new Error('Offline: cannot download your groups yet.');

  try {
    // 1. Fetch all member records for this user from Firestore
    const membersQ = query(
      collection(fsDb, 'members'),
      where('uid', '==', uid)
    );
    const membersSnap = await getDocs(membersQ);
    if (membersSnap.empty) return false;

    const groupIds = new Set();
    for (const memberDoc of membersSnap.docs) {
      const member = { id: memberDoc.id, ...memberDoc.data() };
      // Normalize Firestore Timestamps to ms numbers
      if (member.joinedAt?.seconds) member.joinedAt = member.joinedAt.seconds * 1000;
      await put(STORES.MEMBERS, member);
      if (member.groupId) groupIds.add(member.groupId);
    }

    // 2. Fetch each associated group document
    for (const groupId of groupIds) {
      const localGroup = await get(STORES.GROUPS, groupId);
      if (localGroup) continue; // Already seeded
      try {
        const groupSnap = await getDoc(fsDoc(fsDb, 'groups', groupId));
        if (groupSnap.exists()) {
          const group = { id: groupSnap.id, ...groupSnap.data() };
          if (group.createdAt?.seconds) group.createdAt = group.createdAt.seconds * 1000;
          if (group.updatedAt?.seconds) group.updatedAt = group.updatedAt.seconds * 1000;
          await put(STORES.GROUPS, group);
        }
      } catch (err) {
        console.warn(`[bootstrap] Could not fetch group ${groupId}:`, err.message);
      }
    }

    console.info(`[Bootstrap] Seeded ${membersSnap.size} memberships and ${groupIds.size} groups from Firestore.`);

    // 3. Pull all group data (tasks, badges, etc.) for every group into IndexedDB
    await Promise.all([...groupIds].map((gId) => fetchGroupDataOnce(gId)));
    console.info('[Bootstrap] Full group data pulled from Firestore.');
    return true;
  } catch (err) {
    console.warn('[Bootstrap] Failed to bootstrap user data from Firestore:', err.message);
    throw err;
  }
}

export async function createGroup({ name, createdBy, displayName }) {
  const group = {
    id: generateId(),
    name,
    createdBy,
    inviteCode: generateInviteCode(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await add(STORES.GROUPS, group);
  await addToSyncQueue({ collection: 'groups', docId: group.id, operation: 'add', data: group });

  const memberId = `${group.id}_${createdBy}`;
  const member = {
    id: memberId,
    uid: createdBy,
    groupId: group.id,
    displayName,
    role: 'owner',
    joinedAt: Date.now(),
  };
  await add(STORES.MEMBERS, member);
  await addToSyncQueue({ collection: 'members', docId: member.id, operation: 'add', data: member });
  return group;
}

export async function joinGroupByCode({ inviteCode, uid, displayName }) {
  const normalizedCode = inviteCode.trim().toUpperCase();

  // 1. Check local IndexedDB first (fast path — works offline too)
  let group = null;
  const localGroups = await getAll(STORES.GROUPS);
  group = localGroups.find((g) => g.inviteCode?.toUpperCase() === normalizedCode);

  // 2. If not found locally, query Firestore directly.
  //    This is the critical path for NEW users on Vercel whose local DB is empty.
  if (!group && !isMock) {
    try {
      const q = query(
        collection(fsDb, 'groups'),
        where('inviteCode', '==', normalizedCode)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        group = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        // Seed the local DB so future reads are fast
        await put(STORES.GROUPS, group);
      }
    } catch (err) {
      console.warn('[joinGroup] Firestore fallback failed:', err.message);
    }
  }

  if (!group) throw new Error('Invite code not found. Double-check the code and try again.');


  const existing = await getAllByIndex(STORES.MEMBERS, 'groupId', group.id);
  if (existing.some((m) => m.uid === uid)) return group;

  const memberId = `${group.id}_${uid}`;
  const member = {
    id: memberId,
    uid,
    groupId: group.id,
    inviteCode: group.inviteCode,
    displayName,
    role: 'member',
    joinedAt: Date.now(),
  };
  await add(STORES.MEMBERS, member);
  await addToSyncQueue({ collection: 'members', docId: member.id, operation: 'add', data: member });

  // Flush immediately so the new membership reaches Firestore,
  // then do a one-shot pull to seed all existing group data into local IndexedDB
  await flushQueue();
  await fetchGroupDataOnce(group.id);

  // Log activity
  await logActivity({
    groupId:     group.id,
    type:        'member_joined',
    actorId:     member.id,
    actorName:   displayName,
    description: `${displayName} joined the group`,
    meta:        { memberId: member.id },
  });

  for (const m of existing.filter((x) => x.role === 'owner' || x.role === 'co-admin')) {
    await notify({
      uid: m.uid,
      type: 'member_joined',
      title: 'New Member',
      message: `${displayName} joined ${group.name}.`,
      icon: '👋',
      actionLink: `#/group/${group.id}/members`,
      groupId: group.id,
    });
  }
  return group;
}

/**
 * Sends a join request to a group instead of immediately joining.
 * The request is stored in the group document's `joinRequests` array
 * so the board owner can review it in the Share → Join Requests tab.
 */
export async function sendJoinRequest({ inviteCode, uid, displayName, email }) {
  const normalizedCode = inviteCode.trim().toUpperCase();

  // 1. Find the group
  let group = null;
  const localGroups = await getAll(STORES.GROUPS);
  group = localGroups.find((g) => g.inviteCode?.toUpperCase() === normalizedCode);

  if (!group && !isMock) {
    try {
      const q = query(collection(fsDb, 'groups'), where('inviteCode', '==', normalizedCode));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        group = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        await put(STORES.GROUPS, group);
      }
    } catch (err) {
      console.warn('[sendJoinRequest] Firestore fallback failed:', err.message);
    }
  }

  if (!group) throw new Error('Invite code not found. Double-check the code and try again.');

  // 2. Check if already a member
  const existing = await getAllByIndex(STORES.MEMBERS, 'groupId', group.id);
  if (existing.some((m) => m.uid === uid)) {
    throw new Error('You are already a member of this board.');
  }

  // 3. Check for duplicate pending request
  const existingReqs = group.joinRequests || [];
  if (existingReqs.some((r) => r.uid === uid)) {
    throw new Error('You already have a pending join request for this board.');
  }

  // 4. Append the request to the group document
  const request = {
    id: `${group.id}_req_${uid}`,
    uid,
    displayName,
    email: email || null,
    requestedAt: Date.now(),
    status: 'pending',
  };
  const updatedGroup = { ...group, joinRequests: [...existingReqs, request], updatedAt: Date.now() };
  await put(STORES.GROUPS, updatedGroup);
  await addToSyncQueue({ collection: 'groups', docId: group.id, operation: 'update', data: updatedGroup });
  await flushQueue();

  // 5. Notify owners/co-admins
  for (const m of existing.filter((x) => x.role === 'owner' || x.role === 'co-admin')) {
    await notify({
      uid: m.uid,
      type: 'join_request',
      title: 'New Join Request',
      message: `${displayName} wants to join ${group.name}.`,
      icon: '📬',
      actionLink: `#/group/${group.id}`,
      groupId: group.id,
    });
  }

  return { group, request };
}

export async function kickMember(member, groupId) {
  // 1. Unassign any tasks that belonged to this member on this board
  const tasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  for (const t of tasks) {
    if (t.assignedTo === member.id) {
      t.assignedTo = null;
      if (t.status === 'in-progress') t.status = 'todo';
      t.updatedAt = Date.now();
      await put(STORES.TASKS, t);
      await addToSyncQueue({ collection: 'tasks', docId: t.id, operation: 'update', data: t });
    }
  }

  // 2. Remove member locally and queue Firestore deletion
  await remove(STORES.MEMBERS, member.id);
  await addToSyncQueue({
    collection: 'members',
    docId: member.id,
    operation: 'delete',
    data: { id: member.id, groupId },
  });

  // 3. Log activity
  await logActivity({
    groupId,
    type: 'member_removed',
    actorId: member.id,
    actorName: member.displayName || 'Someone',
    description: `${member.displayName || 'A member'} was removed from the group`,
    meta: { memberId: member.id },
  });

  // 4. Send notification if they have a uid
  if (member.uid) {
    await notify({
      uid: member.uid,
      type: 'member_left',
      title: 'Removed from Group',
      message: 'You have been removed from the group.',
      icon: '🚪',
      groupId,
    });
  }

  // 5. Immediately flush queue so remote users receive the deletion immediately
  await flushQueue();
}

export async function leaveGroup(groupId, member) {
  if (!member) return;

  // 1. Unassign any tasks that belonged to this member on this board
  const tasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  for (const t of tasks) {
    if (t.assignedTo === member.id) {
      t.assignedTo = null;
      if (t.status === 'in-progress') t.status = 'todo';
      t.updatedAt = Date.now();
      await put(STORES.TASKS, t);
      await addToSyncQueue({ collection: 'tasks', docId: t.id, operation: 'update', data: t });
    }
  }

  // 2. Remove member locally and queue Firestore deletion
  await remove(STORES.MEMBERS, member.id);
  await addToSyncQueue({
    collection: 'members',
    docId: member.id,
    operation: 'delete',
    data: { id: member.id, groupId },
  });

  // 3. Log activity
  await logActivity({
    groupId,
    type: 'member_removed',
    actorId: member.id,
    actorName: member.displayName || 'Someone',
    description: `${member.displayName || 'A member'} left the group`,
    meta: { memberId: member.id },
  });

  // 4. Immediately flush queue to ensure Firestore delete completes
  await flushQueue();
}

export async function setMemberRestricted(member, restricted) {
  member.restricted = restricted;
  await put(STORES.MEMBERS, member);
  await addToSyncQueue({ collection: 'members', docId: member.id, operation: 'update', data: member });
  return member;
}

export { get };
