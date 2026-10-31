import { addRoute, initRouter, navigate, reloadCurrentRoute } from './services/router.js';
import { onAuthChange, currentUser } from './services/authService.js';
import { openDB, getAllByIndex, STORES } from './services/indexedDBService.js';
import { initTheme } from './services/themeService.js';
import { startSync, stopSync, setRemoteChangeCallback, fetchGroupDataOnce } from './services/syncService.js';
import { initConnectionStatus } from './services/connectionStatus.js';
import { renderLogin } from './features/auth/LoginPage.js';
import { renderRegister } from './features/auth/RegisterPage.js';
import { renderWelcome } from './features/auth/WelcomePage.js';
import { renderDashboard } from './features/dashboard/Dashboard.js';
import { renderTaskBoard, resetBoardState, refreshBoard } from './features/tasks/TaskBoard.js';
import { renderLeaderboard, renderEvaluation } from './features/dashboard/Leaderboard.js';
import { renderMembers } from './features/members/MemberList.js';
import { renderAudit } from './features/audit/AuditHistory.js';
import { renderProfile } from './features/profile/Profile.js';
import { renderSettings } from './features/profile/Settings.js';
import { bootstrapUserData } from './services/memberService.js';
import { captureScroll, restoreScroll } from './utils/helpers.js';

function requireAuth(handler) {
  return async (params) => {
    if (!currentUser()) {
      navigate('#/login');
      return;
    }
    await handler(params);
  };
}

function guestOnly(handler) {
  return async () => {
    if (currentUser()) {
      navigate('#/dashboard');
      return;
    }
    await handler();
  };
}

export async function boot() {
  initTheme();
  await openDB();
  initConnectionStatus();

  addRoute('/welcome', guestOnly(renderWelcome));
  addRoute('/login', guestOnly(renderLogin));
  addRoute('/register', guestOnly(renderRegister));
  addRoute('/dashboard', requireAuth(renderDashboard));
  addRoute('/settings', requireAuth(renderSettings));
  addRoute('/profile/:uid', requireAuth(renderProfile));
  addRoute('/profile', requireAuth(renderProfile));
  addRoute('/group/:groupId', requireAuth(async ({ groupId }) => {
    resetBoardState();
    await startSync(groupId);
    // On a new browser/device the local DB may be empty — do a one-shot Firestore
    // pull before rendering so the board shows existing tasks and members
    const existingTasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
    if (existingTasks.length === 0) {
      await fetchGroupDataOnce(groupId);
    }
    await renderTaskBoard(groupId);
  }));
  addRoute('/group/:groupId/evaluate', requireAuth(async ({ groupId }) => {
    await startSync(groupId);
    await renderEvaluation(groupId);
  }));
  addRoute('/group/:groupId/leaderboard', requireAuth(async ({ groupId }) => {
    await startSync(groupId);
    await renderLeaderboard(groupId);
  }));
  addRoute('/group/:groupId/members', requireAuth(async ({ groupId }) => {
    await startSync(groupId);
    await renderMembers(groupId);
  }));
  addRoute('/group/:groupId/audit', requireAuth(async ({ groupId }) => {
    await startSync(groupId);
    await renderAudit(groupId);
  }));

  onAuthChange(async (user) => {
    const path = window.location.hash.slice(1) || '/welcome';
    const guestPaths = ['/welcome', '/login', '/register'];
    if (!user && !guestPaths.includes(path)) {
      stopSync();
      navigate('#/login');
    } else if (user && (guestPaths.includes(path) || path === '')) {
      // Bootstrap data from Firestore for users on a new/fresh device
      await bootstrapUserData(user.uid);
      navigate('#/dashboard');
    } else if (user) {
      // Also bootstrap on any auth refresh (e.g. page reload on a new device)
      await bootstrapUserData(user.uid);
    }
  });

  // ── Remote changes (E3) ──
  // The sync engine reports { collection, ids } only for documents another
  // device really changed. Changes are batched (at most one update every
  // ~400 ms). The board patches just the affected cards; other screens
  // re-render with their scroll position kept, but not while the user is typing.
  const REMOTE_DEBOUNCE_MS = 400;
  // Collections no screen other than the board shows
  const BOARD_ONLY_COLLECTIONS = new Set(['comments', 'peerReviews', 'peerRatings', 'points']);
  const pendingChanges = new Map();   // collection -> Set of ids
  let remoteTimer = null;
  let pendingReload = false;

  function hasDirtyInputs() {
    // Check modals
    if (document.querySelector('.modal-overlay:not([hidden]), #member-popup-overlay')) return true;
    // Check any focused or non-empty text inputs/textareas not in a committed form
    const inputs = document.querySelectorAll('input[type="text"], input[type="url"], input[type="email"], textarea');
    for (const el of inputs) {
      if (el.value.trim() !== '') return true;
    }
    // Check if any radio/checkbox has been changed from its default (eval forms)
    const evalForms = document.querySelectorAll('.eval-form');
    if (evalForms.length > 0) return true;
    return false;
  }

  async function reloadKeepingScroll() {
    const scroll = captureScroll();
    await reloadCurrentRoute();
    restoreScroll(scroll);
  }

  async function applyRemoteChanges() {
    const changes = [...pendingChanges].map(([collection, ids]) => ({ collection, ids: [...ids] }));
    pendingChanges.clear();
    const path = window.location.hash.slice(1);

    const board = path.match(/^\/group\/([^/]+)$/);
    if (board) {
      await refreshBoard(board[1], changes);
      return;
    }
    if (!pendingReload && changes.every((c) => BOARD_ONLY_COLLECTIONS.has(c.collection))) return;
    if (hasDirtyInputs()) {
      // User is actively interacting — mark as pending and retry on blur
      console.info('[App] Remote change deferred: user has unsaved input.');
      pendingReload = true;
      return;
    }
    pendingReload = false;
    await reloadKeepingScroll();
  }

  function scheduleRemoteChange(change) {
    if (change?.collection) {
      if (!pendingChanges.has(change.collection)) pendingChanges.set(change.collection, new Set());
      change.ids.forEach((id) => pendingChanges.get(change.collection).add(id));
    }
    if (remoteTimer) return;  // already scheduled: this change joins the batch
    remoteTimer = setTimeout(() => {
      remoteTimer = null;
      applyRemoteChanges();
    }, REMOTE_DEBOUNCE_MS);
  }

  setRemoteChangeCallback(scheduleRemoteChange);

  // E4: our own change was refused by the server and has been put back
  // (peer reviews show this on their own card instead)
  window.addEventListener('sync-rejected', (e) => {
    const { collection } = e.detail || {};
    if (collection !== 'tasks' && collection !== 'proofSubmissions') return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = collection === 'tasks'
      ? "The server didn't accept your change to a task (you may not have permission), so it was put back."
      : "The server didn't accept your submission, so it was undone.";
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  });

  // When the user finishes interacting (blur on inputs), flush any pending reload
  document.addEventListener('blur', () => {
    if (pendingReload && !hasDirtyInputs()) {
      pendingReload = false;
      reloadKeepingScroll();
    }
  }, true);

  initRouter();
}
