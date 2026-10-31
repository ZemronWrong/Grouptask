import { initializeFirestore } from 'firebase/firestore';
import { app, isMock } from './firebaseConfig.js';

let fsDb = null;

if (!isMock && app) {
  try {
    // B9: ignoreUndefinedProperties prevents local undefined values from throwing errors on setDoc
    fsDb = initializeFirestore(app, { ignoreUndefinedProperties: true });

    // NOTE: enableIndexedDbPersistence is intentionally NOT called here.
    // This app uses its own IndexedDB sync queue (syncService.js) as the
    // single source of truth for offline resilience. Running Firestore's
    // built-in persistence alongside the custom queue creates duplicate
    // write paths and race conditions on reconnect. One system only.
  } catch (err) {
    console.error('[Firebase] Failed to initialize Firestore:', err);
  }
}

export { fsDb, isMock };
