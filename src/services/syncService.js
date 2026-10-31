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
import { fsDb, isMock } from '../config/firestoreDb.js';
import { STORES, put, remove, getSyncQueue, removeSyncQueueItem, removeSyncQueueItemIfUnchanged, get } from './indexedDBService.js';
import { resolveConflict } from './conflictResolver.js';
import { signalSyncing, signalSynced } from './connectionStatus.js';

let unsubscribers = [];
let profileUids = new Set();   // userProfiles we already listen to (E4)
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
  profileUids = new Set();
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

/** JSON with sorted keys and undefined fields dropped, so equal docs compare equal. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(',')}}`;
}

/**
 * E3: write one remote document into IndexedDB if it is a real change.
 * Returns the document id when IndexedDB changed, otherwise null:
 *   - our own local writes echoing back (hasPendingWrites) are skipped;
 *   - the remote copy must win last-write-wins and differ from the local copy
 *     (so the initial snapshot after fetchGroupDataOnce changes nothing).
 */
async function applyRemoteDoc(storeName, docSnap, removed = false) {
  if (docSnap.metadata?.hasPendingWrites) return null;
  const id = docSnap.id;
  const localDoc = await get(storeName, id).catch(() => null);
  if (removed) {
    if (!localDoc) return null;
    await remove(storeName, id).catch(() => {});
    return id;
  }
  const remoteDoc = normalizeTimestamps({ id, ...docSnap.data() });
  const { winner, doc } = resolveConflict(localDoc, remoteDoc);
  if (winner !== 'remote' || !doc) return null;
  if (localDoc && stableStringify(localDoc) === stableStringify(doc)) return null;
  await put(storeName, doc);
  return id;
}

/** Tell the active screen which documents changed (only when something did). */
function signalRemoteChange(collection, ids) {
  if (ids.length > 0 && typeof onRemoteChange === 'function') onRemoteChange({ collection, ids });
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
    const storeName = storeForCollection(colName);
    const unsub = onSnapshot(q, async (snapshot) => {
      // E3: wait for every IndexedDB write before signalling, then signal once
      const ids = await Promise.all(snapshot.docChanges().map((change) =>
        applyRemoteDoc(storeName, change.doc, change.type === 'removed')
      ));
      signalRemoteChange(colName, ids.filter(Boolean));
      // E4: members who join later get live avatar/name updates too
      if (colName === 'members') {
        snapshot.docChanges()
          .filter((change) => change.type !== 'removed')
          .forEach((change) => listenToProfile(change.doc.data().uid));
      }
    }, (err) => {
      console.warn(`[Sync] Listener error on ${colName}:`, err.message);
    });
    unsubscribers.push(unsub);
  }

  // Also listen to the group document itself (stores joinRequests, name, etc.)
  const groupUnsub = onSnapshot(fsDoc(fsDb, 'groups', groupId), async (docSnap) => {
    if (!docSnap.exists()) return;
    const id = await applyRemoteDoc(STORES.GROUPS, docSnap);
    signalRemoteChange('groups', id ? [id] : []);
  }, (err) => {
    console.warn('[Sync] Group document listener error:', err.message);
  });
  unsubscribers.push(groupUnsub);

  // userProfiles listeners are added by the members listener above, for the
  // members present now and anyone who joins later (E4).
}

/** Listen to one member's userProfile so avatar/name changes propagate in real time. */
function listenToProfile(uid) {
  if (!uid || profileUids.has(uid)) return;
  profileUids.add(uid);
  // B8: applyRemoteDoc normalizes Timestamps, so remote profile changes win LWW correctly.
  const profileUnsub = onSnapshot(fsDoc(fsDb, 'userProfiles', uid), async (docSnap) => {
    if (!docSnap.exists()) return;
    const id = await applyRemoteDoc(STORES.USER_PROFILES, docSnap);
    signalRemoteChange('userProfiles', id ? [id] : []);
  }, (err) => {
    console.warn(`[Sync] userProfile listener error for ${uid}:`, err.message);
  });
  unsubscribers.push(profileUnsub);
}

/**
 * E4: after the server refuses a write, put the local copy back to what the
 * server has, so the screen stops showing a change that never happened.
 */
async function rollBackRejected(entry) {
  const storeName = storeForCollection(entry.collection);
  if (!Object.values(STORES).includes(storeName) || storeName === STORES.SYNC_QUEUE) return;
  try {
    const snap = await getDoc(fsDoc(fsDb, entry.collection, entry.docId));
    if (snap.exists()) await put(storeName, normalizeTimestamps({ id: snap.id, ...snap.data() }));
    else if (entry.operation !== 'delete') await remove(storeName, entry.docId);
  } catch (err) {
    console.warn(`[Sync] Could not restore ${entry.collection}/${entry.docId}:`, err.message);
    return;
  }
  signalRemoteChange(entry.collection, [entry.docId]);
}

/** Tell the UI that a queued document reached the server (or was refused). */
function announce(type, entry, extra = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(type, {
    detail: { collection: entry.collection, docId: entry.docId, ...extra },
  }));
}

let flushRequested = false;

export async function flushQueue() {
  if (isSyncing) {
    // Something was queued while a flush is running: go round again afterwards
    // instead of leaving it until the next trigger.
    flushRequested = true;
    return;
  }

  if (isMock) {
    const queue = await getSyncQueue();
    if (queue.length > 0) {
      console.log('[Sync Engine Mock] Flushing mock sync queue:', queue);
      for (const entry of queue) {
        await removeSyncQueueItem(entry.id);
        announce('sync-flushed', entry);
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
        // E3: if newer edits were merged into this entry while it uploaded, it stays queued
        if (await removeSyncQueueItemIfUnchanged(entry)) announce('sync-flushed', entry);
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
          console.error(`[Sync] Permanent rejection (${err.code}) of ${entry.operation} ${entry.collection}/${entry.docId}. Dropped from the queue; it will not be retried.`, entry.data);
          // If newer edits were merged in meanwhile, they get their own try instead
          if (await removeSyncQueueItemIfUnchanged(entry)) {
            await rollBackRejected(entry);
            announce('sync-rejected', entry, { code: err.code });
          }
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
  if (flushRequested) {
    flushRequested = false;
    if (navigator.onLine) await flushQueue();
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
