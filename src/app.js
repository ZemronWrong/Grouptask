import { addRoute, initRouter, navigate, reloadCurrentRoute } from './services/router.js';
import { onAuthChange, currentUser } from './services/authService.js';
import { openDB, getAllByIndex, STORES } from './services/indexedDBService.js';
import { initTheme } from './services/themeService.js';
import { startSync, stopSync, setRemoteChangeCallback, fetchGroupDataOnce } from './services/syncService.js';
import { initConnectionStatus } from './services/connectionStatus.js';
import { renderLogin } from './features/auth/LoginPage.js';
import { renderRegister } from './features/auth/RegisterPage.js';
import { renderDashboard } from './features/dashboard/Dashboard.js';
import { renderTaskBoard, resetBoardState } from './features/tasks/TaskBoard.js';
import { renderLeaderboard, renderEvaluation } from './features/dashboard/Leaderboard.js';
import { renderMembers } from './features/members/MemberList.js';
import { renderAudit } from './features/audit/AuditHistory.js';
import { renderProfile } from './features/profile/Profile.js';
import { renderSettings } from './features/profile/Settings.js';
import { bootstrapUserData } from './services/memberService.js';

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
    const path = window.location.hash.slice(1) || '/login';
    if (!user && path !== '/login' && path !== '/register') {
      stopSync();
      navigate('#/login');
    } else if (user && (path === '/login' || path === '/register' || path === '')) {
      // Bootstrap data from Firestore for users on a new/fresh device
      await bootstrapUserData(user.uid);
      navigate('#/dashboard');
    } else if (user) {
      // Also bootstrap on any auth refresh (e.g. page reload on a new device)
      await bootstrapUserData(user.uid);
    }
  });

  // When Firestore pushes new data to IndexedDB, refresh the active screen
  let reloadTimeout = null;
  let pendingReload = false;

  function hasDirtyInputs() {
    // Check modals
    if (document.querySelector('.modal-overlay:not([hidden])')) return true;
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

  function scheduleReload() {
    if (reloadTimeout) clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(() => {
      if (hasDirtyInputs()) {
        // User is actively interacting — mark as pending and retry soon
        console.info('[App] Remote change deferred: user has unsaved input.');
        pendingReload = true;
        return;
      }
      pendingReload = false;
      reloadCurrentRoute();
    }, 300);
  }

  setRemoteChangeCallback(scheduleReload);

  // When the user finishes interacting (blur on inputs), flush any pending reload
  document.addEventListener('blur', () => {
    if (pendingReload && !hasDirtyInputs()) {
      pendingReload = false;
      reloadCurrentRoute();
    }
  }, true);

  initRouter();
}
