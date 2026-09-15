import {
  collection as fsCollection,
  doc as fsDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { fsDb, isMock } from '../config/firebaseConfig.js';

export function isFirestoreAvailable() {
  return !isMock && !!fsDb;
}

export async function upsertDocument(collection, docId, data) {
  if (!isFirestoreAvailable()) return;
  const payload = { ...data };
  delete payload.id;
  await setDoc(fsDoc(fsDb, collection, docId), payload, { merge: true });
}

export async function removeDocument(collection, docId) {
  if (!isFirestoreAvailable()) return;
  await deleteDoc(fsDoc(fsDb, collection, docId));
}

export function listenByGroupId(collection, groupId, onChange, onError) {
  if (!isFirestoreAvailable()) return () => {};
  const q = query(fsCollection(fsDb, collection), where('groupId', '==', groupId));
  return onSnapshot(q, onChange, onError);
}
