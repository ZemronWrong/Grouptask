import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyD2dITOZjKN8KLe7oJZi1xNq6rAyowap1Q',
  authDomain: 'groupttask.firebaseapp.com',
  projectId: 'groupttask',
  storageBucket: 'groupttask.firebasestorage.app',
  messagingSenderId: '370234607749',
  appId: '1:370234607749:web:cd416a403b835ad2b441ec',
  measurementId: 'G-T4LSZ0X9TV',
};

const isMock = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY';

let app = null;
let fsDb = null;
let auth = null;
let analytics = null;

if (!isMock) {
  try {
    app = initializeApp(firebaseConfig);
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
    console.error('[Firebase] Failed to initialize Firebase:', err);
  }
}

export { app, fsDb, auth, analytics, isMock };
