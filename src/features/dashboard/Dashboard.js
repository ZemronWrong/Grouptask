/**
 * Dashboard — Kanvera-inspired layout with Pulse panel.
 *
 * Layout:
 *   - Left: compact group list sidebar with health indicators
 *   - Right: selected group Pulse panel (activity bars, member avatars, recent events)
 */

import { currentUser, signOut } from '../../services/authService.js';
import { navigate } from '../../services/router.js';
import { STORES, get } from '../../services/indexedDBService.js';
import { getMembershipsForUser, createGroup, joinGroupByCode } from '../../services/memberService.js';
import { getGroupTasks } from '../../services/taskService.js';
import { escapeHtml, formatRelative } from '../../utils/helpers.js';
import { getTerm } from '../../services/themeService.js';
import { ICONS } from '../../assets/icons/icons.js';
import { bellIconHTML, bindBellEvents } from './Notifications.js';
import { getRecentActivity, buildDailyActivityCounts } from '../../services/activityLogService.js';

/* ── Modal helper ── */
function showModal({ title, body, confirmLabel, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog">
      <div class="modal-header"><h2>${title}</h2></div>
      <div class="modal-body">${body}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" data-close>Cancel</button>
        <button class="btn btn-primary" type="button" data-confirm>${confirmLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-close]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('[data-confirm]').addEventListener('click', async () => {
    const keepOpen = await onConfirm(overlay);
    if (!keepOpen) overlay.remove();
  });
}

/* ── Sparkline bars HTML ── */
function renderSparkline(counts) {
  const max = Math.max(...counts, 1);
  return `
    <div class="pulse-sparkline" aria-label="Activity last 7 days">
      ${counts.map((c, i) => {
        const h = Math.max(4, Math.round((c / max) * 40));
        const isToday = i === counts.length - 1;
        return `<div class="pulse-bar ${isToday ? 'today' : ''}" style="height:${h}px" title="${c} events"></div>`;
      }).join('')}
    </div>
  `;
}

/* ── Health indicator ── */
function groupHealth(recentCount, doneCount, taskCount) {
  if (recentCount >= 5 && doneCount > 0) return 'healthy';
  if (recentCount >= 1 || doneCount > 0) return 'moderate';
  return 'idle';
}

/* ── Time ago helper ── */
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── Pulse panel HTML for a group ── */
function renderPulsePanel(group, tasks, recentEvents, members) {
  const counts = buildDailyActivityCounts(recentEvents);
  const totalEvents = recentEvents.length;
  const doneThisWeek = recentEvents.filter(e => e.type === 'task_completed').length;
  const health = groupHealth(totalEvents, doneThisWeek, tasks.length);
  const doneCount = tasks.filter(t => t.status === 'done').length;
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;
  const activeMembers = [...new Set(recentEvents.slice(0, 20).map(e => e.actorId).filter(Boolean))];

  const activityFeed = recentEvents.slice(0, 8);
  
  const user = currentUser();
  const me = members.find(m => m.uid === user?.uid);
  const myRole = (group.createdBy === user?.uid) ? 'owner' : (me?.role || 'member');

  return `
    <div class="pulse-panel" data-group-id="${group.id}">
      <!-- Header -->
      <div class="pulse-panel-header">
        <div>
          <h2 class="pulse-group-name">${escapeHtml(group.name)}</h2>
          <span class="pulse-invite-code">
            ${ICONS.link} Code: <code>${escapeHtml(group.inviteCode || '—')}</code>
          </span>
        </div>
        <div class="pulse-header-actions" style="gap: 16px;">
          <span class="health-pill health-${health}">
            <span class="health-dot"></span>${health}
          </span>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" id="btn-open-board">Open Board</button>
            ${myRole === 'owner' ? `
              <button class="btn btn-danger btn-sm" id="btn-dash-delete-group" data-group-id="${group.id}" title="Delete Board">${ICONS.trash} Delete Board</button>
            ` : `
              <button class="btn btn-danger btn-sm" id="btn-dash-leave-group" data-group-id="${group.id}" title="Leave Board">${ICONS.door} Leave Board</button>
            `}
          </div>
        </div>
      </div>

      <!-- Stats Row -->
      <div class="pulse-stats-row">
        <div class="pulse-stat">
          <span class="pulse-stat-value">${tasks.length}</span>
          <span class="pulse-stat-label">${getTerm('tasks')}</span>
        </div>
        <div class="pulse-stat">
          <span class="pulse-stat-value">${doneCount}</span>
          <span class="pulse-stat-label">Done</span>
        </div>
        <div class="pulse-stat">
          <span class="pulse-stat-value">${members.length}</span>
          <span class="pulse-stat-label">Members</span>
        </div>
        <div class="pulse-stat">
          <span class="pulse-stat-value">${totalEvents}</span>
          <span class="pulse-stat-label">Events (7d)</span>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="pulse-progress-section">
        <div class="pulse-progress-label">
          <span>Overall progress</span>
          <span>${progress}%</span>
        </div>
        <div class="pulse-progress-bar">
          <div class="pulse-progress-fill" style="width:${progress}%"></div>
        </div>
      </div>

      <!-- Sparkline -->
      <div class="pulse-activity-section">
        <div class="pulse-section-title">${ICONS.trending} Activity — Last 7 Days</div>
        <div class="pulse-sparkline-wrap">
          ${renderSparkline(counts)}
          <div class="pulse-sparkline-labels">
            <span>7d ago</span><span>Today</span>
          </div>
        </div>
      </div>

      <!-- Active Members -->
      ${activeMembers.length > 0 ? `
        <div class="pulse-activity-section">
          <div class="pulse-section-title">${ICONS.users} Active This Week</div>
          <div class="pulse-active-members">
            ${activeMembers.slice(0, 6).map(actorId => {
              const m = members.find(m => m.id === actorId);
              if (!m) return '';
              const avatarContent = (m.avatarType === 'custom' && m.avatar) 
                ? `<img src="${m.avatar}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
                : (m.avatarType === 'default' && m.avatarEmoji) ? m.avatarEmoji
                : escapeHtml(m.displayName[0] || '?');
              return `<div class="pulse-avatar" title="${escapeHtml(m.displayName)}">${avatarContent}</div>`;
            }).join('')}
            ${activeMembers.length > 6 ? `<div class="pulse-avatar pulse-avatar-more">+${activeMembers.length - 6}</div>` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Recent Events Feed -->
      <div class="pulse-activity-section">
        <div class="pulse-section-title">${ICONS.clipboard} Recent Activity</div>
        ${activityFeed.length === 0 ? `
          <p class="pulse-empty">No recent activity. Start adding tasks to see your pulse!</p>
        ` : `
          <div class="pulse-feed">
            ${activityFeed.map(e => `
              <div class="pulse-feed-item">
                <div class="pulse-feed-dot type-${e.type}"></div>
                <div class="pulse-feed-body">
                  <span class="pulse-feed-desc">${escapeHtml(e.description)}</span>
                  <span class="pulse-feed-time">${timeAgo(e.createdAt)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Quick Nav -->
      <div class="pulse-quick-nav">
        <button class="pulse-nav-btn" data-href="#/group/${group.id}/members">${ICONS.users} Members</button>
        <button class="pulse-nav-btn" data-href="#/group/${group.id}/leaderboard">${ICONS.trophy} Leaderboard</button>
        <button class="pulse-nav-btn" data-href="#/group/${group.id}/audit">${ICONS.clipboard} Activity</button>
      </div>
    </div>
  `;
}

/* ── Main render ── */
export async function renderDashboard() {
  const app = document.getElementById('app');
  const user = currentUser();
  if (!user) { navigate('#/login'); return; }

  const memberships = await getMembershipsForUser(user.uid);
  const groups = [];
  for (const m of memberships) {
    const group = await get(STORES.GROUPS, m.groupId);
    if (!group) continue;
    const tasks = await getGroupTasks(group.id);
    const recentEvents = await getRecentActivity(group.id, 7);
    const members = [];
    // We'll load members lazily; just store the membership info for now
    groups.push({
      ...group,
      role: m.role,
      tasks,
      recentEvents,
      doneCount: tasks.filter(t => t.status === 'done').length,
      taskCount: tasks.length,
    });
  }

  // Load profile store for accurate name (updated by Settings page)
  const userProfile = await get(STORES.USER_PROFILES, user.uid);
  const displayName = escapeHtml(userProfile?.displayName || user.displayName || user.email || 'there');
  const bell = await bellIconHTML();
  const firstGroup = groups[0] || null;

  app.innerHTML = `
    <div class="dash-layout" style="position:relative;">
      <!-- Global Actions -->
      <div class="dash-global-actions" style="position:absolute; top:24px; right:32px; display:flex; gap:8px; z-index:100; align-items:center;">
        ${bell}
        <a class="btn-icon" href="#/profile" title="Profile">${ICONS.user}</a>
        <a class="btn-icon" href="#/settings" title="Settings">${ICONS.settings}</a>
        <button class="btn-icon" id="btn-logout" title="Sign out">${ICONS.logout}</button>
      </div>

      <!-- Left sidebar: project list -->
      <aside class="dash-sidebar">
        <div class="dash-sidebar-header">
          <a href="#/dashboard" class="dash-logo" style="text-decoration:none; color:inherit;">${ICONS.clipboard} <span>GroupTask</span></a>
        </div>

        <div class="dash-sidebar-greeting">
          <span class="dash-greeting-text">Welcome, <strong>${displayName}</strong></span>
          <span class="dash-greeting-sub">${groups.length} group${groups.length !== 1 ? 's' : ''}</span>
        </div>

        <nav class="dash-group-list" aria-label="Your groups">
          ${groups.map((g, i) => {
            const health = groupHealth(g.recentEvents.length, g.doneCount, g.taskCount);
            const progress = g.taskCount > 0 ? Math.round((g.doneCount / g.taskCount) * 100) : 0;
            return `
              <button class="dash-group-item ${i === 0 ? 'active' : ''}" data-group-id="${g.id}">
                <span class="dash-group-health health-dot-${health}"></span>
                <div class="dash-group-item-body">
                  <span class="dash-group-item-name">${escapeHtml(g.name)}</span>
                  <div class="dash-group-mini-progress">
                    <div class="dash-group-mini-fill" style="width:${progress}%"></div>
                  </div>
                  <span class="dash-group-item-meta">${g.doneCount}/${g.taskCount} done</span>
                </div>
                <span class="dash-group-item-arrow">${ICONS.back}</span>
              </button>
            `;
          }).join('')}

          <div class="dash-group-actions">
            <button class="dash-action-btn" id="btn-create-group">
              ${ICONS.plus} ${getTerm('newGroup')}
            </button>
            <button class="dash-action-btn" id="btn-join-group">
              ${ICONS.link} ${getTerm('joinGroup')}
            </button>
          </div>
        </nav>
      </aside>

      <!-- Right: Pulse panel & Main Area -->
      <main class="dash-main" id="dash-main" style="position:relative; padding-top: 12px;">
        ${firstGroup ? '' : `
          <div class="dash-empty-state">
            <div class="dash-empty-icon">${ICONS.clipboard}</div>
            <h2>No groups yet</h2>
            <p>Create or join a group to see your project pulse here.</p>
            <div style="display:flex;gap:12px;margin-top:24px;justify-content:center">
              <button class="btn btn-primary" id="btn-create-group-empty">${ICONS.plus} New Group</button>
              <button class="btn btn-secondary" id="btn-join-group-empty">${ICONS.link} Join Group</button>
            </div>
          </div>
        `}
      </main>
    </div>
  `;

  // Load first group's pulse immediately
  if (firstGroup) {
    await loadPulse(firstGroup, groups);
  }

  // Bind events
  bindBellEvents();

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await signOut();
    navigate('#/login');
  });

  // Group list switching
  app.querySelectorAll('.dash-group-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      app.querySelectorAll('.dash-group-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const groupId = btn.dataset.groupId;
      const g = groups.find(x => x.id === groupId);
      if (g) await loadPulse(g, groups);
    });
  });

  bindCreateJoin(user, groups, app);
}

async function loadPulse(group, allGroups) {
  const main = document.getElementById('dash-main');
  if (!main) return;

  // Load members for this group
  const { getAllByIndex, get } = await import('../../services/indexedDBService.js');
  const { STORES } = await import('../../services/indexedDBService.js');
  const members = await getAllByIndex(STORES.MEMBERS, 'groupId', group.id);

  for (const m of members) {
    const profile = await get(STORES.USER_PROFILES, m.uid);
    if (profile) {
      m.avatarType = profile.avatarType;
      m.avatarEmoji = profile.avatarEmoji;
      m.avatar = profile.avatar;
    }
  }

  main.innerHTML = renderPulsePanel(group, group.tasks, group.recentEvents, members);

  document.getElementById('btn-open-board')?.addEventListener('click', () => {
    navigate(`#/group/${group.id}`);
  });

  document.getElementById('btn-dash-delete-group')?.addEventListener('click', async (e) => {
    if (confirm('Are you sure you want to delete this board? This action cannot be undone.')) {
      const gId = e.currentTarget.dataset.groupId;
      const { remove, addToSyncQueue } = await import('../../services/indexedDBService.js');
      await remove(STORES.GROUPS, gId);
      await addToSyncQueue({ collection: 'groups', docId: gId, operation: 'delete' });
      navigate('#/dashboard');
      window.location.reload(); // Refresh to remove from list
    }
  });

  document.getElementById('btn-dash-leave-group')?.addEventListener('click', async (e) => {
    if (confirm('Are you sure you want to leave this group?')) {
      const user = currentUser();
      const membersList = await getAllByIndex(STORES.MEMBERS, 'groupId', group.id);
      const me = membersList.find(m => m.uid === user.uid);
      if (me) {
        const { remove, addToSyncQueue } = await import('../../services/indexedDBService.js');
        await remove(STORES.MEMBERS, me.id);
        await addToSyncQueue({ collection: 'members', docId: me.id, operation: 'delete' });
      }
      navigate('#/dashboard');
      window.location.reload(); // Refresh to remove from list
    }
  });

  main.querySelectorAll('.pulse-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.href));
  });
}

