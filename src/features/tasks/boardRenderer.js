/**
 * boardRenderer.js
 * Pure HTML builders for the Kanban board page.
 *
 * No side effects, no IndexedDB reads, no event binding.
 * Every exported function takes plain data objects and returns an HTML string.
 * TaskBoard.js uses these to build the initial page and boardPatch.js uses the
 * helpers (tasksForStatus, emptyColumnHTML, pendingBadgeHTML, cardHTML) to
 * patch individual cards.
 */

import { escapeHtml } from '../../utils/helpers.js';
import { getTerm } from '../../services/themeService.js';
import { ICONS } from '../../assets/icons/icons.js';
import { taskCardHTML } from './TaskCard.js';
import {
  taskModalHTML,
  shareModalHTML,
  boardMembersModalHTML,
  proofReviewModalHTML,
  proofSubmitModalHTML,
} from './TaskModal.js';
import { sidebarHTML } from '../members/MemberList.js';
import { readBoardTab } from './boardTabs.js';

// Difficulty options (used by TaskModal for the difficulty selector)
export const DIFFICULTIES = [
  { key: 'easy',      label: 'Easy'      },
  { key: 'medium',    label: 'Medium'    },
  { key: 'hard',      label: 'Hard'      },
  { key: 'legendary', label: 'Legendary' },
];

// ── Column helpers ─────────────────────────────────────────────────────────────

/**
 * Column definitions — rebuilt on every call so theme-term changes take effect.
 * @returns {{ key, label, icon, tab? }[]}
 */
export function getStatuses() {
  return [
    { key: 'todo',             label: getTerm('todoColumn'), icon: ICONS.todo                       },
    { key: 'in-progress',      label: 'In Progress',         icon: ICONS.inProgress                 },
    { key: 'pending-approval', label: 'Pending Approval',    icon: ICONS.pending,   tab: 'Pending'  },
    { key: 'done',             label: 'Completed',           icon: ICONS.done                       },
  ];
}

/**
 * Cards for one column, in display order.
 * @param {object[]} tasks
 * @param {string}   status
 * @returns {object[]}
 */
export function tasksForStatus(tasks, status) {
  return status === 'done'
    ? tasks.filter((t) => t.status === 'done').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    : tasks.filter((t) => t.status === status).sort((a, b) => (b.weight || 0) - (a.weight || 0));
}

const COMPLETED_EMPTY_HTML = `<div class="completed-empty" style="padding:24px 12px; text-align:center; color:var(--text-muted); font-size:0.85rem;"><div style="font-size:2rem; margin-bottom:8px;">🏆</div>Completed tasks will appear here.</div>`;

/**
 * What an empty column shows.
 * (D6: the To Do column tells people where tasks come from.)
 * @param {string}  status
 * @param {boolean} isAdmin
 * @returns {string}
 */
export function emptyColumnHTML(status, isAdmin) {
  if (status === 'done') return COMPLETED_EMPTY_HTML;
  if (status === 'todo') {
    return `<div class="column-empty-hint">${isAdmin
      ? `Add your first task with ${escapeHtml(getTerm('addQuest'))} below.`
      : `No tasks yet. Your ${escapeHtml(getTerm('owner').toLowerCase())} adds them with ${escapeHtml(getTerm('addQuest'))}.`
    }</div>`;
  }
  return '';
}

/**
 * Pending-approval badge HTML for the board header.
 * @param {number} count
 * @returns {string}
 */
export function pendingBadgeHTML(count) {
  return `<span class="pulse-badge">⚠️ ${count} ${getTerm('pendingProof')}</span>`;
}

/**
 * Render one task card's HTML and store it in the cache.
 * Keeping the cache here (rather than in TaskBoard) lets boardPatch.js use it.
 *
 * @param {object} t     Task object
 * @param {object} d     Board data context (from loadBoardData)
 * @param {Map}    cache cardHtmlCache — modified in place
 * @returns {string}
 */
export function cardHTML(t, d, cache) {
  const html = taskCardHTML(t, d.members, d.groupProofs, d.comments, d.isAdmin, d.me, d.profileMap);
  cache.set(t.id, html);
  return html;
}

// ── Header helpers ─────────────────────────────────────────────────────────────

/**
 * Member avatar stack shown in the board header.
 * @param {object[]} members
 * @param {object}   profileMap   uid → userProfile
 * @returns {string}
 */
