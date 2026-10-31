import { addRoute, initRouter, navigate, reloadCurrentRoute } from './services/router.js';
import { onAuthChange, currentUser, authReady } from './services/authService.js';
import { openDB, getAllByIndex, STORES } from './services/indexedDBService.js';
import { initTheme } from './services/themeService.js';
import { initConnectionStatus, setConnectionStatusVisible } from './services/connectionStatus.js';
import { bootstrapUserDataOnce, hasLocalMemberships } from './services/session.js';
import { renderLogin } from './features/auth/LoginPage.js';
import { renderRegister } from './features/auth/RegisterPage.js';
import { renderWelcome } from './features/auth/WelcomePage.js';
import { captureScroll, restoreScroll } from './utils/helpers.js';
import { screenSkeletonHTML } from './utils/skeletons.js';
import { showToast, initModalKeyboard } from './utils/ui.js';
import { syncRejectedMessage } from './utils/errors.js';

const GUEST_PATHS = ['/welcome', '/login', '/register'];

// F3: each signed-in screen is its own chunk, downloaded the first time it is
// opened, so the welcome/login/register pages don't load Firestore, Chart.js or the board.
const screens = {
  dashboard:   () => import('./features/dashboard/Dashboard.js'),
  board:       () => import('./features/tasks/TaskBoard.js'),
  leaderboard: () => import('./features/dashboard/Leaderboard.js'),
  members:     () => import('./features/members/MemberList.js'),
  audit:       () => import('./features/audit/AuditHistory.js'),
  profile:     () => import('./features/profile/Profile.js'),
  settings:    () => import('./features/profile/Settings.js'),
};

// The sync engine (and Firestore with it) loads once someone is signed in.
let syncModule = null;
let onRemoteChange = null;

function loadSync() {
  syncModule ??= import('./services/syncService.js').then((sync) => {
    sync.setRemoteChangeCallback((change) => onRemoteChange?.(change));
    // Upload anything saved on this device before the engine loaded
    if (navigator.onLine) sync.flushQueue();
    return sync;
  });
  return syncModule;
}

/** Start live sync for a group without holding up the screen (its first flush waits on the network). */
function syncGroup(groupId) {
  loadSync().then((sync) => sync.startSync(groupId)).catch((err) => console.warn('[Sync] Could not start:', err.message));
}

function requireAuth(handler) {
  return async (params) => {
    if (!currentUser()) {
      navigate('#/login');
      return;
    }
    setConnectionStatusVisible(true);
    await handler(params);
  };
}

function guestOnly(handler) {
  return async () => {
    if (currentUser()) {
      navigate('#/dashboard');
      return;
    }
    setConnectionStatusVisible(false);
    renderedPath = window.location.hash.slice(1);
    await handler();
  };
}

// ── Skeletons (F3) ──
// Opening a screen shows a skeleton only if it takes longer than a moment, so
// fast screens don't flash. Re-rendering the screen already shown never does.
const SKELETON_DELAY_MS = 120;
let renderedPath = null;

function showSkeletonNow(kind) {
  document.getElementById('app').innerHTML = screenSkeletonHTML(kind);
}

async function showScreen(kind, render) {
  const path = window.location.hash.slice(1);
  const timer = path === renderedPath ? null : setTimeout(() => showSkeletonNow(kind), SKELETON_DELAY_MS);
  try {
    await render();
  } finally {
    clearTimeout(timer);
    renderedPath = path;
  }
}

/** Fetch the board's code while the dashboard is idle, so opening a group is instant. */
function prefetchBoard() {
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
  idle(() => { screens.board().catch(() => {}); });
}

