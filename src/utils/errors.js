/**
 * F5: plain-sentence error messages instead of Firebase's codes
 * ("Firebase: Error (auth/invalid-credential).").
 */

const AUTH_MESSAGES = {
  'auth/invalid-credential':          'The email or password is wrong. Please try again.',
  'auth/invalid-login-credentials':   'The email or password is wrong. Please try again.',
  'auth/wrong-password':              'That password is wrong. Please try again.',
  'auth/user-not-found':              'There is no account with that email. Register first.',
  'auth/email-already-in-use':        'That email is already registered. Sign in instead.',
  'auth/weak-password':               'That password is too short. Use at least 6 characters.',
  'auth/missing-password':            'Please enter your password.',
  'auth/invalid-email':               "That email address doesn't look right.",
  'auth/missing-email':               'Please enter your email address.',
  'auth/network-request-failed':      'No internet connection. Check your connection and try again.',
  'auth/too-many-requests':           'Too many attempts. Please wait a few minutes and try again.',
  'auth/user-disabled':               'This account has been turned off. Ask the study team for help.',
  'auth/popup-blocked':               'The Google sign-in window was blocked. Allow pop-ups for this site and try again.',
  'auth/account-exists-with-different-credential': 'That email already has an account. Sign in with your email and password.',
  // Closing the Google window yourself isn't an error worth a message
  'auth/popup-closed-by-user':        '',
  'auth/cancelled-popup-request':     '',
};

const OFFLINE_MESSAGE = 'No internet connection. Check your connection and try again.';

/**
 * A message to show for a sign-in/registration error. Returns '' when nothing
 * should be shown. `online` is passed in so tests don't need a browser.
 */
export function authErrorMessage(err, fallback = 'Something went wrong. Please try again.', online = typeof navigator === 'undefined' ? true : navigator.onLine) {
  const code = err?.code;
  if (code && code in AUTH_MESSAGES) return AUTH_MESSAGES[code];
  if (!online) return OFFLINE_MESSAGE;
  const message = err?.message || '';
  // Our own errors (Mock Mode, invite codes) are already plain sentences
  if (message && !/firebase|auth\/|\(.*\/.*\)/i.test(message)) return message;
  return fallback;
}

/** What to tell the user when the server refused one of their changes (E4 roll-back). */
export function syncRejectedMessage(collection, code) {
  const why = code === 'permission-denied' || code === 'unauthenticated'
    ? " (you don't have permission for this)"
    : '';
  switch (collection) {
    case 'tasks':            return `The server didn't accept your change to a task${why}, so it was put back.`;
    case 'proofSubmissions': return `The server didn't accept your submission${why}, so it was undone.`;
    case 'comments':         return `The server didn't accept your comment${why}, so it was removed.`;
    default:                 return null;  // other screens show their own status
  }
}
