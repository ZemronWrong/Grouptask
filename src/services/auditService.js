import { STORES, add, put, get, getAllByIndex, addToSyncQueue } from './indexedDBService.js';
import { generateId } from '../utils/helpers.js';
import { generateAuditReport } from '../core/auditEngine.js';
import { notify } from './notificationService.js';

export function getGroupAudits(groupId) {
  return getAllByIndex(STORES.AUDIT_REQUESTS, 'groupId', groupId);
}

export async function createAuditRequest({ groupId, scope, memberId, memberName, reason, requestedBy, members }) {
  const audit = {
    id: generateId(),
    groupId,
    scope,
    memberId,
    memberName,
    reason,
    requestedBy,
    status: 'pending',
    createdAt: Date.now(),
  };

  await add(STORES.AUDIT_REQUESTS, audit);
  await addToSyncQueue({ collection: 'auditRequests', docId: audit.id, operation: 'add', data: audit });

  const requester = members.find((m) => m.id === requestedBy);
  for (const m of members.filter((m2) => m2.role === 'owner' || m2.role === 'co-admin')) {
    await notify({
      uid: m.uid,
      type: 'approval_request',
      title: 'Audit Requested',
      message: `${requester?.displayName || 'A member'} requested a ${scope === 'full' ? 'full group' : 'member'} audit.`,
      icon: '🔍',
      actionLink: `#/group/${groupId}/audit`,
      groupId,
    });
  }

  return audit;
}

export async function completeAudit(auditId, { members, tasks, peerReviews, badges }) {
  const audit = await get(STORES.AUDIT_REQUESTS, auditId);
  if (!audit) throw new Error('Audit not found');
  audit.status = 'completed';
  audit.completedAt = Date.now();
  audit.report = generateAuditReport(audit, members, tasks, peerReviews, badges);
  await put(STORES.AUDIT_REQUESTS, audit);
  await addToSyncQueue({ collection: 'auditRequests', docId: audit.id, operation: 'update', data: audit });
  return audit;
}

export function getAudit(auditId) {
  return get(STORES.AUDIT_REQUESTS, auditId);
}