function bindCreateJoin(user, groups, app) {
  const bindCreate = (id) => {
    app.querySelector(`#${id}`)?.addEventListener('click', () => {
      showModal({
        title: getTerm('newGroup'),
        confirmLabel: 'Create',
        body: `<div class="form-group"><label for="new-group-name">Name</label>
          <input id="new-group-name" type="text" placeholder="${escapeHtml(getTerm('groupNamePlaceHolder'))}" /></div>`,
        onConfirm: async (overlay) => {
          const name = overlay.querySelector('#new-group-name').value.trim();
          if (!name) return true;
          const pf = await (await import('../../services/indexedDBService.js')).get(STORES.USER_PROFILES, user.uid);
          const group = await createGroup({ name, createdBy: user.uid, displayName: pf?.displayName || user.displayName || user.email });
          navigate(`#/group/${group.id}`);
        },
      });
    });
  };

  const bindJoin = (id) => {
    app.querySelector(`#${id}`)?.addEventListener('click', () => {
      showModal({
        title: getTerm('joinGroup'),
        confirmLabel: 'Join',
        body: `<div class="form-group"><label for="join-code">Invite code</label>
          <input id="join-code" type="text" placeholder="ABC12345" /></div>
          <p class="auth-error" id="join-error"></p>`,
        onConfirm: async (overlay) => {
          const code = overlay.querySelector('#join-code').value.trim();
          const errorEl = overlay.querySelector('#join-error');
          try {
            const pf = await (await import('../../services/indexedDBService.js')).get(STORES.USER_PROFILES, user.uid);
            const group = await joinGroupByCode({ inviteCode: code, uid: user.uid, displayName: pf?.displayName || user.displayName || user.email });
            navigate(`#/group/${group.id}`);
          } catch (err) {
            errorEl.textContent = err.message || 'Could not join.';
            return true;
          }
        },
      });
    });
  };

  bindCreate('btn-create-group');
  bindCreate('btn-create-group-empty');
  bindJoin('btn-join-group');
  bindJoin('btn-join-group-empty');
}
