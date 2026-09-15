import { promisifyRequest, openDatabase } from '../lib/indexedDB.js';

const DB_NAME = 'GroupTaskDB';
const DB_VERSION = 4;

export const STORES = {
  GROUPS:            'groups',
  TASKS:             'tasks',
  MEMBERS:           'members',
  PEER_RATINGS:      'peerRatings',
  PEER_REVIEWS:      'peerReviews',
  SYNC_QUEUE:        'syncQueue',
  BADGES:            'badges',
  POINTS:            'points',
  PROOF_SUBMISSIONS: 'proofSubmissions',
  NOTIFICATIONS:     'notifications',
  COMMENTS:          'comments',
  AUDIT_REQUESTS:    'auditRequests',
  USER_PROFILES:     'userProfiles',
  ACTIVITY_LOG:      'activityLog',
};

let dbInstance = null;

export function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) { resolve(dbInstance); return; }

    openDatabase(DB_NAME, DB_VERSION, (db) => {

      if (!db.objectStoreNames.contains(STORES.GROUPS)) {
        const s = db.createObjectStore(STORES.GROUPS, { keyPath: 'id' });
        s.createIndex('createdBy', 'createdBy', { unique: false });
        s.createIndex('inviteCode', 'inviteCode', { unique: true });
      }

      if (!db.objectStoreNames.contains(STORES.TASKS)) {
        const s = db.createObjectStore(STORES.TASKS, { keyPath: 'id' });
        s.createIndex('groupId', 'groupId', { unique: false });
        s.createIndex('assignedTo', 'assignedTo', { unique: false });
        s.createIndex('status', 'status', { unique: false });
        s.createIndex('groupId_status', ['groupId', 'status'], { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.MEMBERS)) {
        const s = db.createObjectStore(STORES.MEMBERS, { keyPath: 'id' });
        s.createIndex('uid', 'uid', { unique: false });
        s.createIndex('groupId', 'groupId', { unique: false });
        s.createIndex('groupId_uid', ['groupId', 'uid'], { unique: true });
      }

      if (!db.objectStoreNames.contains(STORES.PEER_RATINGS)) {
        const s = db.createObjectStore(STORES.PEER_RATINGS, { keyPath: 'id' });
        s.createIndex('groupId', 'groupId', { unique: false });
        s.createIndex('groupId_toMemberId', ['groupId', 'toMemberId'], { unique: false });
        s.createIndex('groupId_fromMemberId', ['groupId', 'fromMemberId'], { unique: false });
      }

      // Peer reviews and qualitative feedback submitted between members
      if (!db.objectStoreNames.contains(STORES.PEER_REVIEWS)) {
        const s = db.createObjectStore(STORES.PEER_REVIEWS, { keyPath: 'id' });
        s.createIndex('groupId', 'groupId', { unique: false });
        s.createIndex('reviewerId', 'reviewerId', { unique: false });
        s.createIndex('evaluateeId', 'evaluateeId', { unique: false });
        s.createIndex('groupId_reviewerId', ['groupId', 'reviewerId'], { unique: false });
        s.createIndex('groupId_evaluateeId', ['groupId', 'evaluateeId'], { unique: false });
      }

      // Offline synchronization queue for pending mutations
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const s = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('timestamp', 'timestamp', { unique: false });
        s.createIndex('collection', 'collection', { unique: false });
      }

      // Gamification badges unlocked by members
      if (!db.objectStoreNames.contains(STORES.BADGES)) {
        const s = db.createObjectStore(STORES.BADGES, { keyPath: 'id' });
        s.createIndex('memberId', 'memberId', { unique: false });
        s.createIndex('groupId', 'groupId', { unique: false });
        s.createIndex('memberId_type', ['memberId', 'type'], { unique: false });
      }

      // Historical gamification points ledger
      if (!db.objectStoreNames.contains(STORES.POINTS)) {
        const s = db.createObjectStore(STORES.POINTS, { keyPath: 'id' });
        s.createIndex('memberId', 'memberId', { unique: false });
        s.createIndex('groupId', 'groupId', { unique: false });
        s.createIndex('groupId_memberId', ['groupId', 'memberId'], { unique: false });
      }

      // Work verification and task proof submissions
      if (!db.objectStoreNames.contains(STORES.PROOF_SUBMISSIONS)) {
        const s = db.createObjectStore(STORES.PROOF_SUBMISSIONS, { keyPath: 'id' });
        s.createIndex('taskId',  'taskId',  { unique: false });
        s.createIndex('groupId', 'groupId', { unique: false });
        s.createIndex('memberId','memberId',{ unique: false });
      }

      // User notification inbox and read statuses
      if (!db.objectStoreNames.contains(STORES.NOTIFICATIONS)) {
        const s = db.createObjectStore(STORES.NOTIFICATIONS, { keyPath: 'id' });
        s.createIndex('uid', 'uid', { unique: false });
        s.createIndex('read', 'read', { unique: false });
        s.createIndex('type', 'type', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Task discussion threads and contextual comments
      if (!db.objectStoreNames.contains(STORES.COMMENTS)) {
        const s = db.createObjectStore(STORES.COMMENTS, { keyPath: 'id' });
        s.createIndex('taskId', 'taskId', { unique: false });
        s.createIndex('groupId', 'groupId', { unique: false });
        s.createIndex('memberId', 'memberId', { unique: false });
        s.createIndex('parentId', 'parentId', { unique: false });
      }

      // Audit and governance inspection records
      if (!db.objectStoreNames.contains(STORES.AUDIT_REQUESTS)) {
        const s = db.createObjectStore(STORES.AUDIT_REQUESTS, { keyPath: 'id' });
        s.createIndex('groupId', 'groupId', { unique: false });
        s.createIndex('status', 'status', { unique: false });
        s.createIndex('requestedBy', 'requestedBy', { unique: false });
      }

      // Local user preference and customization profiles
      if (!db.objectStoreNames.contains(STORES.USER_PROFILES)) {
        const s = db.createObjectStore(STORES.USER_PROFILES, { keyPath: 'uid' });
      }

      // High-resolution audit timeline and activity stream
      if (!db.objectStoreNames.contains(STORES.ACTIVITY_LOG)) {
        const s = db.createObjectStore(STORES.ACTIVITY_LOG, { keyPath: 'id' });
        s.createIndex('groupId',   'groupId',   { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
        s.createIndex('actorId',   'actorId',   { unique: false });
        s.createIndex('type',      'type',      { unique: false });
      }
    }).then((db) => {
      dbInstance = db;
      resolve(db);
    }).catch(reject);
  });
}

export function resetDBInstance() { dbInstance = null; }

async function tx(storeName, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

function wrap(request) {
  return promisifyRequest(request);
}

export async function add(storeName, data) {
  return wrap((await tx(storeName, 'readwrite')).add(data));
}

export async function put(storeName, data) {
  return wrap((await tx(storeName, 'readwrite')).put(data));
}

export async function get(storeName, key) {
  return wrap((await tx(storeName, 'readonly')).get(key));
}

export async function getAll(storeName) {
  return wrap((await tx(storeName, 'readonly')).getAll());
}

export async function getAllByIndex(storeName, indexName, key) {
  const store = await tx(storeName, 'readonly');
  return wrap(store.index(indexName).getAll(key));
}

export async function remove(storeName, key) {
  return wrap((await tx(storeName, 'readwrite')).delete(key));
}

export async function clear(storeName) {
  return wrap((await tx(storeName, 'readwrite')).clear());
}

export async function addToSyncQueue(entry) {
  return add(STORES.SYNC_QUEUE, { ...entry, timestamp: Date.now() });
}

export async function getSyncQueue() {
  return getAll(STORES.SYNC_QUEUE);
}

export async function removeSyncQueueItem(id) {
  return remove(STORES.SYNC_QUEUE, id);
}

export async function clearSyncQueue() {
  return clear(STORES.SYNC_QUEUE);
}
