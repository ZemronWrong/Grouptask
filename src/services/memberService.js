import { STORES, add, put, get, remove, getAll, getAllByIndex, addToSyncQueue } from './indexedDBService.js';
import { generateId, generateInviteCode } from '../utils/helpers.js';
import { notify } from './notificationService.js';
import { logActivity } from './activityLogService.js';

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

  const member = {
    id: generateId(),
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
  const groups = await getAll(STORES.GROUPS);
  const group = groups.find((g) => g.inviteCode?.toUpperCase() === inviteCode.trim().toUpperCase());
  if (!group) throw new Error('Invite code not found.');

  const existing = await getAllByIndex(STORES.MEMBERS, 'groupId', group.id);
  if (existing.some((m) => m.uid === uid)) return group;

  const member = {
    id: generateId(),
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
