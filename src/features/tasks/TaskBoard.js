import { STORES, getAllByIndex, put, remove, add, addToSyncQueue, get, getAll } from '../../services/indexedDBService.js';
import { generateId, formatRelative, escapeHtml } from '../../utils/helpers.js';
import { initDragDrop } from './dragDrop.js';
import { currentUser } from '../../services/authService.js';
import { sidebarHTML, bindSidebarEvents } from '../members/MemberList.js';
import { evaluateBadges } from '../../core/gamificationEngine.js';
import { getTerm } from '../../services/themeService.js';
import { notify } from '../../services/notificationService.js';
import { renderCommentsUI, bindCommentEvents } from './TaskComments.js';
import { ICONS } from '../../assets/icons/icons.js';
import { logActivity } from '../../services/activityLogService.js';

function getStatuses(isAdmin) {
  const base = [
    { key: 'todo',             label: getTerm('taskBoard'),     icon: ICONS.todo },
    { key: 'in-progress',      label: 'In Progress',            icon: ICONS.inProgress },
    { key: 'pending-approval', label: 'Pending Approval',       icon: ICONS.pending },
    { key: 'done',             label: 'Completed',              icon: ICONS.done },
  ];
  return base;
}

const DIFFICULTIES = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
  { key: 'legendary', label: 'Legendary' }
];

let currentGroupId = null;
let dragDropInitialised = false;
let boardEventsInitialised = false;
let _boardContext = {}; // live ref updated on every render

/** Reset board state flags — call when navigating to the board page */
export function resetBoardState() {
  dragDropInitialised = false;
  _boardContext = {};
}

