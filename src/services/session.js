/**
 * session — start-up work for a signed-in user that must happen only once (F3).
 *
 * Kept tiny on purpose: it is part of the first download, and it loads
 * memberService (and with it Firestore) only when it is actually called.
 */
import { oncePerKey } from '../utils/once.js';
import { getAll, STORES } from './indexedDBService.js';

/**
 * Pull this user's groups from Firestore into IndexedDB if this device has
 * none yet. Login, Register and the auth listener all call this; it runs once
 * per user, and a call made while it is running reuses that run.
 * Resolves true if it downloaded anything.
 */
export const bootstrapUserDataOnce = oncePerKey(async (uid) => {
  const { bootstrapUserData } = await import('./memberService.js');
  return bootstrapUserData(uid);
});

/** True if this device already has at least one membership for this user. */
export async function hasLocalMemberships(uid) {
  const members = await getAll(STORES.MEMBERS);
  return members.some((m) => m.uid === uid);
}
