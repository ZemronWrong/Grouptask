import { addRoute, initRouter, navigate } from './services/router.js';
import { onAuthChange, currentUser } from './services/authService.js';
import { openDB } from './services/indexedDBService.js';
import { initTheme } from './services/themeService.js';
import { startSync, stopSync } from './services/syncService.js';
import { renderLogin } from './features/auth/LoginPage.js';
import { renderRegister } from './features/auth/RegisterPage.js';
import { renderDashboard } from './features/dashboard/Dashboard.js';
import { renderTaskBoard, resetBoardState } from './features/tasks/TaskBoard.js';
import { renderLeaderboard, renderEvaluation } from './features/dashboard/Leaderboard.js';
import { renderMembers } from './features/members/MemberList.js';
import { renderAudit } from './features/audit/AuditHistory.js';
import { renderProfile } from './features/profile/Profile.js';
import { renderSettings } from './features/profile/Settings.js';

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

  onAuthChange((user) => {
    const path = window.location.hash.slice(1) || '/login';
    if (!user && path !== '/login' && path !== '/register') {
      stopSync();
      navigate('#/login');
    } else if (user && (path === '/login' || path === '/register' || path === '')) {
      navigate('#/dashboard');
    }
  });

  initRouter();
}
