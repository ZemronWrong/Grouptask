/**
 * Dashboard — Kanvera-inspired layout with Pulse panel.
 *
 * Layout:
 *   - Left: compact group list sidebar with health indicators
 *   - Right: selected group Pulse panel (activity bars, member avatars, recent events)
 */

import { currentUser, signOut } from '../../services/authService.js';
import { navigate } from '../../services/router.js';
import { STORES, get, getAllByIndex, remove, addToSyncQueue } from '../../services/indexedDBService.js';
import { getMembershipsForUser, createGroup, joinGroupByCode, leaveGroup, sendJoinRequest } from '../../services/memberService.js';
import { flushQueue, stopSync } from '../../services/syncService.js';
import { getGroupTasks } from '../../services/taskService.js';
import { escapeHtml, formatRelative, formatTimeAgo } from '../../utils/helpers.js';
import { getTerm } from '../../services/themeService.js';
import { ICONS } from '../../assets/icons/icons.js';
import { bellIconHTML, bindBellEvents } from './Notifications.js';
import { getRecentActivity, buildDailyActivityCounts } from '../../services/activityLogService.js';
import { showToast, confirmDialog, withBusy, isBusyButton } from '../../utils/ui.js';
import { authErrorMessage } from '../../utils/errors.js';

/* ── Modal helper ── */
// A form, so Enter in its field submits it (F4); the confirm button shows
// "Saving…" and ignores double clicks while onConfirm runs.
function showModal({ title, body, confirmLabel, busyLabel = 'Saving…', onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <form class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" novalidate>
      <div class="modal-header"><h2>${escapeHtml(title)}</h2></div>
      <div class="modal-body">${body}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" data-close>Cancel</button>
        <button class="btn btn-primary" type="submit" data-confirm>${confirmLabel}</button>
      </div>
    </form>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-close]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const confirmBtn = overlay.querySelector('[data-confirm]');
    if (isBusyButton(confirmBtn)) return;
    const keepOpen = await withBusy(confirmBtn, () => onConfirm(overlay), { label: busyLabel });
    if (!keepOpen) overlay.remove();
  });
  return overlay;
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

