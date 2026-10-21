/**
 * Sync Engine — bridges IndexedDB (local-first) and Cloud Firestore.
 *
 * - Flushes the local sync queue to Firestore when online.
 * - Pulls remote changes into IndexedDB via snapshot listeners.
 * - Queues writes when offline; flushes on reconnect.
 */
import {
  collection as fsCollection,
  doc as fsDoc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { fsDb, isMock } from '../config/firebaseConfig.js';
import { STORES, put, remove, getSyncQueue, removeSyncQueueItem, get } from './indexedDBService.js';
import { resolveConflict } from './conflictResolver.js';
import { signalSyncing, signalSynced } from './connectionStatus.js';

let unsubscribers = [];
let isSyncing = false;
let isSyncingGroup = null;
let onRemoteChange = null;

export function setRemoteChangeCallback(cb) {
  onRemoteChange = cb;
}

export async function startSync(groupId) {
  if (isSyncingGroup === groupId) {
    return; // Already syncing this group, prevent infinite reload loops
  }
  
  stopSync();
  isSyncingGroup = groupId;
  if (isMock) {
    console.info('[Sync Engine Mock] Running in mock offline mode. Firestore sync disabled.');
    return;
  }
  listenForChanges(groupId);
  if (navigator.onLine) await flushQueue();
}

/**
 * One-shot pull of ALL documents in every group collection from Firestore
 * into IndexedDB. Used after joining a group or on new-device bootstrap
 * so the UI has existing data before rendering.
 *
 * @param {string} groupId
 */
export async function fetchGroupDataOnce(groupId) {
  if (isMock || !navigator.onLine) return;
  const collections = [
    'tasks', 'members', 'peerRatings', 'peerReviews',
    'badges', 'points', 'proofSubmissions', 'events', 'comments',
  ];
  try {
    await Promise.all(collections.map(async (colName) => {
      const q = query(fsCollection(fsDb, colName), where('groupId', '==', groupId));
      const snap = await getDocs(q);
      const storeName = storeForCollection(colName);
      for (const docSnap of snap.docs) {
        const remoteDoc = normalizeTimestamps({ id: docSnap.id, ...docSnap.data() });
        const localDoc = await get(storeName, remoteDoc.id).catch(() => null);
        const { winner, doc } = resolveConflict(localDoc, remoteDoc);
        if (winner === 'remote' && doc) await put(storeName, doc);
      }
    }));
    console.info(`[Sync] fetchGroupDataOnce complete for group ${groupId}`);
  } catch (err) {
    console.warn('[Sync] fetchGroupDataOnce failed:', err.message);
  }
}

let flushTimeout = null;
function handleSyncEnqueued() {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(() => {
    if (navigator.onLine) flushQueue();
  }, 500); // 500ms debounce
}

// Global network reconnections and enqueued writes trigger flushes across all app views
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushQueue());
  window.addEventListener('sync-enqueued', handleSyncEnqueued);
}

export function stopSync() {
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];
  isSyncingGroup = null;
}

/**
 * Converts any Firestore Timestamp objects in a document back to plain
 * millisecond numbers so conflict resolution comparisons work correctly.
 *
 * When flushQueue() uploads a doc it replaces createdAt/updatedAt with
 * serverTimestamp(). Firestore stores them and returns them via onSnapshot
 * as Timestamp objects ({ seconds, nanoseconds }). Comparing an object to
 * a plain number with >= is always false in JS, so without this conversion
 * the conflict resolver would ALWAYS pick 'local' and remote changes would
 * never reach the other user's screen.
 */
function normalizeTimestamps(doc) {
  const TS_FIELDS = ['createdAt', 'updatedAt', 'completedAt', 'joinedAt'];
  const result = { ...doc };
  for (const field of TS_FIELDS) {
    const val = result[field];
    if (val && typeof val === 'object') {
      if (typeof val.toMillis === 'function') {
        result[field] = val.toMillis();
      } else if (typeof val.seconds === 'number') {
        result[field] = val.seconds * 1000;
      }
    }
  }
  return result;
}

