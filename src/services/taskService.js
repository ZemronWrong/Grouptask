import { STORES, add, put, get, remove, getAllByIndex, addToSyncQueue } from './indexedDBService.js';
import { generateId } from '../utils/helpers.js';
import { notify } from './notificationService.js';
import { logActivity } from './activityLogService.js';

export function getGroupTasks(groupId) {
  return getAllByIndex(STORES.TASKS, 'groupId', groupId);
}

export function getTask(taskId) {
  return get(STORES.TASKS, taskId);
}

export async function saveTask(task, { isNew = false } = {}) {
  if (isNew) {
    await add(STORES.TASKS, task);
    await addToSyncQueue({ collection: 'tasks', docId: task.id, operation: 'add', data: task });
  } else {
    await put(STORES.TASKS, task);
    await addToSyncQueue({ collection: 'tasks', docId: task.id, operation: 'update', data: task });
  }
  return task;
}

export async function createTask(partial) {
  const task = {
    id: generateId(),
    status: 'todo',
    weight: 100,
    assignedTo: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
  await saveTask(task, { isNew: true });
  // Log activity
  await logActivity({
    groupId:     task.groupId,
    type:        'task_created',
    actorId:     task.createdBy || null,
    actorName:   task.creatorName || 'Someone',
    description: `Created task "${task.title}"`,
    meta:        { taskId: task.id, taskTitle: task.title },
  });
  return task;
}

export async function deleteTask(taskId, groupId, meta = {}) {
  await remove(STORES.TASKS, taskId);
  await addToSyncQueue({
    collection: 'tasks',
    docId: taskId,
    operation: 'delete',
    data: { id: taskId, groupId },
  });
  await logActivity({
    groupId,
    type:        'task_deleted',
    actorId:     meta.actorId || null,
    actorName:   meta.actorName || 'Someone',
    description: `Deleted task "${meta.taskTitle || taskId}"`,
    meta:        { taskId, ...meta },
  });
}

export async function notifyAssignee(members, assignedTo, task, groupId) {
  const assignee = members.find((m) => m.id === assignedTo);
  if (!assignee) return;
  await notify({
    uid: assignee.uid,
    type: 'task_assigned',
    title: 'New Task Assigned',
    message: `You were assigned "${task.title}".`,
    icon: '📋',
    actionLink: `#/group/${groupId}`,
    groupId,
  });
}
