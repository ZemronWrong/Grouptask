import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
// Analytics removed (UREB A5): no usage data may be sent to third-party services during the study.

// Vite exposes VITE_* variables via import.meta.env.
// Locally these come from .env.local; on Vercel set them in the dashboard.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  // measurementId removed — analytics disabled (UREB A5)
};

// Falls back to mock mode if no env vars are present (e.g. running tests locally
// without a .env.local file, or a fork without credentials).
const isMock = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY';

let app  = null;
let fsDb = null;
let auth = null;

if (!isMock) {
  try {
    app  = initializeApp(firebaseConfig);
    // B9: ignoreUndefinedProperties prevents local undefined values from throwing errors on setDoc
    fsDb = initializeFirestore(app, { ignoreUndefinedProperties: true });
    auth = getAuth(app);

    // NOTE: enableIndexedDbPersistence is intentionally NOT called here.
    // This app uses its own IndexedDB sync queue (syncService.js) as the
    // single source of truth for offline resilience. Running Firestore's
    // built-in persistence alongside the custom queue creates duplicate
    // write paths and race conditions on reconnect. One system only.
  } catch (err) {
    console.error('[Firebase] Failed to initialize:', err);
  }
}

export { app, fsDb, auth, isMock };