function listenForChanges(groupId) {
  // Bug fix: 'comments' was missing here — User B never received comments from Firestore.
  const collections = [
    'tasks', 'members', 'peerRatings', 'peerReviews',
    'badges', 'points', 'proofSubmissions', 'events', 'comments',
  ];

  for (const colName of collections) {
    const q = query(fsCollection(fsDb, colName), where('groupId', '==', groupId));
    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        // Normalize Firestore Timestamp objects → ms numbers BEFORE conflict resolution.
        // Without this, serverTimestamp() fields come back as { seconds, nanoseconds }
        // and the >= comparison in resolveConflict always returns false (object vs number),
        // so 'remote' never wins and the other user's screen never updates.
        const remoteDoc = normalizeTimestamps({ id: change.doc.id, ...change.doc.data() });
        const storeName = storeForCollection(colName);

        if (change.type === 'removed') {
          await remove(storeName, remoteDoc.id).catch(() => {});
        } else {
          const localDoc = await get(storeName, remoteDoc.id).catch(() => null);
          const { winner, doc } = resolveConflict(localDoc, remoteDoc);
          if (winner === 'remote' && doc) {
            await put(storeName, doc);
          }
        }
      });
      if (typeof onRemoteChange === 'function') onRemoteChange();
    }, (err) => {
      console.warn(`[Sync] Listener error on ${colName}:`, err.message);
    });
    unsubscribers.push(unsub);
  }

  // Also listen to the group document itself (stores joinRequests, name, etc.)
  const groupUnsub = onSnapshot(fsDoc(fsDb, 'groups', groupId), async (docSnap) => {
    if (docSnap.exists()) {
      const remoteGroup = normalizeTimestamps({ id: docSnap.id, ...docSnap.data() });
      const localGroup = await get(STORES.GROUPS, groupId).catch(() => null);
      const { winner, doc } = resolveConflict(localGroup, remoteGroup);
      if (winner === 'remote' && doc) {
        await put(STORES.GROUPS, doc);
      }
    }
    if (typeof onRemoteChange === 'function') onRemoteChange();
  }, (err) => {
    console.warn('[Sync] Group document listener error:', err.message);
  });
  unsubscribers.push(groupUnsub);
}

export async function flushQueue() {
  if (isSyncing) return;
  
  if (isMock) {
    const queue = await getSyncQueue();
    if (queue.length > 0) {
      console.log('[Sync Engine Mock] Flushing mock sync queue:', queue);
      for (const entry of queue) {
        await removeSyncQueueItem(entry.id);
      }
    }
    return;
  }

  if (!navigator.onLine) return;
  isSyncing = true;
  signalSyncing();

  try {
    const queue = await getSyncQueue();
    for (const entry of queue) {
      try {
        const ref = fsDoc(fsDb, entry.collection, entry.docId);
        if (entry.operation === 'delete') {
          await deleteDoc(ref);
        } else {
          // Build the Firestore payload: strip the local 'id' field (it's
          // already the document path) and replace client timestamps with
          // server timestamps so the authoritative time comes from Firebase,
          // not the client clock (which may be skewed or manipulated).
          const data = { ...entry.data };
          delete data.id;
          const SERVER_TS_FIELDS = ['createdAt', 'updatedAt', 'completedAt', 'joinedAt'];
          for (const field of SERVER_TS_FIELDS) {
            if (field in data && data[field] != null) {
              data[field] = serverTimestamp();
            }
          }
          await setDoc(ref, data, { merge: true });
        }
        await removeSyncQueueItem(entry.id);
      } catch (err) {
        console.warn('[Sync] Failed to push entry:', err.message);
        // "Poison Pill" Prevention:
        // If the server explicitly rejects the write due to security rules,
        // we MUST remove it from the queue, otherwise it will permanently
        // deadlock all future sync operations.
        if (err.code === 'permission-denied') {
          console.error('[Sync] Permanent rejection. Removing invalid item from queue to prevent deadlock.');
          await removeSyncQueueItem(entry.id);
        } else {
          // Transient error (e.g. network drop mid-flight). Break and retry later.
          break;
        }
      }
    }
  } finally {
    isSyncing = false;
    signalSynced();
  }
}

function storeForCollection(col) {
  const map = {
    tasks:            STORES.TASKS,
    members:          STORES.MEMBERS,
    peerRatings:      STORES.PEER_RATINGS,
    peerReviews:      STORES.PEER_REVIEWS,
    badges:           STORES.BADGES,
    points:           STORES.POINTS,
    proofSubmissions: STORES.PROOF_SUBMISSIONS,
    events:           STORES.EVENTS,
    comments:         STORES.COMMENTS,  // Bug fix: was missing, causing silent IndexedDB write failures
  };
  return map[col] || col;
}
