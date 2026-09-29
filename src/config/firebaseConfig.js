import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Vite exposes VITE_* variables via import.meta.env.
// Locally these come from .env.local; on Vercel set them in the dashboard.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Falls back to mock mode if no env vars are present (e.g. running tests locally
// without a .env.local file, or a fork without credentials).
const isMock = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY';

let app     = null;
let fsDb    = null;
let auth    = null;
let analytics = null;

if (!isMock) {
  try {
    app  = initializeApp(firebaseConfig);
    fsDb = getFirestore(app);
    auth = getAuth(app);

    if (typeof window !== 'undefined') {
      try {
        analytics = getAnalytics(app);
      } catch (err) {
        console.warn('[Firebase] Analytics unavailable:', err.message);
      }
    }

    enableIndexedDbPersistence(fsDb).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('[Firebase] Persistence unavailable — multiple tabs open.');
      } else if (err.code === 'unimplemented') {
        console.warn('[Firebase] Persistence not supported in this browser.');
      }
    });
  } catch (err) {
    console.error('[Firebase] Failed to initialize:', err);
  }
}

export { app, fsDb, auth, analytics, isMock };