function renderAchievementPopup(badge) {
  const existing = document.getElementById('achievement-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'achievement-popup';
  popup.className = 'achievement-popup';
  popup.innerHTML = `
    <div class="achievement-popup-icon">${badge.icon}</div>
    <div class="achievement-popup-content">
      <div class="achievement-popup-label">Achievement Unlocked!</div>
      <div class="achievement-popup-text">${escapeHtml(badge.label)}</div>
      <div class="achievement-popup-desc">${escapeHtml(badge.description)}</div>
    </div>
  `;
  document.body.appendChild(popup);
  popup.addEventListener('click', () => popup.remove());
  setTimeout(() => popup?.remove(), 5000);
}

export async function renderTaskBoard(groupId) {
  currentGroupId = groupId;
  const app = document.getElementById('app');
  const user = currentUser();
  const group = await get(STORES.GROUPS, groupId);
  const tasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  const members = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
  const proofs = await getAll(STORES.PROOF_SUBMISSIONS) || [];
  const groupProofs = proofs.filter(p => p.groupId === groupId);
  const comments = await getAllByIndex(STORES.COMMENTS, 'groupId', groupId);

  const me = members.find(m => m.uid === user.uid);
  const myActualRole = me?.role || 'member';
  const isGuildmaster = myActualRole === 'owner' || myActualRole === 'co-admin';
  const viewIsAdmin = isGuildmaster;
  
  // Auto-approve tasks older than 72 hours
  await checkAutoApprovals(tasks, groupId);

  const pendingProofsCount = groupProofs.filter(p => p.status === 'pending').length;
  const STATUSES = getStatuses(viewIsAdmin);

  app.innerHTML = `
    <div class="app-layout">
      ${sidebarHTML(groupId, 'board', members, tasks)}
      <div class="main-content">
        <header class="board-header">
          <div class="board-header-left">
            <h1 class="board-title"><span class="board-title-icon">${getTerm('boardTitlePrefix')}</span> ${escapeHtml(group?.name || getTerm('appTitle'))}</h1>
          </div>
          <div class="board-header-right">
            ${isGuildmaster && pendingProofsCount > 0 ? `<span class="pulse-badge">⚠️ ${pendingProofsCount} ${getTerm('pendingProof')}</span>` : ''}
            <button class="btn btn-secondary btn-sm" id="btn-share">
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
                  .map((t) => taskCardHTML(t, members, groupProofs, comments, viewIsAdmin, me))
                  .join('')}
              </div>
              ${viewIsAdmin && s.key === 'todo' ? `
                <button class="btn btn-secondary btn-block btn-add-task-col" data-status="${s.key}" style="margin-top: 16px; background: transparent; border-style: dashed; color: var(--text-muted);">
                  ${getTerm('addQuest')}
                </button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    ${taskModalHTML(members, STATUSES)}
    ${shareModalHTML(members, group)}
    ${proofReviewModalHTML()}
    ${proofSubmitModalHTML()}
    <div id="task-detail-modal-container"></div>
  `;

  // Update live context (used by delegated event handlers)
  _boardContext = { groupId, members, group, viewIsAdmin, me, proofs: groupProofs };

  if (!boardEventsInitialised) {
    bindBoardEvents();
    bindSidebarEvents(groupId);
    boardEventsInitialised = true;
  }

  if (viewIsAdmin && !dragDropInitialised) {
    initDragDrop(async (taskId, newStatus) => {
      const ctx = _boardContext;
      await moveTask(taskId, newStatus, ctx.groupId, ctx.members);
      await renderTaskBoard(ctx.groupId);
    });
    dragDropInitialised = true;
  }
}

async function checkAutoApprovals(tasks, groupId) {
  const now = Date.now();
  const AUTO_APPROVE_MS = 72 * 60 * 60 * 1000; // 72 hours
  for (const t of tasks) {
    if (t.status === 'pending-approval' && t.updatedAt && (now - t.updatedAt > AUTO_APPROVE_MS)) {
      t.status = 'done';
      t.completedAt = now;
      t.updatedAt = now;
      await put(STORES.TASKS, t);
      await addToSyncQueue({ collection: 'tasks', docId: t.id, operation: 'update', data: t });
      
      // Auto approve associated proof if any
      const proofs = await getAllByIndex(STORES.PROOF_SUBMISSIONS, 'taskId', t.id);
      const pendingProof = proofs.find(p => p.status === 'pending');
      if (pendingProof) {
        pendingProof.status = 'approved';
        pendingProof.note = 'Auto-approved after 72 hours';
        await put(STORES.PROOF_SUBMISSIONS, pendingProof);
        await addToSyncQueue({ collection: 'proofSubmissions', docId: pendingProof.id, operation: 'update', data: pendingProof });
      }
    }
  }
}

function taskCardHTML(task, members, proofs, comments, viewIsAdmin, me) {
  const assignee = members.find((m) => m.id === task.assignedTo);
  const deadlineClass = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done' ? 'overdue' : '';
  const diffClass = `badge-${task.difficulty || 'medium'}`;

  const proof = proofs.find(p => p.taskId === task.id);
  const commentCount = comments.filter(c => c.taskId === task.id && !c.deleted).length;

  let proofBadge = '';
  if (task.status === 'pending-approval') {
    proofBadge = viewIsAdmin
      ? `<button class="btn btn-primary btn-block btn-review-proof" data-proof-id="${proof?.id || ''}" data-task-id="${task.id}" style="margin-bottom:12px; font-size:0.7rem;">REVIEW APPROVAL</button>`
      : `<span class="proof-status-badge">AWAITING APPROVAL</span>`;
  } else if (proof) {
    if (proof.status === 'rejected') {
      proofBadge = `<span class="proof-status-badge proof-status-rejected">REJECTED ${proof.note ? `- ${escapeHtml(proof.note)}` : ''}</span>`;
      if (!viewIsAdmin && assignee && assignee.id === me.id && task.status !== 'done') {
        proofBadge += `<button class="btn btn-secondary btn-block btn-submit-proof" data-task-id="${task.id}" style="margin-bottom:12px; font-size:0.7rem;">RESUBMIT</button>`;
      }
    }
  } else if (!viewIsAdmin && task.status === 'in-progress' && assignee && assignee.id === me.id) {
    proofBadge = `<button class="btn btn-secondary btn-block btn-submit-proof" data-task-id="${task.id}" style="margin-bottom:12px; font-size:0.7rem;">MARK COMPLETE</button>`;
  } else if (!viewIsAdmin && task.status === 'todo' && !assignee) {
    proofBadge = `<button class="btn btn-primary btn-block btn-self-assign" data-task-id="${task.id}" style="margin-bottom:12px; font-size:0.7rem;">${getTerm('acceptTask')}</button>`;
  }

  return `
    <div class="task-card ${viewIsAdmin ? 'draggable' : ''}" ${viewIsAdmin ? 'draggable="true"' : ''} data-task-id="${task.id}">
      <div class="task-card-top">
        <div class="task-badges">
          <span class="badge ${diffClass}">${escapeHtml(task.difficulty || 'MEDIUM')}</span>
          ${task.deadline ? `<span class="task-deadline ${deadlineClass}">⏳ ${formatRelative(task.deadline)}</span>` : ''}
          ${commentCount > 0 ? `<span class="badge badge-subtle">💬 ${commentCount}</span>` : ''}
        </div>
      </div>
      <h3 class="task-title">${escapeHtml(task.title)}</h3>
      ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ''}

      ${proofBadge}

      <div class="task-card-bottom">
        ${assignee ? `
          <div class="task-assignee">
            <div class="avatar">${escapeHtml(assignee.displayName?.[0] || '?')}</div>
            <div>
              <span class="task-assignee-label">Assigned</span>
              <span class="task-assignee-name">${escapeHtml(assignee.displayName || assignee.uid)}</span>
            </div>
          </div>
        ` : `<span class="task-assignee-label" style="margin:0; opacity:0.6;">Unassigned</span>`}

          <span class="task-reward" style="margin-left: auto;">${task.weight || 100} ${getTerm('rewardIcon')}</span>
      </div>
    </div>
  `;
}

function taskModalHTML(members, STATUSES) {
  return `
    <div class="modal-overlay" id="task-modal" hidden>
      <div class="modal">
        <div class="modal-header">
          <h2 id="modal-title">Edit ${getTerm('task')}</h2>
          <button class="btn-icon btn-close-modal" aria-label="Close">✕</button>
        </div>
        <form id="task-form" class="modal-body">
          <input type="hidden" id="task-id" />
          <input type="hidden" id="task-default-status" />
          <div class="form-group">
            <label for="task-title-input">${getTerm('task')} Title</label>
            <input type="text" id="task-title-input" required placeholder="..." />
          </div>
          <div class="form-group">
            <label for="task-desc-input">Description</label>
            <textarea id="task-desc-input" rows="4" placeholder="Enter details..."></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="task-diff-input">Difficulty</label>
              <select id="task-diff-input">
                ${DIFFICULTIES.map(d => `<option value="${d.key}">${d.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="task-weight-input">${getTerm('rewardLabel')}</label>
              <input type="number" id="task-weight-input" min="10" step="10" value="100" required />
            </div>
          </div>
          <div class="form-group">
            <label for="task-deadline-input">Deadline</label>
            <input type="date" id="task-deadline-input" />
          </div>
          <div class="form-group">
            <label>Assign To</label>
            <div class="assignee-options" id="assignee-options-container">
              <div class="assignee-option none selected" data-uid="">NONE</div>
              ${members.map(m => `
                <div class="assignee-option" data-uid="${m.id}">
                  <div class="avatar" style="width:20px;height:20px;font-size:0.6rem;">${escapeHtml(m.displayName?.[0] || '?')}</div>
                  ${escapeHtml(m.displayName.split(' ')[0])}
                </div>
              `).join('')}
            </div>
            <input type="hidden" id="task-assignee-input" value="" />
          </div>
          <div class="form-group">
            <label>Status</label>
            <div class="assignee-options" id="status-options-container">
              ${STATUSES.map(s => `
                <div class="assignee-option" data-status="${s.key}">
                  ${s.icon} ${s.label}
                </div>
              `).join('')}
            </div>
            <input type="hidden" id="task-status-input" value="todo" />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-close-modal">Cancel</button>
            <button type="submit" class="btn btn-primary">${getTerm('saveTask')}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function shareModalHTML(members, group) {
  return `
    <div class="modal-overlay" id="share-modal" hidden>
      <div class="modal">
        <div class="modal-header">
          <h2>Share this Board</h2>
          <button class="btn-icon btn-close-modal" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Invite others to join using this link or invite code: <strong style="color:var(--primary);">${group?.inviteCode}</strong></p>

          <div style="margin-top:8px;">
            <label style="font-family:var(--font-heading); font-size:0.75rem; color:var(--text-secondary); letter-spacing:0.05em;">WHO HAS ACCESS</label>
            <div class="share-member-list">
              <div class="share-member-row" style="background:transparent; border-color:transparent;">
                <div class="avatar" style="background:var(--bg-card); color:var(--warning);">🔒</div>
                <div class="share-member-info">
                  <span class="share-member-name">People invited to board</span>
                </div>
                <span style="color:var(--text-muted); font-size:1.2rem;">›</span>
              </div>

              ${members.map(m => `
                <div class="share-member-row">
                  <div class="avatar">${escapeHtml(m.displayName?.[0] || '?')}</div>
                  <div class="share-member-info">
                    <span class="share-member-name">${escapeHtml(m.displayName)}</span>
                    <span class="share-member-email">${escapeHtml(m.uid)}</span>
                  </div>
                  ${m.role === 'owner' ? `<span class="share-role-locked">OWNER</span>` : `
                    <select class="share-role-select" data-member-id="${m.id}">
                      <option value="co-admin" ${m.role === 'co-admin' ? 'selected' : ''}>CAN EDIT</option>
                      <option value="member" ${m.role === 'member' ? 'selected' : ''}>CAN VIEW</option>
                      <option value="remove">REMOVE</option>
                    </select>
                  `}
                </div>
              `).join('')}
            </div>
          </div>

          <div class="link-box">
            <span class="link-url">https://app.grouptask.io/board/${group?.inviteCode}</span>
            <button class="btn btn-secondary btn-sm" id="btn-copy-link-bottom">COPY</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function proofReviewModalHTML() {
  return `
    <div class="modal-overlay" id="proof-review-modal" hidden>
      <div class="modal">
        <div class="modal-header">
          <h2>Approve Task</h2>
          <button class="btn-icon btn-close-modal" aria-label="Close">✕</button>
        </div>
        <form id="proof-review-form" class="modal-body">
          <input type="hidden" id="review-proof-id" />
          <input type="hidden" id="review-task-id" />
          <div class="form-group" id="proof-link-group">
            <label>Submitted Link</label>
            <div class="link-box">
              <a href="#" id="review-proof-link" target="_blank" style="color:var(--primary); font-family:monospace; word-break:break-all;"></a>
            </div>
          </div>
          <div class="form-group">
            <label for="review-note">Note / Feedback (Optional)</label>
            <textarea id="review-note" rows="3" placeholder="Feedback..."></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-reject-proof">Reject (Return to In Progress)</button>
            <button type="submit" class="btn btn-primary" id="btn-approve-proof">Approve</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function proofSubmitModalHTML() {
  return `
    <div class="modal-overlay" id="proof-submit-modal" hidden>
      <div class="modal">
        <div class="modal-header">
          <h2>Submit for Approval</h2>
          <button class="btn-icon btn-close-modal" aria-label="Close">✕</button>
        </div>
        <form id="proof-submit-form" class="modal-body">
          <input type="hidden" id="submit-task-id" />
          <div class="form-group">
            <label for="submit-proof-link">Proof Link (Optional)</label>
            <input type="url" id="submit-proof-link" placeholder="https://..." />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-close-modal">Cancel</button>
            <button type="submit" class="btn btn-primary">Submit</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function bindBoardEvents() {
  // ─── Single delegated click handler — runs ONCE, reads _boardContext on each click ───
  document.addEventListener('click', async (e) => {
    const ctx = _boardContext;
    const { groupId, members, group, viewIsAdmin, me, proofs } = ctx;

    // Close modal on overlay click
    const overlay = e.target.closest('.modal-overlay');
    if (overlay && e.target === overlay && overlay.id !== 'task-detail-modal') {
      overlay.hidden = true;
      return;
    }

    // Close modal button
    if (e.target.closest('.btn-close-modal')) {
      e.target.closest('.modal-overlay').hidden = true;
      return;
    }

    // Close detail modal
    if (e.target.closest('#btn-close-detail-modal')) {
      document.getElementById('task-detail-modal')?.remove();
      await renderTaskBoard(groupId);
      return;
    }

    // Share button
    if (e.target.closest('#btn-share')) {
      document.getElementById('share-modal').hidden = false;
      return;
    }

    // Copy invite link
    if (e.target.closest('#btn-copy-link-bottom')) {
      navigator.clipboard.writeText(`https://app.grouptask.io/board/${group?.inviteCode}`);
      showToast('Link copied to clipboard!');
      return;
    }

    // Add task column button
    const addTaskBtn = e.target.closest('.btn-add-task-col');
    if (addTaskBtn) {
      openTaskModal(null, addTaskBtn.dataset.status);
      return;
    }

    // Assignee option in modal
    const assigneeOpt = e.target.closest('#assignee-options-container .assignee-option');
    if (assigneeOpt) {
      document.querySelectorAll('#assignee-options-container .assignee-option').forEach(o => o.classList.remove('selected'));
      assigneeOpt.classList.add('selected');
      document.getElementById('task-assignee-input').value = assigneeOpt.dataset.uid;
      return;
    }

    // Status option in modal
    const statusOpt = e.target.closest('#status-options-container .assignee-option');
    if (statusOpt) {
      document.querySelectorAll('#status-options-container .assignee-option').forEach(o => o.classList.remove('selected'));
      statusOpt.classList.add('selected');
      document.getElementById('task-status-input').value = statusOpt.dataset.status;
      return;
    }

    // Self-assign button (on card)
    const selfAssignBtn = e.target.closest('.btn-self-assign');
    if (selfAssignBtn) {
      e.stopPropagation();
      const task = await get(STORES.TASKS, selfAssignBtn.dataset.taskId);
      if (!task) return;
      task.assignedTo = me.id;
      task.status = 'in-progress';
      task.updatedAt = Date.now();
      await put(STORES.TASKS, task);
      await addToSyncQueue({ collection: 'tasks', docId: task.id, operation: 'update', data: task });
      await logActivity({
        groupId, type: 'task_assigned',
        actorId: me?.id || null,
        actorName: me?.displayName || 'Someone',
        description: `${me?.displayName || 'Someone'} self-assigned "${task.title}"`,
        meta: { taskId: task.id, taskTitle: task.title },
      });
      await renderTaskBoard(groupId);
      return;
    }

    // Submit proof (mark complete) button on card
    const submitProofBtn = e.target.closest('.btn-submit-proof');
    if (submitProofBtn) {
      e.stopPropagation();
      document.getElementById('submit-task-id').value = submitProofBtn.dataset.taskId;
      document.getElementById('submit-proof-link').value = '';
      document.getElementById('proof-submit-modal').hidden = false;
      return;
    }

    // Review proof button
    const reviewBtn = e.target.closest('.btn-review-proof');
    if (reviewBtn) {
      e.stopPropagation();
      const proofId = reviewBtn.dataset.proofId;
      const taskId = reviewBtn.dataset.taskId;
      const proof = proofs?.find(p => p.id === proofId);
      document.getElementById('review-proof-id').value = proofId || '';
      document.getElementById('review-task-id').value = taskId;
      document.getElementById('review-note').value = '';
      if (proof?.link) {
        document.getElementById('proof-link-group').hidden = false;
        document.getElementById('review-proof-link').href = proof.link;
        document.getElementById('review-proof-link').textContent = proof.link;
      } else {
        document.getElementById('proof-link-group').hidden = true;
      }
      document.getElementById('proof-review-modal').hidden = false;
      return;
    }

    // Approve/Reject buttons
    const approveBtn = e.target.closest('#btn-approve-proof');
    const rejectBtn  = e.target.closest('#btn-reject-proof');
    if (approveBtn || rejectBtn) {
      e.preventDefault();
      await handleReview(approveBtn ? 'approved' : 'rejected', groupId, members, me);
      return;
    }

    // Delete card (from inside detail modal)
    const deleteInModalBtn = e.target.closest('#btn-delete-task-modal');
    if (deleteInModalBtn) {
      const taskId = deleteInModalBtn.dataset.taskId;
      if (!confirm('Delete this task? This cannot be undone.')) return;
      const taskToDelete = await get(STORES.TASKS, taskId);
      await remove(STORES.TASKS, taskId);
      await addToSyncQueue({ collection: 'tasks', docId: taskId, operation: 'delete', data: { id: taskId, groupId } });
      await logActivity({
        groupId, type: 'task_deleted',
        actorId: me?.id || null,
        actorName: me?.displayName || 'Someone',
        description: `Deleted task "${taskToDelete?.title || taskId}"`,
        meta: { taskId },
      });
      document.getElementById('task-detail-modal')?.remove();
      await renderTaskBoard(groupId);
      return;
    }

    // Edit button inside detail modal
    const editInModalBtn = e.target.closest('#btn-edit-task-modal');
    if (editInModalBtn) {
      const taskId = editInModalBtn.dataset.taskId;
      const task = await get(STORES.TASKS, taskId);
      document.getElementById('task-detail-modal')?.remove();
      if (task) openTaskModal(task);
      return;
    }

    // Click on task card itself — open unified detail modal
    // (skip if a child action button was clicked)
    const card = e.target.closest('.task-card');
    if (card && !e.target.closest('button')) {
      const taskId = card.dataset.taskId;
      const task = await get(STORES.TASKS, taskId);
      if (task) await openTaskDetailModal(task, groupId, members);
      return;
    }
  });

  // ─── Form submits (safe to attach once since forms are static) ───
  document.addEventListener('submit', async (e) => {
    const ctx = _boardContext;
    const { groupId, members, me, proofs } = ctx;

    // Task create/edit form
    if (e.target.id === 'task-form') {
      e.preventDefault();
      await saveTask(groupId, members);
      document.getElementById('task-modal').hidden = true;
      await renderTaskBoard(groupId);
      return;
    }

    // Submit proof form
    if (e.target.id === 'proof-submit-form') {
      e.preventDefault();
      const taskId = document.getElementById('submit-task-id').value;
      const link = document.getElementById('submit-proof-link').value;
      const task = await get(STORES.TASKS, taskId);
      task.status = 'pending-approval';
      task.updatedAt = Date.now();
      await put(STORES.TASKS, task);
      await addToSyncQueue({ collection: 'tasks', docId: taskId, operation: 'update', data: task });
      if (link) {
        const existing = proofs?.find(p => p.taskId === taskId);
        const proofId = existing ? existing.id : generateId();
        const proof = { id: proofId, taskId, groupId, memberId: me.id, link, status: 'pending', note: '', updatedAt: Date.now() };
        await put(STORES.PROOF_SUBMISSIONS, proof);
        await addToSyncQueue({ collection: 'proofSubmissions', docId: proofId, operation: 'update', data: proof });
      }
      const admins = members.filter(m => m.role === 'owner' || m.role === 'co-admin');
      for (const a of admins) {
        await notify({ uid: a.uid, type: 'approval_request', title: 'Approval Requested',
          message: `${me.displayName} is requesting approval for "${task.title}"`,
          icon: '⏳', actionLink: `#/group/${groupId}`, groupId });
      }
      document.getElementById('proof-submit-modal').hidden = true;
      showToast('Submitted for approval!');
      await renderTaskBoard(groupId);
      return;
    }
  });

  // ─── Role change select (share modal) — delegated on change ───
  document.addEventListener('change', async (e) => {
    const ctx = _boardContext;
    const { groupId } = ctx;
    const sel = e.target.closest('.share-role-select');
    if (!sel) return;
    const memberId = sel.dataset.memberId;
    const role = sel.value;
    const member = await get(STORES.MEMBERS, memberId);
    if (!member) return;
    if (role === 'remove') {
      if (confirm('Remove this member?')) {
        await remove(STORES.MEMBERS, memberId);
        await addToSyncQueue({ collection: 'members', docId: memberId, operation: 'delete', data: { id: memberId, groupId } });
      } else {
        sel.value = member.role;
      }
    } else {
      member.role = role;
      await put(STORES.MEMBERS, member);
      await addToSyncQueue({ collection: 'members', docId: memberId, operation: 'update', data: member });
    }
    await renderTaskBoard(groupId);
    document.getElementById('share-modal').hidden = false;
  });
}

async function handleReview(status, groupId, members, me) {
  const proofId = document.getElementById('review-proof-id').value;
  const taskId  = document.getElementById('review-task-id').value;
  const note    = document.getElementById('review-note').value;
  const task    = await get(STORES.TASKS, taskId);
  const assignee = members.find(m => m.id === task.assignedTo);
  if (proofId) {
    const proof = await get(STORES.PROOF_SUBMISSIONS, proofId);
    proof.status = status; proof.note = note; proof.updatedAt = Date.now();
    await put(STORES.PROOF_SUBMISSIONS, proof);
    await addToSyncQueue({ collection: 'proofSubmissions', docId: proofId, operation: 'update', data: proof });
  }
  let newBadges = [];
  if (status === 'approved') {
    task.status = 'done'; task.completedAt = Date.now(); task.updatedAt = Date.now();
    await put(STORES.TASKS, task);
    await addToSyncQueue({ collection: 'tasks', docId: taskId, operation: 'update', data: task });
    if (assignee) {
      await notify({ uid: assignee.uid, type: 'approval_granted', title: 'Task Approved! 🎉',
        message: `Your task "${task.title}" was approved.`, icon: '✅', actionLink: `#/group/${groupId}`, groupId });
      const allMyTasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
      const myBadges   = await getAllByIndex(STORES.BADGES, 'groupId', groupId);
      const myBadgeIds = myBadges.filter(b => b.memberId === assignee.id).map(b => b.type);
      newBadges = evaluateBadges(allMyTasks, assignee.id, myBadgeIds);
      for (const b of newBadges) {
        const badgeDoc = { id: generateId(), memberId: assignee.id, groupId, type: b.id, earnedAt: Date.now() };
        await put(STORES.BADGES, badgeDoc);
        await addToSyncQueue({ collection: 'badges', docId: badgeDoc.id, operation: 'add', data: badgeDoc });
        await notify({ uid: assignee.uid, type: 'badge_earned', title: 'Badge Earned! 🏆',
          message: `You earned the "${b.label}" badge!`, icon: b.icon, actionLink: `#/profile`, groupId });
      }
    }
  } else {
    task.status = 'in-progress'; task.updatedAt = Date.now();
    await put(STORES.TASKS, task);
    await addToSyncQueue({ collection: 'tasks', docId: taskId, operation: 'update', data: task });
    if (assignee) {
      await notify({ uid: assignee.uid, type: 'approval_rejected', title: 'Task Rejected',
        message: `Your task "${task.title}" was rejected. ${note ? 'Reason: ' + note : ''}`,
        icon: '❌', actionLink: `#/group/${groupId}`, groupId });
    }
  }
  document.getElementById('proof-review-modal').hidden = true;
  showToast(status === 'approved' ? 'Task Approved!' : 'Task Rejected');
  await renderTaskBoard(groupId);
  if (newBadges.length > 0 && assignee && assignee.id === me.id) {
    setTimeout(() => renderAchievementPopup(newBadges[0]), 500);
  }
}

function openTaskModal(task = null, defaultStatus = 'todo') {
  const modal = document.getElementById('task-modal');
  document.getElementById('modal-title').innerHTML = task ? `Edit ${getTerm('task')}` : `New ${getTerm('task')}`;
  document.getElementById('task-id').value = task?.id || '';
  document.getElementById('task-title-input').value = task?.title || '';
  document.getElementById('task-desc-input').value = task?.description || '';
  document.getElementById('task-diff-input').value = task?.difficulty || 'medium';
  document.getElementById('task-weight-input').value = task?.weight || 100;
  document.getElementById('task-deadline-input').value = task?.deadline || '';

  const assigned = task?.assignedTo || '';
  document.getElementById('task-assignee-input').value = assigned;
  document.querySelectorAll('#assignee-options-container .assignee-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.uid === assigned);
  });

  const status = task?.status || defaultStatus;
  document.getElementById('task-status-input').value = status;
  document.querySelectorAll('#status-options-container .assignee-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.status === status);
  });

  modal.hidden = false;
  document.getElementById('task-title-input').focus();
}

async function openTaskDetailModal(task, groupId, members) {
  const container = document.getElementById('task-detail-modal-container');
  const assignee = members.find(m => m.id === task.assignedTo);
  const { viewIsAdmin } = _boardContext;

  const commentsHTML = await renderCommentsUI(task.id, groupId, members);

  const statusMap = { 'todo': 'To Do', 'in-progress': 'In Progress', 'pending-approval': 'Pending Approval', 'done': 'Completed' };

  container.innerHTML = `
    <div class="modal-overlay" id="task-detail-modal" style="display:flex;">
      <div class="modal" style="max-width:620px; max-height:85vh; display:flex; flex-direction:column;">
        <div class="modal-header">
          <h2>${escapeHtml(task.title)}</h2>
          <button class="btn-icon" id="btn-close-detail-modal" aria-label="Close">✕</button>
        </div>
        <div class="modal-body" style="padding-top:12px; overflow-y:auto; flex:1;">
          <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
            <span class="badge badge-${task.difficulty}">${task.difficulty?.toUpperCase() || 'MEDIUM'}</span>
            ${task.deadline ? `<span class="badge badge-subtle">⏳ ${formatRelative(task.deadline)}</span>` : ''}
            <span class="badge badge-subtle">✨ ${task.weight} ${getTerm('rewardIcon')}</span>
            <span class="badge badge-subtle">📌 ${statusMap[task.status] || task.status}</span>
            ${assignee ? `<span class="badge badge-subtle">👤 ${escapeHtml(assignee.displayName)}</span>` : ''}
          </div>

          <p style="font-size:0.95rem; line-height:1.6; margin-bottom:24px; white-space:pre-wrap; color:var(--text-secondary);">${escapeHtml(task.description || 'No description provided.')}</p>

          <div style="border-top:1px solid var(--border); padding-top:20px;">
            ${commentsHTML}
          </div>
        </div>

        ${viewIsAdmin ? `
          <div class="modal-footer" style="border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; padding:16px;">
            <button id="btn-delete-task-modal" data-task-id="${task.id}" class="btn" style="background:rgba(220,38,38,0.12); color:#f87171; border:1px solid rgba(220,38,38,0.3); border-radius:var(--radius);">
              🗑 Delete Task
            </button>
            <button id="btn-edit-task-modal" data-task-id="${task.id}" class="btn btn-primary">
              ✏️ Edit Task
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Re-render only the comments section when a new comment is added
  bindCommentEvents(task.id, groupId, members, async () => {
    const newCommentsHTML = await renderCommentsUI(task.id, groupId, members);
    document.querySelector('.comments-section').outerHTML = newCommentsHTML;
    bindCommentEvents(task.id, groupId, members);
  });
}

async function saveTask(groupId, members) {
  const id = document.getElementById('task-id').value || generateId();
  const isNew = !document.getElementById('task-id').value;
  const assignedTo = document.getElementById('task-assignee-input').value || null;
  const status = document.getElementById('task-status-input').value || 'todo';
  const me = members.find(m => m.uid === currentUser()?.uid);
  
  const task = {
    id, groupId,
    title: document.getElementById('task-title-input').value.trim(),
    description: document.getElementById('task-desc-input').value.trim(),
    difficulty: document.getElementById('task-diff-input').value,
    weight: Number(document.getElementById('task-weight-input').value) || 100,
    deadline: document.getElementById('task-deadline-input').value || null,
    assignedTo,
    status,
    updatedAt: Date.now(),
    createdAt: isNew ? Date.now() : undefined,
    createdBy: isNew ? me?.id : undefined,
    creatorName: isNew ? me?.displayName : undefined,
  };

  let oldTask = null;
  if (!isNew) {
    oldTask = await get(STORES.TASKS, id);
    task.createdAt = oldTask?.createdAt || Date.now();
    task.createdBy = oldTask?.createdBy;
    task.creatorName = oldTask?.creatorName;
    await put(STORES.TASKS, task);
    await addToSyncQueue({ collection: 'tasks', docId: id, operation: 'update', data: task });
  } else {
    await add(STORES.TASKS, task);
    await addToSyncQueue({ collection: 'tasks', docId: id, operation: 'add', data: task });
  }

  // Log activity
  if (isNew) {
    const statusLabel = { 'todo': 'To Do', 'in-progress': 'In Progress', 'pending-approval': 'Pending Approval', 'done': 'Completed' };
    await logActivity({
      groupId,
      type: 'task_created',
      actorId: me?.id || null,
      actorName: me?.displayName || 'Someone',
      description: `Created task "${task.title}"${assignedTo ? ` and assigned to ${members.find(m => m.id === assignedTo)?.displayName || 'a member'}` : ''} in ${statusLabel[status] || status}`,
      meta: { taskId: id, taskTitle: task.title, status },
    });
  } else {
    // Log assignment change
    if (assignedTo && assignedTo !== oldTask?.assignedTo) {
      const assignee = members.find(m => m.id === assignedTo);
      await logActivity({
        groupId,
        type: 'task_assigned',
        actorId: me?.id || null,
        actorName: me?.displayName || 'Someone',
        description: `${me?.displayName || 'Someone'} assigned "${task.title}" to ${assignee?.displayName || 'a member'}`,
        meta: { taskId: id, taskTitle: task.title },
      });
    }
    // Log status change via modal
    if (status !== oldTask?.status) {
      const statusLabel = { 'todo': 'To Do', 'in-progress': 'In Progress', 'pending-approval': 'Pending Approval', 'done': 'Completed' };
      await logActivity({
        groupId,
        type: status === 'done' ? 'task_completed' : 'task_moved',
        actorId: me?.id || null,
        actorName: me?.displayName || 'Someone',
        description: `Moved "${task.title}" to ${statusLabel[status] || status}`,
        meta: { taskId: id, taskTitle: task.title, oldStatus: oldTask?.status, newStatus: status },
      });
    }
  }

  // Notify assignee if newly assigned
  if (assignedTo && (!oldTask || oldTask.assignedTo !== assignedTo)) {
    const assignee = members.find(m => m.id === assignedTo);
    if (assignee) {
      await notify({
        uid: assignee.uid, type: 'task_assigned',
        title: 'New Task Assigned',
        message: `You were assigned "${task.title}".`,
        icon: '📋', actionLink: `#/group/${groupId}`, groupId
      });
    }
  }
}

async function moveTask(taskId, newStatus, groupId, members) {
  const task = await get(STORES.TASKS, taskId);
  if (!task || task.status === newStatus) return;
  const oldStatus = task.status;
  task.status = newStatus;
  task.updatedAt = Date.now();
  if (newStatus === 'done') task.completedAt = Date.now();
  await put(STORES.TASKS, task);
  await addToSyncQueue({ collection: 'tasks', docId: taskId, operation: 'update', data: task });

  // Map status keys to human-readable labels
  const statusLabel = { 'todo': 'To Do', 'in-progress': 'In Progress', 'pending-approval': 'Pending Approval', 'done': 'Completed' };
  const mover = members.find(m => m.uid === currentUser()?.uid);

  // Log the card move
  await logActivity({
    groupId,
    type: newStatus === 'done' ? 'task_completed' : 'task_moved',
    actorId: mover?.id || null,
    actorName: mover?.displayName || 'Someone',
    description: `Moved "${task.title}" from ${statusLabel[oldStatus] || oldStatus} → ${statusLabel[newStatus] || newStatus}`,
    meta: { taskId, taskTitle: task.title, oldStatus, newStatus },
  });

  // Notifications
  if (newStatus === 'pending-approval') {
    const admins = members.filter(m => m.role === 'owner' || m.role === 'co-admin');
    for (const a of admins) {
      await notify({
        uid: a.uid, type: 'approval_request',
        title: 'Approval Requested',
        message: `A task needs approval: "${task.title}"`,
        icon: '⏳', actionLink: `#/group/${groupId}`, groupId
      });
    }
  } else if (newStatus === 'done' && oldStatus !== 'done') {
    const assignee = members.find(m => m.id === task.assignedTo);
    if (assignee) {
      await notify({
        uid: assignee.uid, type: 'approval_granted',
        title: 'Task Completed! 🎉',
        message: `Your task "${task.title}" was marked complete.`,
        icon: '✅', actionLink: `#/group/${groupId}`, groupId
      });
    }
  }
}
