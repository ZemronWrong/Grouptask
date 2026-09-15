import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth, isMock } from '../config/firebaseConfig.js';

// ── Mock Auth State Management ──
const authChangeListeners = [];

function getMockUsers() {
  return JSON.parse(localStorage.getItem('grouptask_mock_users') || '[]');
}

function saveMockUsers(users) {
  localStorage.setItem('grouptask_mock_users', JSON.stringify(users));
}

function getMockCurrentUser() {
  return JSON.parse(localStorage.getItem('grouptask_mock_current_user') || 'null');
}

function saveMockCurrentUser(user) {
  if (user) {
    localStorage.setItem('grouptask_mock_current_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('grouptask_mock_current_user');
  }
}

function triggerListeners(user) {
  for (const listener of authChangeListeners) {
    try {
      listener(user);
    } catch (err) {
      console.error('[MockAuth] Listener error:', err);
    }
  }
}

// ── Exported API ──

export function onAuthChange(callback) {
  if (isMock) {
    authChangeListeners.push(callback);
    // Call immediately with current mock user
    const current = getMockCurrentUser();
    setTimeout(() => callback(current), 0);
    return () => {
      const index = authChangeListeners.indexOf(callback);
      if (index > -1) authChangeListeners.splice(index, 1);
    };
  }

  return onAuthStateChanged(auth, callback);
}

export async function signUp(email, password, displayName) {
  if (isMock) {
    const users = getMockUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('Email already registered.');
    }
    const uid = `mock-uid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const user = { uid, email, displayName: displayName || email };
    users.push(user);
    saveMockUsers(users);
    saveMockCurrentUser(user);
    triggerListeners(user);
    return user;
  }

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

export async function signIn(email, password) {
  if (isMock) {
    const users = getMockUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      throw new Error('User not found. Try signing up.');
    }
    saveMockCurrentUser(user);
    triggerListeners(user);
    return user;
  }

  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOut() {
  if (isMock) {
    saveMockCurrentUser(null);
    triggerListeners(null);
    return;
  }

  await fbSignOut(auth);
}

export function currentUser() {
  if (isMock) {
    return getMockCurrentUser();
  }
  return auth?.currentUser || null;
}

export async function updateDisplayName(newName) {
  if (!newName) return;
  if (isMock) {
    const user = getMockCurrentUser();
    if (user) {
      user.displayName = newName;
      saveMockCurrentUser(user);
      // Also update in the users list
      const users = getMockUsers();
      const idx = users.findIndex(u => u.uid === user.uid);
      if (idx !== -1) { users[idx].displayName = newName; saveMockUsers(users); }
    }
    return;
  }
  // Real Firebase
  if (auth?.currentUser) {
    await updateProfile(auth.currentUser, { displayName: newName });
  }
}

export async function signInWithGoogle() {
  if (isMock) {
    const users = getMockUsers();
    // Simulate a deterministic mock user for Google login
    const email = 'google.user@example.com';
    let user = users.find((u) => u.email.toLowerCase() === email);
    
    if (!user) {
      user = { 
        uid: `mock-google-uid-${Date.now()}`, 
        email, 
        displayName: 'Google Mock User' 
      };
      users.push(user);
      saveMockUsers(users);
    }
    
    saveMockCurrentUser(user);
    triggerListeners(user);
    return user;
  }

  const provider = new GoogleAuthProvider();
  // Optional: Add custom parameters like prompt: 'select_account' if you want to force account selection
  // provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

