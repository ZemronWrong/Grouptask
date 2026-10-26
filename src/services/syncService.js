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
  getDoc,
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
  // B5: Fetch each collection individually so one failure doesn't abort all
  // others (e.g. a rules rejection on peerReviews shouldn't block tasks).
  // Events use 'boardId' not 'groupId' — query adjusted accordingly.
  const collectionQueries = [
    { colName: 'tasks',           field: 'groupId' },
    { colName: 'members',         field: 'groupId' },
    { colName: 'peerRatings',     field: 'groupId' },
    { colName: 'peerReviews',     field: 'groupId' },
    { colName: 'badges',          field: 'groupId' },
    { colName: 'points',          field: 'groupId' },
    { colName: 'proofSubmissions',field: 'groupId' },
    { colName: 'events',          field: 'boardId'  }, // B5: events store boardId, not groupId
    { colName: 'comments',        field: 'groupId' },
  ];
  await Promise.all(collectionQueries.map(async ({ colName, field }) => {
    try {
      const q = query(fsCollection(fsDb, colName), where(field, '==', groupId));
      const snap = await getDocs(q);
      const storeName = storeForCollection(colName);
      for (const docSnap of snap.docs) {
        const remoteDoc = normalizeTimestamps({ id: docSnap.id, ...docSnap.data() });
        const localDoc = await get(storeName, remoteDoc.id).catch(() => null);
        const { winner, doc } = resolveConflict(localDoc, remoteDoc);
        if (winner === 'remote' && doc) await put(storeName, doc);
      }
    } catch (colErr) {
      // Isolate: log but continue fetching other collections
      console.warn(`[Sync] fetchGroupDataOnce: failed to fetch '${colName}':`, colErr.message);
    }
  }));

    // Also pull each member's userProfile so avatars/photos are visible to all group members.
    // userProfiles are keyed by uid (not groupId), so we fetch them individually by ID.
    try {
      const membersSnap = await getDocs(
        query(fsCollection(fsDb, 'members'), where('groupId', '==', groupId))
      );
      const uids = [...new Set(membersSnap.docs.map((d) => d.data().uid).filter(Boolean))];
      await Promise.all(uids.map(async (uid) => {
        const profileSnap = await getDoc(fsDoc(fsDb, 'userProfiles', uid));
        if (profileSnap.exists()) {
          // B8 fix: normalizeTimestamps was missing here — Firestore Timestamp objects
          // were not converted to ms numbers, so resolveConflict always picked 'local'
          // and remote profile changes (avatar, displayName) never reached other devices.
          const profile = normalizeTimestamps({ id: profileSnap.id, ...profileSnap.data() });
          const local = await get(STORES.USER_PROFILES, profile.id).catch(() => null);
          const { winner, doc } = resolveConflict(local, profile);
          if (winner === 'remote' && doc) await put(STORES.USER_PROFILES, doc);
        }
      }));
    } catch (profileErr) {
      console.warn('[Sync] Could not fetch member userProfiles:', profileErr.message);
    }

  console.info(`[Sync] fetchGroupDataOnce complete for group ${groupId}`);
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
  // B5: events use 'boardId'; all others use 'groupId'. Bug fix: 'comments' was missing.
  const colListeners = [
    { colName: 'tasks',            field: 'groupId' },
    { colName: 'members',          field: 'groupId' },
    { colName: 'peerRatings',      field: 'groupId' },
    { colName: 'peerReviews',      field: 'groupId' },
    { colName: 'badges',           field: 'groupId' },
    { colName: 'points',           field: 'groupId' },
    { colName: 'proofSubmissions', field: 'groupId' },
    { colName: 'events',           field: 'boardId'  },
    { colName: 'comments',         field: 'groupId' },
  ];

  for (const { colName, field } of colListeners) {
    const q = query(fsCollection(fsDb, colName), where(field, '==', groupId));
    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
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

  // Listen to userProfiles for each group member so avatar/photo changes propagate in real time.
  // We do a one-time read of the members collection to get their UIDs, then subscribe to each.
  getDocs(query(fsCollection(fsDb, 'members'), where('groupId', '==', groupId)))
    .then((membersSnap) => {
      const uids = [...new Set(membersSnap.docs.map((d) => d.data().uid).filter(Boolean))];
      for (const uid of uids) {
        const profileUnsub = onSnapshot(fsDoc(fsDb, 'userProfiles', uid), async (docSnap) => {
          if (docSnap.exists()) {
            // B8 fix: normalizeTimestamps was missing here — same Timestamp-vs-number bug
            // that was fixed for all other collections but was overlooked for userProfiles.
            const remoteProfile = normalizeTimestamps({ id: docSnap.id, ...docSnap.data() });
            const localProfile = await get(STORES.USER_PROFILES, uid).catch(() => null);
            const { winner, doc } = resolveConflict(localProfile, remoteProfile);
            if (winner === 'remote' && doc) {
              await put(STORES.USER_PROFILES, doc);
              if (typeof onRemoteChange === 'function') onRemoteChange();
            }
          }
        }, (err) => {
          console.warn(`[Sync] userProfile listener error for ${uid}:`, err.message);
        });
        unsubscribers.push(profileUnsub);
      }
    })
    .catch((err) => console.warn('[Sync] Could not set up userProfile listeners:', err.message));
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
          //
          // B10: Only stamp creation-time fields (createdAt, completedAt,
          // joinedAt) when the record is first written ('add'). On subsequent
          // updates we leave those fields alone so the original timestamps are
          // preserved. updatedAt is always replaced with serverTimestamp().
          const data = { ...entry.data };
          delete data.id;
          const CREATION_TS_FIELDS = ['createdAt', 'completedAt', 'joinedAt'];
          if (entry.operation === 'add') {
            for (const field of CREATION_TS_FIELDS) {
              if (field in data && data[field] != null) data[field] = serverTimestamp();
            }
          }
          if ('updatedAt' in data && data.updatedAt != null) data.updatedAt = serverTimestamp();
          await setDoc(ref, data, { merge: true });
        }
        await removeSyncQueueItem(entry.id);
      } catch (err) {
        console.warn('[Sync] Failed to push entry:', err.message);
        // "Poison Pill" Prevention:
        // If the server permanently rejects the write (security rules, bad data,
        // missing document, etc.) we MUST remove it from the queue. A permanent
        // error will never succeed on retry and would deadlock all future syncs.
        //
        // B9: covers all permanent Firestore error codes, not just permission-denied.
        const PERMANENT_ERRORS = new Set([
          'permission-denied', 'invalid-argument', 'failed-precondition',
          'not-found', 'already-exists', 'unauthenticated',
        ]);
        if (PERMANENT_ERRORS.has(err.code)) {
          console.error(`[Sync] Permanent rejection (${err.code}). Removing invalid item from queue to prevent deadlock.`);
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
