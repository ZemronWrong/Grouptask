import { onAuthChange, currentUser, signOut } from '../services/authService.js';

export function useAuth(onUser) {
  return onAuthChange(onUser);
}

export { currentUser, signOut };
