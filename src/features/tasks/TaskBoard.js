/**
 * TaskBoard — Top-level orchestrator for the Kanban board page.
 *
 * Responsibilities:
 *   - Fetch all data required for the board view.
 *   - Compose HTML from TaskCard, TaskModal, and column templates.
 *   - Bind delegated events once via boardEvents.
 *   - Initialise drag-and-drop for admins.
 *
 * Business logic (save, move, review, notify) lives in boardEvents.js.
 * HTML templates live in TaskCard.js and TaskModal.js.
 */

import { STORES, getAllByIndex, get, getAll } from '../../services/indexedDBService.js';
import { escapeHtml } from '../../utils/helpers.js';
import { initDragDrop } from './dragDrop.js';
import { currentUser } from '../../services/authService.js';
import { sidebarHTML, bindSidebarEvents } from '../members/MemberList.js';
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
import { bindBoardEvents, moveTask } from './boardEvents.js';

// ── Module-level state (preserved across re-renders within the same session) ──
let currentGroupId      = null;
let dragDropInitialised  = false;
let boardEventsInitialised = false;

// Live context object — mutated on every render so delegated handlers always
// see the latest members/proofs without being re-attached.
const _boardContext = {};

const DIFFICULTIES = [
  { key: 'easy',      label: 'Easy'       },
  { key: 'medium',    label: 'Medium'     },
  { key: 'hard',      label: 'Hard'       },
  { key: 'legendary', label: 'Legendary'  },
];

function getStatuses() {
  return [
    { key: 'todo',             label: getTerm('taskBoard'),  icon: ICONS.todo       },
    { key: 'in-progress',      label: 'In Progress',         icon: ICONS.inProgress },
    { key: 'pending-approval', label: 'Pending Approval',    icon: ICONS.pending    },
    { key: 'done',             label: 'Completed',           icon: ICONS.done       },
  ];
}

/** Reset drag-drop/event flags — must be called when navigating to the board. */
export function resetBoardState() {
  dragDropInitialised = false;
  Object.keys(_boardContext).forEach((k) => delete _boardContext[k]);
}


// ── Main render ───────────────────────────────────────────────────────────────

export async function renderTaskBoard(groupId) {
  currentGroupId = groupId;
  const app  = document.getElementById('app');
  const user = currentUser();

  const [group, tasks, members, allProofs, comments, allProfiles] = await Promise.all([
    get(STORES.GROUPS, groupId),
    getAllByIndex(STORES.TASKS,    'groupId', groupId),
    getAllByIndex(STORES.MEMBERS,  'groupId', groupId),
    getAll(STORES.PROOF_SUBMISSIONS),
    getAllByIndex(STORES.COMMENTS, 'groupId', groupId),
    getAll(STORES.USER_PROFILES),
  ]);

  const groupProofs = (allProofs || []).filter((p) => p.groupId === groupId);
  const me          = members.find((m) => m.uid === user.uid);
  const isAdmin     = me?.role === 'owner' || me?.role === 'co-admin';

  // Build a uid → profile lookup for avatar images
  const profileMap = {};
  (allProfiles || []).forEach(p => { profileMap[p.uid] = p; });

  const pendingProofsCount = groupProofs.filter((p) => p.status === 'pending').length;
  const STATUSES = getStatuses();

  // Build member avatar stack HTML for header
  const MAX_AVATAR_SHOW = 5;
  const shownMembers = members.slice(0, MAX_AVATAR_SHOW);
  const extraCount = members.length - MAX_AVATAR_SHOW;
  const memberAvatarStack = `
    <div class="member-avatar-stack" id="btn-board-members" title="Board Members" style="cursor:pointer; display:flex; align-items:center; gap:4px; margin-right:8px;">
      <div style="display:flex; flex-direction:row-reverse; align-items:center;">
        ${shownMembers.map((m, i) => {
          const prof = profileMap[m.uid];
          const avatarContent = (prof?.avatarType === 'custom' && prof?.avatar)
            ? `<img src="${prof.avatar}" alt="${escapeHtml(m.displayName?.[0] || '?')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : escapeHtml(m.displayName?.[0] || '?');
          return `<div class="avatar avatar-stack-item" title="${escapeHtml(m.displayName)}" style="z-index:${MAX_AVATAR_SHOW - i}; margin-left:-8px; width:28px; height:28px; font-size:0.75rem; border:2px solid var(--bg); overflow:hidden;">${avatarContent}</div>`;
        }).join('')}
      </div>
      ${extraCount > 0 ? `<span style="font-size:0.75rem; color:var(--text-secondary); font-family:var(--font-heading);">+${extraCount}</span>` : ''}
      <span style="font-size:0.75rem; color:var(--text-secondary); font-family:var(--font-heading); margin-left:2px;">${members.length} member${members.length !== 1 ? 's' : ''}</span>
    </div>
  `;

  app.innerHTML = `
    <div class="app-layout">
      ${sidebarHTML(groupId, 'board', members, tasks)}
      <div class="main-content">
        <header class="board-header">
          <div class="board-header-left">
            <h1 class="board-title">
              <span class="board-title-icon">${getTerm('boardTitlePrefix')}</span>
              ${escapeHtml(group?.name || getTerm('appTitle'))}
            </h1>
          </div>
          <div class="board-header-right">
            ${isAdmin && pendingProofsCount > 0
              ? `<span class="pulse-badge">⚠️ ${pendingProofsCount} ${getTerm('pendingProof')}</span>`
              : ''}
            ${memberAvatarStack}
            <button class="btn btn-secondary btn-sm" id="btn-share-btn">
              <span class="btn-icon-inline">${ICONS.link}</span> Share
            </button>
          </div>
        </header>

        <div class="kanban-board" id="kanban-board">
          ${STATUSES.map((s) => `
            <div class="kanban-column" data-status="${s.key}">
              <div class="column-header">
                <span class="column-icon">${s.icon}</span>
                <span class="column-title">${s.label}</span>
                <span class="column-count">${tasks.filter((t) => t.status === s.key).length}</span>
              </div>
              <div class="column-cards">
                ${tasks
                  .filter((t) => t.status === s.key)
                  .sort((a, b) => (b.weight || 0) - (a.weight || 0))
                  .map((t) => taskCardHTML(t, members, groupProofs, comments, isAdmin, me, profileMap))
                  .join('')}
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
      </div>
    </div>

    ${taskModalHTML(members, STATUSES)}
    ${shareModalHTML(members, group, profileMap)}
    ${boardMembersModalHTML(members, profileMap)}
    ${proofReviewModalHTML()}
    ${proofSubmitModalHTML()}
    <div id="task-detail-modal-container"></div>
  `;

  // Update the shared context that delegated handlers read
  Object.assign(_boardContext, { groupId, members, group, viewIsAdmin: isAdmin, me, proofs: groupProofs, profileMap });

  // Wire the separate share button (not the avatar stack)
  document.getElementById('btn-share-btn')?.addEventListener('click', () => {
    document.getElementById('share-modal').hidden = false;
  });

  if (!boardEventsInitialised) {
    bindBoardEvents(_boardContext, renderTaskBoard);
    bindSidebarEvents(groupId);
    boardEventsInitialised = true;
  }

  if (isAdmin && !dragDropInitialised) {
    initDragDrop(async (taskId, newStatus) => {
      await moveTask(taskId, newStatus, _boardContext.groupId, _boardContext.members);
      await renderTaskBoard(_boardContext.groupId);
    });
    dragDropInitialised = true;
  }
}
