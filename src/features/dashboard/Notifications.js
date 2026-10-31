/**
 * Notifications UI — Bell icon dropdown with notification list.
 */

import { currentUser } from '../../services/authService.js';
import { escapeHtml, formatTimeAgo } from '../../utils/helpers.js';
import { navigate } from '../../services/router.js';
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead } from '../../services/notificationService.js';
import { ICONS } from '../../assets/icons/icons.js';
import { skeletonListHTML } from '../../utils/skeletons.js';
import { showToast } from '../../utils/ui.js';

/* ── Notification type → SVG icon ── */
function notifIcon(type) {
  const map = {
    task_assigned:     ICONS.clipboard,
    task_completed:    ICONS.done,
    approval_request:  ICONS.alert,
    approval_granted:  ICONS.checkAll,
    approval_rejected: ICONS.close,
    peer_eval_reminder:ICONS.users,
    evaluation_received:ICONS.star,
    badge_earned:      ICONS.trophy,
    free_rider_alert:  ICONS.alert,
    member_joined:     ICONS.users,
    member_left:       ICONS.door,
  };
  return map[type] || ICONS.bell;
}

/**
 * Render the bell icon HTML for the header bar.
 */
export async function bellIconHTML() {
  const user = currentUser();
  if (!user) return '';
  const count = await getUnreadCount(user.uid);
  return `
    <div class="notif-bell-container" id="notif-bell-container">
      <button class="btn-icon notif-bell-btn" id="btn-notifications" title="Notifications" aria-label="Notifications">
        ${ICONS.bell}
        ${count > 0 ? `<span class="notif-badge-count">${count > 9 ? '9+' : count}</span>` : ''}
      </button>
      <div class="notif-dropdown" id="notif-dropdown" hidden>
        <div class="notif-dropdown-header">
          <span class="notif-dropdown-title">${ICONS.bell} Notifications</span>
          <button class="btn-icon-sm" id="btn-mark-all-read" title="Mark all as read" aria-label="Mark all as read">
            ${ICONS.checkAll} Read All
          </button>
        </div>
        <div class="notif-filter-bar">
          <button class="notif-filter-btn active" data-filter="all">All</button>
          <button class="notif-filter-btn" data-filter="tasks">Tasks</button>
          <button class="notif-filter-btn" data-filter="evaluations">Eval</button>
          <button class="notif-filter-btn" data-filter="system">System</button>
        </div>
        <div class="notif-list" id="notif-list">
          ${skeletonListHTML(3)}
        </div>
      </div>
    </div>
  `;
}

const FILTER_MAP = {
  all: () => true,
  tasks: (n) => ['task_assigned', 'task_completed', 'approval_request', 'approval_granted', 'approval_rejected'].includes(n.type),
  evaluations: (n) => ['peer_eval_reminder', 'evaluation_received'].includes(n.type),
  system: (n) => ['badge_earned', 'free_rider_alert', 'member_joined', 'member_left'].includes(n.type),
};

/**
 * Bind bell icon events. Call after rendering the header.
 */
export function bindBellEvents() {
  const bellBtn = document.getElementById('btn-notifications');
  const dropdown = document.getElementById('notif-dropdown');
  const container = document.getElementById('notif-bell-container');
  if (!bellBtn || !dropdown) return;

  let currentFilter = 'all';

  bellBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
    if (!dropdown.hidden) {
      await renderNotifList(currentFilter);
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (container && !container.contains(e.target)) {
      dropdown.hidden = true;
    }
  });

  // Mark all read
  document.getElementById('btn-mark-all-read')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const user = currentUser();
    if (user) {
      await markAllAsRead(user.uid);
      await renderNotifList(currentFilter);
      updateBellBadge();
      
      showToast('All notifications marked as read', { type: 'success' });
    }
  });

  // Filter buttons
  document.querySelectorAll('.notif-filter-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('.notif-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      await renderNotifList(currentFilter);
    });
  });

  // Listen for new notifications
  window.addEventListener('notificationAdded', () => updateBellBadge());
}

async function renderNotifList(filter = 'all') {
  const listEl = document.getElementById('notif-list');
  if (!listEl) return;

  const user = currentUser();
  if (!user) { listEl.innerHTML = '<div class="notif-empty">Not signed in</div>'; return; }

  const allNotifs = await getNotifications(user.uid);
  const filtered = allNotifs.filter(FILTER_MAP[filter] || FILTER_MAP.all);

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="notif-empty">
        <div class="notif-empty-icon">${ICONS.bell}</div>
        <p>No notifications</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}" ${n.actionLink ? `data-action="${n.actionLink}"` : ''}>
      <div class="notif-item-icon" style="color:${iconColor(n.type)}">${notifIcon(n.type)}</div>
      <div class="notif-item-body">
        <div class="notif-item-title">${escapeHtml(n.title)}</div>
        <div class="notif-item-message">${escapeHtml(n.message)}</div>
        <span class="notif-item-time">${formatTimeAgo(n.createdAt)}</span>
      </div>
      ${!n.read ? '<span class="notif-unread-dot"></span>' : ''}
    </div>
  `).join('');

  // Bind click on notif items
  listEl.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      await markAsRead(item.dataset.notifId);
      item.classList.remove('unread');
      item.querySelector('.notif-unread-dot')?.remove();
      updateBellBadge();
      if (item.dataset.action) {
        navigate(item.dataset.action);
        document.getElementById('notif-dropdown').hidden = true;
      }
    });
  });
}

function iconColor(type) {
  const map = {
    task_assigned:      'var(--primary)',
    task_completed:     'var(--success)',
    approval_request:   'var(--warning)',
    approval_granted:   'var(--success)',
    approval_rejected:  'var(--danger)',
    badge_earned:       'var(--accent)',
    free_rider_alert:   'var(--danger)',
    member_joined:      'var(--primary)',
    member_left:        'var(--text-muted)',
  };
  return map[type] || 'var(--text-secondary)';
}

async function updateBellBadge() {
  const user = currentUser();
  if (!user) return;
  const count = await getUnreadCount(user.uid);
  const badge = document.querySelector('.notif-badge-count');
  if (badge) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = count > 0 ? '' : 'none';
  } else if (count > 0) {
    const bellBtn = document.getElementById('btn-notifications');
    if (bellBtn) {
      const span = document.createElement('span');
      span.className = 'notif-badge-count';
      span.textContent = count > 9 ? '9+' : count;
      bellBtn.appendChild(span);
    }
  }
}

