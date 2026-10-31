/**
 * Activity History — Timeline of all group events.
 * Replaces the old "Audit Request" system with a real activity feed
 * showing task moves, completions, member joins, comments, and more.
 */

import { STORES, getAllByIndex } from '../../services/indexedDBService.js';
import { escapeHtml, formatTimeAgo } from '../../utils/helpers.js';
import { navigate } from '../../services/router.js';
import { sidebarHTML, bindSidebarEvents } from '../members/MemberList.js';
import { getGroupActivity, ACTIVITY_COLORS } from '../../services/activityLogService.js';
import { ICONS } from '../../assets/icons/icons.js';


/* ── Icon per event type ── */
function eventIcon(type) {
  const map = {
    task_created:   ICONS.plus,
    task_assigned:  ICONS.user,
    task_moved:     ICONS.inProgress,
    task_completed: ICONS.done,
    task_deleted:   ICONS.close,
    member_joined:  ICONS.users,
    member_removed: ICONS.door,
    comment_added:  ICONS.message,
    group_created:  ICONS.star,
  };
  return map[type] || ICONS.clipboard;
}

/* ── Filter tabs ── */
const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'tasks',    label: 'Tasks',    types: ['task_created', 'task_assigned', 'task_moved', 'task_completed', 'task_deleted'] },
  { key: 'members',  label: 'Members',  types: ['member_joined', 'member_removed'] },
  { key: 'comments', label: 'Comments', types: ['comment_added'] },
];

function filterEvents(events, activeKey) {
  const f = FILTERS.find(f => f.key === activeKey);
  if (!f || f.key === 'all') return events;
  return events.filter(e => f.types.includes(e.type));
}

/* ── Render timeline ── */
function renderTimeline(events) {
  if (events.length === 0) {
    return `
      <div class="activity-empty">
        <div class="activity-empty-icon">${ICONS.clipboard}</div>
        <p>No activity yet in this category.</p>
        <p style="font-size:0.8rem;margin-top:4px;color:var(--text-muted)">
          Events appear here as your team creates tasks, moves cards, and collaborates.
        </p>
      </div>`;
  }

  // Group events by calendar date
  const groups = {};
  for (const e of events) {
    const day = new Date(e.createdAt).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  }

  return Object.entries(groups).map(([day, dayEvents]) => `
    <div class="activity-day-group">
      <div class="activity-day-label">${day}</div>
      <div class="activity-timeline">
        ${dayEvents.map(e => `
          <div class="activity-event" data-type="${e.type}">
            <div class="activity-event-icon" style="color:${ACTIVITY_COLORS[e.type] || 'var(--primary)'}">
              ${eventIcon(e.type)}
            </div>
            <div class="activity-event-body">
              <p class="activity-event-desc">${escapeHtml(e.description)}</p>
              <div class="activity-event-meta">
                ${e.actorName ? `<span class="activity-actor">${escapeHtml(e.actorName)}</span>` : ''}
                <span class="activity-time">${formatTimeAgo(e.createdAt)}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

/* ── Main render ── */
export async function renderAudit(groupId) {
  const app = document.getElementById('app');
  if (!app) return;

  // Load data
  let tasks = [];
  let members = [];
  let allEvents = [];

  try {
    tasks    = await getAllByIndex(STORES.TASKS,   'groupId', groupId);
    members  = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
    allEvents = await getGroupActivity(groupId, 200);
  } catch (err) {
    console.error('[AuditHistory] Failed to load data:', err);
  }

  let activeFilter = 'all';

  const render = () => {
    const filtered = filterEvents(allEvents, activeFilter);

    app.innerHTML = `
      <div class="app-layout">
        ${sidebarHTML(groupId, 'audit', members, tasks)}
        <div class="main-content">
          <header class="board-header">
            <div class="board-header-left">
              <button class="btn-icon" id="btn-back" title="Back to Board" aria-label="Back to Board">${ICONS.back}</button>
              <h1 class="board-title">${ICONS.clipboard} Activity History</h1>
            </div>
            <div class="board-header-right">
              <span class="activity-count-badge">${allEvents.length} total events</span>
            </div>
          </header>

          <div class="activity-page">
            <!-- Filter Tabs -->
            <div class="activity-filter-tabs">
              ${FILTERS.map(f => `
                <button class="activity-filter-tab ${f.key === activeFilter ? 'active' : ''}"
                        data-filter="${f.key}">
                  ${f.label}
                  <span class="activity-filter-count">
                    ${f.key === 'all' ? allEvents.length : filterEvents(allEvents, f.key).length}
                  </span>
                </button>
              `).join('')}
            </div>

            <!-- Timeline -->
            <div class="activity-timeline-wrap" id="activity-timeline-wrap">
              ${renderTimeline(filtered)}
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind events after render
    document.getElementById('btn-back')?.addEventListener('click', () => navigate(`#/group/${groupId}`));
    bindSidebarEvents(groupId);

    app.querySelectorAll('.activity-filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.filter;
        render();
      });
    });
  };

  render();
}