function memberAvatarStackHTML(members, profileMap) {
  const MAX_AVATAR_SHOW = 5;
  const shownMembers = members.slice(0, MAX_AVATAR_SHOW);
  const extraCount   = members.length - MAX_AVATAR_SHOW;
  return `
    <div class="member-avatar-stack" id="btn-board-members"
      title="Board members (${members.length})"
      style="cursor:pointer; display:flex; align-items:center; gap:4px; margin-right:8px;">
      <div style="display:flex; flex-direction:row-reverse; align-items:center;">
        ${shownMembers.map((m, i) => {
          const prof = profileMap[m.uid];
          const avatarContent = (prof?.avatarType === 'custom' && prof?.avatar)
            ? `<img src="${prof.avatar}" alt="${escapeHtml(m.displayName?.[0] || '?')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : escapeHtml(m.displayName?.[0] || '?');
          return `<div class="avatar avatar-stack-item" title="${escapeHtml(m.displayName)}"
            style="z-index:${MAX_AVATAR_SHOW - i}; margin-left:-8px; width:28px; height:28px; font-size:0.75rem; border:2px solid var(--bg); overflow:hidden;">${avatarContent}</div>`;
        }).join('')}
      </div>
      ${extraCount > 0 ? `<span style="font-size:0.75rem; color:var(--text-secondary); font-family:var(--font-heading);">+${extraCount}</span>` : ''}
      <span class="member-count-label"
        style="font-size:0.75rem; color:var(--text-secondary); font-family:var(--font-heading); margin-left:2px;"
        >${members.length} member${members.length !== 1 ? 's' : ''}</span>
    </div>
  `;
}

// ── Full-page HTML ─────────────────────────────────────────────────────────────

/**
 * Build the full board page HTML string.
 * Clears `cache` before populating it with per-card HTML.
 *
 * @param {string}   groupId  Active group ID
 * @param {object}   data     Board data object from loadBoardData()
 * @param {Map}      cache    cardHtmlCache — cleared and populated in place
 * @returns {string}          HTML to assign to app.innerHTML
 */
export function boardPageHTML(groupId, data, cache) {
  const { group, tasks, members, profileMap, me, isAdmin, pendingProofsCount } = data;
  const STATUSES  = getStatuses();
  const activeTab = readBoardTab(groupId);

  cache.clear();

  return `
    <div class="app-layout board-layout">
      ${sidebarHTML(groupId, 'board', members, tasks)}
      <div class="main-content">
        <header class="board-header">
          <div class="board-header-left">
            <h1 class="board-title" title="${escapeHtml(group?.name || getTerm('appTitle'))}">
              <span class="board-title-icon">${getTerm('boardTitlePrefix')}</span>
              <span class="board-title-text">${escapeHtml(group?.name || getTerm('appTitle'))}</span>
            </h1>
          </div>
          <div class="board-header-right">
            ${isAdmin && pendingProofsCount > 0 ? pendingBadgeHTML(pendingProofsCount) : ''}
            ${memberAvatarStackHTML(members, profileMap)}
            <button class="btn btn-secondary btn-sm" id="btn-share-btn" title="Share" aria-label="Share">
              <span class="btn-icon-inline">${ICONS.link}</span><span class="btn-label"> Share</span>
            </button>
            ${isAdmin ? `
            <button class="btn btn-secondary btn-sm" id="btn-export-tasks-csv"
              title="Download task list (CSV) - does not include peer ratings"
              aria-label="Export task list as CSV">
              <span class="btn-icon-inline">⬇</span><span class="btn-label"> Export Tasks</span>
            </button>` : ''}
            <button class="btn btn-secondary btn-sm btn-board-tour" id="btn-board-tour" type="button"
              title="How this board works" aria-label="How this board works">?</button>
          </div>
        </header>

        <div class="kanban-area" id="kanban-area" data-active-tab="${activeTab}">
          <div class="column-tabs" role="tablist" aria-label="Board columns">
            ${STATUSES.map((s) => `
              <button type="button" role="tab"
                class="column-tab${s.key === activeTab ? ' active' : ''}"
                data-status="${s.key}"
                aria-selected="${s.key === activeTab}"
                tabindex="${s.key === activeTab ? 0 : -1}"
                title="${escapeHtml(s.label)}">
                <span class="column-tab-label">${escapeHtml(s.tab || s.label)}</span>
                <span class="column-count">${tasks.filter((t) => t.status === s.key).length}</span>
              </button>
            `).join('')}
          </div>
          <div class="kanban-wrapper">
            <div class="kanban-board" id="kanban-board">
              ${STATUSES.filter((s) => s.key !== 'done').map((s) => `
                <div class="kanban-column" data-status="${s.key}">
                  <div class="column-header">
                    <span class="column-icon">${s.icon}</span>
                    <span class="column-title">${s.label}</span>
                    <span class="column-count">${tasks.filter((t) => t.status === s.key).length}</span>
                  </div>
                  <div class="column-cards">
                    ${tasksForStatus(tasks, s.key).map((t) => cardHTML(t, data, cache)).join('') || emptyColumnHTML(s.key, isAdmin)}
                  </div>
                  ${isAdmin && s.key === 'todo' ? `
                    <button class="btn btn-secondary btn-block btn-add-task-col" data-status="${s.key}"
                      style="margin-top:16px; background:transparent; border-style:dashed; color:var(--text-muted);">
                      ${getTerm('addQuest')}
                    </button>
                  ` : ''}
                </div>
              `).join('')}
            </div>

            <!-- Completed side panel -->
            <aside class="completed-panel" id="completed-panel" data-status="done">
              <div class="column-header" style="margin-bottom:12px;">
                <span class="column-icon">${STATUSES.find((s) => s.key === 'done')?.icon || ''}</span>
                <span class="column-title">Completed</span>
                <span class="column-count">${tasks.filter((t) => t.status === 'done').length}</span>
              </div>
              <div class="column-cards" id="completed-cards">
                ${tasksForStatus(tasks, 'done').map((t) => cardHTML(t, data, cache)).join('') || emptyColumnHTML('done', isAdmin)}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>

    ${taskModalHTML(members, STATUSES, isAdmin)}
    ${shareModalHTML(members, group, profileMap)}
    ${boardMembersModalHTML(members, profileMap)}
    ${proofReviewModalHTML()}
    ${proofSubmitModalHTML()}
    <div id="task-detail-modal-container"></div>
  `;
}
