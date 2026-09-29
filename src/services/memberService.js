import { STORES, add, put, get, remove, getAll, getAllByIndex, addToSyncQueue } from './indexedDBService.js';
import { generateId, generateInviteCode } from '../utils/helpers.js';
import { notify } from './notificationService.js';
import { logActivity } from './activityLogService.js';
import { fsDb, isMock } from '../config/firebaseConfig.js';
import {
  collection,
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
    displayName,
    role: 'member',
    joinedAt: Date.now(),
  };
  await add(STORES.MEMBERS, member);
  await addToSyncQueue({ collection: 'members', docId: member.id, operation: 'add', data: member });

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

export async function kickMember(member, groupId) {
  await remove(STORES.MEMBERS, member.id);
  await addToSyncQueue({
    collection: 'members',
    docId: member.id,
    operation: 'delete',
    data: { id: member.id, groupId },
  });
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
}

export async function setMemberRestricted(member, restricted) {
  member.restricted = restricted;
  await put(STORES.MEMBERS, member);
  await addToSyncQueue({ collection: 'members', docId: member.id, operation: 'update', data: member });
  return member;
}

export { get };
