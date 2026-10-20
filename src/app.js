import { addRoute, initRouter, navigate, reloadCurrentRoute } from './services/router.js';
import { onAuthChange, currentUser } from './services/authService.js';
import { openDB } from './services/indexedDBService.js';
import { initTheme } from './services/themeService.js';
import { startSync, stopSync, setRemoteChangeCallback } from './services/syncService.js';
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
  addRoute('/profile', requireAuth(renderProfile));
  addRoute('/group/:groupId', requireAuth(async ({ groupId }) => {
    resetBoardState();
    await startSync(groupId);
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
  setRemoteChangeCallback(() => {
    // Prevent violent refreshes if the user is typing inside a modal
    const isModalOpen = document.querySelector('.modal-overlay:not([hidden])');
    if (isModalOpen) {
      console.info('[App] Remote change received, but delaying UI refresh because a modal is open.');
      return;
    }
    
    // Debounce the reload to prevent UI flickering on burst updates (like initial load)
    if (reloadTimeout) clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(() => {
      reloadCurrentRoute();
    }, 300);
  });

  initRouter();
}