export async function boot() {
  initTheme();
  await openDB();
  initConnectionStatus();
  initModalKeyboard();

  addRoute('/welcome', guestOnly(renderWelcome));
  addRoute('/login', guestOnly(renderLogin));
  addRoute('/register', guestOnly(renderRegister));
  addRoute('/dashboard', requireAuth(() => showScreen('dashboard', async () => {
    const uid = currentUser().uid;
    // F3: only a device with no local data waits for the download
    if (!(await hasLocalMemberships(uid))) {
      showSkeletonNow('dashboard');
      await bootstrapUserDataOnce(uid).catch(() => {});
    }
    const { renderDashboard } = await screens.dashboard();
    await renderDashboard();
    prefetchBoard();
  })));
  addRoute('/settings', requireAuth(() => showScreen('page', async () => {
    await (await screens.settings()).renderSettings();
  })));
  addRoute('/profile/:uid', requireAuth((params) => showScreen('page', async () => {
    await (await screens.profile()).renderProfile(params);
  })));
  addRoute('/profile', requireAuth((params) => showScreen('page', async () => {
    await (await screens.profile()).renderProfile(params);
  })));
  addRoute('/group/:groupId', requireAuth(({ groupId }) => showScreen('board', async () => {
    const [board, sync] = await Promise.all([screens.board(), loadSync()]);
    board.resetBoardState();
    syncGroup(groupId);
    // On a new browser/device the local DB may be empty — show the board's
    // skeleton and do a one-shot Firestore pull so it opens with existing tasks
    const existingTasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
    if (existingTasks.length === 0) {
      showSkeletonNow('board');
      await sync.fetchGroupDataOnce(groupId);
    }
    await board.renderTaskBoard(groupId);
  })));
  addRoute('/group/:groupId/evaluate', requireAuth(({ groupId }) => showScreen('page', async () => {
    syncGroup(groupId);
    await (await screens.leaderboard()).renderEvaluation(groupId);
  })));
  addRoute('/group/:groupId/leaderboard', requireAuth(({ groupId }) => showScreen('page', async () => {
    syncGroup(groupId);
    await (await screens.leaderboard()).renderLeaderboard(groupId);
  })));
  addRoute('/group/:groupId/members', requireAuth(({ groupId }) => showScreen('page', async () => {
    syncGroup(groupId);
    await (await screens.members()).renderMembers(groupId);
  })));
  addRoute('/group/:groupId/audit', requireAuth(({ groupId }) => showScreen('page', async () => {
    syncGroup(groupId);
    await (await screens.audit()).renderAudit(groupId);
  })));

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
    if (document.querySelector('.modal-overlay:not([hidden]), #member-popup-overlay, .confirm-overlay')) return true;
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
      await (await screens.board()).refreshBoard(board[1], changes);
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

  onRemoteChange = scheduleRemoteChange;

  /** F3: the background download brought new data; show it without a flash. */
  function refreshAfterDownload() {
    if (!currentUser() || !renderedPath || GUEST_PATHS.includes(renderedPath)) return;
    if (hasDirtyInputs()) { pendingReload = true; return; }
    reloadKeepingScroll();
  }

  // E4: our own change was refused by the server and has been put back
  // (peer reviews show this on their own card instead)
  window.addEventListener('sync-rejected', (e) => {
    const { collection, code } = e.detail || {};
    const message = syncRejectedMessage(collection, code);
    if (message) showToast(message, { type: 'error' });
  });

  // When the user finishes interacting (blur on inputs), flush any pending reload
  document.addEventListener('blur', () => {
    if (pendingReload && !hasDirtyInputs()) {
      pendingReload = false;
      reloadKeepingScroll();
    }
  }, true);

  // F3: wait until the saved sign-in is restored before routing, so a reload
  // opens the screen it was on instead of bouncing through #/login
  await authReady();

  onAuthChange((user) => {
    const path = window.location.hash.slice(1) || '/welcome';
    if (!user) {
      syncModule?.then((sync) => sync.stopSync());
      bootstrapUserDataOnce.reset();
      if (!GUEST_PATHS.includes(path)) navigate('#/login');
      return;
    }
    loadSync();
    // F3: download this user's groups once, in the background. Only a device
    // with no local data waits for it (the dashboard route shows skeletons).
    bootstrapUserDataOnce(user.uid).then((downloaded) => {
      if (downloaded) refreshAfterDownload();
    }).catch(() => { /* offline or refused: the next sign-in or reload tries again */ });
    if (GUEST_PATHS.includes(path) || path === '') navigate('#/dashboard');
  });

  initRouter();
}
