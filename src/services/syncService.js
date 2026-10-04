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
let onRemoteChange = null;

export function setRemoteChangeCallback(cb) {
  onRemoteChange = cb;
}

export async function startSync(groupId) {
  stopSync();
  if (isMock) {
    console.info('[Sync Engine Mock] Running in mock offline mode. Firestore sync disabled.');
    return;
  }
  listenForChanges(groupId);
  window.addEventListener('online', () => flushQueue());
  if (navigator.onLine) await flushQueue();
}

export function stopSync() {
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];
}

function listenForChanges(groupId) {
  const collections = ['tasks', 'members', 'peerRatings', 'peerReviews', 'badges', 'points', 'proofSubmissions', 'events'];

  for (const colName of collections) {
    const q = query(fsCollection(fsDb, colName), where('groupId', '==', groupId));
    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const remoteDoc = { id: change.doc.id, ...change.doc.data() };
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
        console.warn('[Sync] Failed to push entry, will retry:', err.message);
        break;
      }
    }
  } finally {
    isSyncing = false;
    signalSynced();
  }
}

function storeForCollection(col) {
  const map = {
    tasks:       STORES.TASKS,
    members:     STORES.MEMBERS,
    peerRatings: STORES.PEER_RATINGS,
    peerReviews: STORES.PEER_REVIEWS,
    badges:      STORES.BADGES,
    points:      STORES.POINTS,
    proofSubmissions: STORES.PROOF_SUBMISSIONS,
    events:      STORES.EVENTS,
  };
  return map[col] || col;
}