/* ── Pulse panel HTML for a group ── */
function renderPulsePanel(group, tasks, recentEvents, members) {
  const counts = buildDailyActivityCounts(recentEvents);
  const totalEvents = recentEvents.length;
  const doneThisWeek = recentEvents.filter(e => e.type === 'task_completed').length;
  const health = groupHealth(totalEvents, doneThisWeek, tasks.length);
  const doneCount = tasks.filter(t => t.status === 'done').length;
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  // Collect all unique members with activity or task contributions in the last 7 days
  const activeMemberIds = new Set();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const e of recentEvents) {
    if (e.actorId) {
      const m = members.find(m => m.id === e.actorId || m.uid === e.actorId);
      if (m) activeMemberIds.add(m.id);
    } else if (e.actorName) {
      const m = members.find(m => m.displayName === e.actorName);
      if (m) activeMemberIds.add(m.id);
    }
  }

  for (const t of tasks) {
    if (t.updatedAt && t.updatedAt >= sevenDaysAgo && t.assignedTo) {
      const m = members.find(m => m.id === t.assignedTo || m.uid === t.assignedTo);
      if (m) activeMemberIds.add(m.id);
    }
    if (t.completedAt && t.completedAt >= sevenDaysAgo && t.assignedTo) {
      const m = members.find(m => m.id === t.assignedTo || m.uid === t.assignedTo);
      if (m) activeMemberIds.add(m.id);
    }
  }

  const activeMembers = [...activeMemberIds].map(id => members.find(m => m.id === id)).filter(Boolean);
  const displayActiveMembers = activeMembers.length > 0 ? activeMembers : members;

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
      ${displayActiveMembers.length > 0 ? `
        <div class="pulse-activity-section">
          <div class="pulse-section-title">${ICONS.users} Active This Week</div>
          <div class="pulse-active-members">
            ${displayActiveMembers.slice(0, 6).map(m => {
              const avatarContent = (m.avatarType === 'custom' && m.avatar) 
                ? `<img src="${m.avatar}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
                : (m.avatarType === 'default' && m.avatarEmoji) ? m.avatarEmoji
                : escapeHtml(m.displayName?.[0] || '?');
              return `<a href="#/profile/${m.uid || m.id}" class="pulse-avatar" title="${escapeHtml(m.displayName)} (Click to view achievements)" style="text-decoration:none; cursor:pointer;">${avatarContent}</a>`;
            }).join('')}
            ${displayActiveMembers.length > 6 ? `<div class="pulse-avatar pulse-avatar-more">+${displayActiveMembers.length - 6}</div>` : ''}
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
                  <span class="pulse-feed-time">${formatTimeAgo(e.createdAt)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Quick Nav -->
      <div class="pulse-quick-nav">
        <button class="pulse-nav-btn" data-href="#/group/${group.id}/members">${ICONS.users} Team</button>
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
        <a class="btn-icon" href="#/profile" title="Profile" aria-label="Profile">${ICONS.user}</a>
        <a class="btn-icon" href="#/settings" title="Settings" aria-label="Settings">${ICONS.settings}</a>
        <button class="btn-icon" id="btn-logout" title="Sign out" aria-label="Sign out">${ICONS.logout}</button>
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
            <h2>Welcome! Let's get your group started</h2>
            <p>You're not in a group yet. Pick one to begin:</p>
            <div class="dash-empty-choices">
              <button class="dash-empty-choice" type="button" id="btn-create-group-empty">
                <span class="dash-empty-choice-icon">${ICONS.plus}</span>
                <span class="dash-empty-choice-title">${escapeHtml(getTerm('newGroup'))}</span>
                <span class="dash-empty-choice-text">You'll be the leader: you add tasks, set their weights and approve finished work.</span>
              </button>
              <button class="dash-empty-choice" type="button" id="btn-join-group-empty">
                <span class="dash-empty-choice-icon">${ICONS.link}</span>
                <span class="dash-empty-choice-title">Join with a code</span>
                <span class="dash-empty-choice-text">Your leader shares an invite code. Enter it to join their group's board.</span>
              </button>
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

  const deleteBtn = document.getElementById('btn-dash-delete-group');
  deleteBtn?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete this board?',
      message: `"${group.name}" and all its tasks will be deleted for everyone in the group. This can't be undone.`,
      confirmLabel: 'Delete board',
    });
    if (!ok) return;
    await withBusy(deleteBtn, async () => {
      const gId = deleteBtn.dataset.groupId;
      await remove(STORES.GROUPS, gId);
      await addToSyncQueue({ collection: 'groups', docId: gId, operation: 'delete' });
      await flushQueue();
      stopSync();
      navigate('#/dashboard');
      await renderDashboard(); // E3: re-render the list instead of reloading the page
    }, { label: 'Deleting…' });
  });

  const leaveBtn = document.getElementById('btn-dash-leave-group');
  leaveBtn?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Leave this group?',
      message: `You will lose access to "${group.name}". You can join again later with the invite code.`,
      confirmLabel: 'Leave group',
    });
    if (!ok) return;
    await withBusy(leaveBtn, async () => {
      const user = currentUser();
      const membersList = await getAllByIndex(STORES.MEMBERS, 'groupId', group.id);
      const me = membersList.find(m => m.uid === user.uid);
      if (me) {
        await leaveGroup(group.id, me);
      }
      stopSync();
      navigate('#/dashboard');
      await renderDashboard(); // E3: re-render the list instead of reloading the page
    }, { label: 'Leaving…' });
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
        busyLabel: 'Creating…',
        body: `<div class="form-group"><label for="new-group-name">Name</label>
          <input id="new-group-name" type="text" autocomplete="off" placeholder="${escapeHtml(getTerm('groupNamePlaceHolder'))}" /></div>
          <p class="auth-error" id="create-error" role="alert"></p>`,
        onConfirm: async (overlay) => {
          const name = overlay.querySelector('#new-group-name').value.trim();
          const errorEl = overlay.querySelector('#create-error');
          if (!name) { errorEl.textContent = 'Please give your group a name.'; return true; }
          try {
            const pf = await get(STORES.USER_PROFILES, user.uid);
            const group = await createGroup({ name, createdBy: user.uid, displayName: pf?.displayName || user.displayName || user.email });
            navigate(`#/group/${group.id}`);
          } catch (err) {
            errorEl.textContent = authErrorMessage(err, 'Could not create the group. Please try again.');
            return true;
          }
        },
      });
    });
  };

  const bindJoin = (id) => {
    app.querySelector(`#${id}`)?.addEventListener('click', () => {
      const overlay = showModal({
        title: getTerm('joinGroup'),
        confirmLabel: 'Join Directly',
        busyLabel: 'Joining…',
        body: `<div class="form-group"><label for="join-code">Invite code</label>
          <input id="join-code" type="text" autocomplete="off" placeholder="ABC12345" />
          </div>
          <div style="display:flex; gap:8px; margin-top:12px;">
            <button class="btn btn-secondary btn-sm" type="button" id="btn-request-join" style="flex:1; font-weight:600;">📬 Request to Join</button>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">
            <strong>Join Directly</strong> — adds you immediately using the invite code.<br>
            <strong>Request to Join</strong> — sends a request to the board owner for approval.
          </p>
          <p class="auth-error" id="join-error" role="alert"></p>`,
        onConfirm: async (overlay) => {
          const code = overlay.querySelector('#join-code').value.trim();
          const errorEl = overlay.querySelector('#join-error');
          if (isBusyButton(overlay.querySelector('#btn-request-join'))) return true;
          if (!code) { errorEl.textContent = 'Please enter an invite code.'; return true; }
          try {
            const pf = await get(STORES.USER_PROFILES, user.uid);
            const group = await joinGroupByCode({ inviteCode: code, uid: user.uid, displayName: pf?.displayName || user.displayName || user.email });
            navigate(`#/group/${group.id}`);
          } catch (err) {
            errorEl.textContent = authErrorMessage(err, 'Could not join. Check the code and try again.');
            return true;
          }
        },
      });

      const requestBtn = overlay.querySelector('#btn-request-join');
      requestBtn.addEventListener('click', async () => {
        const code = overlay.querySelector('#join-code').value.trim();
        const errorEl = overlay.querySelector('#join-error');
        if (!code) { errorEl.textContent = 'Please enter an invite code.'; return; }
        if (isBusyButton(overlay.querySelector('[data-confirm]'))) return;
        await withBusy(requestBtn, async () => {
          try {
            const pf = await get(STORES.USER_PROFILES, user.uid);
            await sendJoinRequest({
              inviteCode: code,
              uid: user.uid,
              displayName: pf?.displayName || user.displayName || user.email,
              email: pf?.email || user.email || null,
            });
            overlay.remove();
            showToast('📬 Join request sent! The board owner will review it.', { type: 'success' });
          } catch (err) {
            errorEl.textContent = authErrorMessage(err, 'Could not send the request. Please try again.');
          }
        }, { label: 'Sending…' });
      });
    });
  };


  bindCreate('btn-create-group');
  bindCreate('btn-create-group-empty');
  bindJoin('btn-join-group');
  bindJoin('btn-join-group-empty');
}
