/**
 * TaskModal — All modal HTML templates and open/populate functions.
 * Covers: task create/edit, task detail view, share, proof submit, proof review.
 */

import { escapeHtml, formatRelative } from '../../utils/helpers.js';
import { getTerm, getRoleName } from '../../services/themeService.js';
import { renderCommentsUI, bindCommentEvents } from './TaskComments.js';

const DIFFICULTIES = [
  { key: 'easy',      label: 'Easy'       },
  { key: 'medium',    label: 'Medium'     },
  { key: 'hard',      label: 'Hard'       },
  { key: 'legendary', label: 'Legendary'  },
];

const STATUS_LABELS = {
  'todo':             'To Do',
  'in-progress':      'In Progress',
  'pending-approval': 'Pending Approval',
  'done':             'Completed',
};

// ── Static modal HTML templates ───────────────────────────────────────────────

export function taskModalHTML(members, statuses, isAdmin = true) {
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
          <input type="hidden" id="task-is-admin" value="${isAdmin ? '1' : '0'}" />
          <div class="form-group">
            <label for="task-title-input">${getTerm('task')} Title</label>
            <input type="text" id="task-title-input" required placeholder="..." />
          </div>
          <div class="form-group">
            <label for="task-desc-input">Description</label>
            <textarea id="task-desc-input" rows="4" placeholder="Enter details..."></textarea>
          </div>
          ${isAdmin ? `
          <div class="form-row">
            <div class="form-group">
              <label for="task-diff-input">Difficulty</label>
              <select id="task-diff-input">
                ${DIFFICULTIES.map((d) => `<option value="${d.key}">${d.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="task-type-input">Task Type / Tag</label>
              <select id="task-type-input">
                <option value="task">📋 General Task</option>
                <option value="bug">🐛 Bug / Issue</option>
                <option value="feature">✨ Feature</option>
                <option value="documentation">📝 Documentation</option>
                <option value="research">🔬 Research</option>
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
              ${members.map((m) => `
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
              ${statuses.map((s) => `
                <div class="assignee-option" data-status="${s.key}">
                  ${s.icon} ${s.label}
                </div>
              `).join('')}
            </div>
            <input type="hidden" id="task-status-input" value="todo" />
          </div>
          ` : `
          <input type="hidden" id="task-diff-input" value="" />
          <input type="hidden" id="task-type-input" value="" />
          <input type="hidden" id="task-weight-input" value="" />
          <input type="hidden" id="task-deadline-input" value="" />
          <input type="hidden" id="task-assignee-input" value="" />
          <input type="hidden" id="task-status-input" value="" />
          <div class="member-edit-notice" style="display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:var(--radius); background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.2); font-size:0.82rem; color:var(--text-secondary); margin-bottom:8px;">
            <span style="font-size:1.1rem;">🔒</span>
            <span>As an assignee you can only edit the <strong>description</strong>. Contact an admin to change points, difficulty, or type.</span>
          </div>
          `}
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-close-modal">Cancel</button>
            <button type="submit" class="btn btn-primary">${getTerm('saveTask')}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function shareModalHTML(members, group, profileMap = {}) {
  const pendingRequests = group?.joinRequests || [];

  return `
    <div class="modal-overlay" id="share-modal" hidden>
      <div class="modal" style="max-width: 520px;">
        <div class="modal-header">
          <h2>Share this Board</h2>
          <button class="btn-icon btn-close-modal" aria-label="Close">✕</button>
        </div>

        <!-- Share Tabs -->
        <div class="share-tabs-nav" style="display:flex; border-bottom:1px solid var(--border); margin-bottom:16px;">
          <button type="button" class="share-tab-btn active" data-tab="access" style="flex:1; padding:10px 14px; background:transparent; border:none; border-bottom:2px solid var(--primary); color:var(--primary); font-family:var(--font-heading); font-weight:700; font-size:0.85rem; cursor:pointer;">
            Who Has Access (${members.length})
          </button>
          <button type="button" class="share-tab-btn" data-tab="requests" style="flex:1; padding:10px 14px; background:transparent; border:none; border-bottom:2px solid transparent; color:var(--text-secondary); font-family:var(--font-heading); font-weight:600; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
            Join Requests
            <span class="share-req-badge" id="share-req-badge" style="background:${pendingRequests.length > 0 ? 'var(--warning)' : 'var(--border)'}; color:#000; font-size:0.7rem; font-weight:700; padding:1px 6px; border-radius:10px;">${pendingRequests.length}</span>
          </button>
        </div>

        <div class="modal-body" style="padding-top:0;">
          <!-- TAB 1: WHO HAS ACCESS -->
          <div id="share-tab-access-content">
            <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom:12px;">
              Invite teammates using this board's invite code: <strong style="color:var(--primary); font-size:0.95rem;">${escapeHtml(group?.inviteCode || '')}</strong>
            </p>

            <div style="position:relative; margin-bottom:12px;">
              <input type="text" id="share-member-search" class="input" placeholder="Filter members by name..." style="width:100%; box-sizing:border-box; font-size:0.82rem; padding:6px 10px;" />
            </div>

            <div class="share-member-list" id="share-members-container" style="max-height:240px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
              ${members.map((m) => {
                const prof = profileMap[m.uid] || {};
                const hasPhoto = prof.avatarType === 'custom' && prof.avatar;
                const avatarHTML = hasPhoto
                  ? `<img src="${prof.avatar}" alt="${escapeHtml(m.displayName?.[0] || '?')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                  : escapeHtml(m.displayName?.[0] || '?');
                const email = prof.email || m.email || (m.uid.includes('@') ? m.uid : '');

                return `
                  <div class="share-member-row" data-member-name="${escapeHtml(m.displayName.toLowerCase())}">
                    <div class="avatar" style="overflow:hidden; width:34px; height:34px; flex-shrink:0;">
                      ${avatarHTML}
                    </div>
                    <div class="share-member-info" style="flex:1; min-width:0;">
                      <span class="share-member-name" style="font-size:0.85rem; font-weight:600; color:var(--text);">${escapeHtml(m.displayName)}</span>
                      ${email ? `<span class="share-member-email" style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(email)}</span>` : ''}
                    </div>
                    ${m.role === 'owner' ? `
                      <span class="share-role-locked" style="background:var(--primary-soft); color:var(--primary); padding:3px 10px; border-radius:12px; font-size:0.72rem; font-family:var(--font-heading); font-weight:700;">${escapeHtml(getRoleName('owner').toUpperCase())}</span>
                    ` : `
                      <select class="share-role-select" data-member-id="${m.id}" style="font-size:0.75rem; padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                        <option value="co-admin" ${m.role === 'co-admin' ? 'selected' : ''}>${escapeHtml(getRoleName('co-admin'))}</option>
                        <option value="member" ${m.role === 'member' ? 'selected' : ''}>${escapeHtml(getRoleName('member'))}</option>
                        <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>${escapeHtml(getRoleName('viewer'))}</option>
                        <option value="remove">Remove</option>
                      </select>
                    `}
                  </div>
                `;
              }).join('')}
            </div>

            <div class="link-box" style="margin-top:16px;">
              <span class="link-url">${window.location.origin}/#/?join=${group?.inviteCode || ''}</span>
              <button class="btn btn-secondary btn-sm" id="btn-copy-link-bottom">COPY</button>
            </div>
          </div>

          <!-- TAB 2: JOIN REQUESTS -->
          <div id="share-tab-requests-content" hidden>
            <div style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:12px;">
              Review and manage pending requests to join this board. ${escapeHtml(getRoleName('owner'))}s and ${escapeHtml(getRoleName('co-admin'))}s can assign roles and approve.
            </div>

            <div id="join-requests-container" style="display:flex; flex-direction:column; gap:10px; max-height:280px; overflow-y:auto;">
              ${pendingRequests.length === 0 ? `
                <div style="padding:28px 12px; text-align:center; color:var(--text-muted); font-size:0.85rem;">
                  <div style="font-size:1.6rem; margin-bottom:6px;">📬</div>
                  No pending join requests at this time.
                </div>
              ` : pendingRequests.map((req) => `
                <div class="join-request-card" data-request-id="${req.id}" style="display:flex; align-items:center; gap:12px; padding:12px; border-radius:10px; background:var(--bg-card); border:1px solid var(--border);">
                  <div class="avatar" style="width:36px; height:36px; flex-shrink:0;">
                    ${escapeHtml(req.displayName?.[0] || '?')}
                  </div>
                  <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.85rem; color:var(--text);">${escapeHtml(req.displayName || 'Applicant')}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(req.email || req.uid || '')}</div>
                    <div style="font-size:0.7rem; color:var(--accent); margin-top:2px;">Requested: ${new Date(req.requestedAt || Date.now()).toLocaleDateString()}</div>
                  </div>
                  <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                    <select class="join-request-role-select" data-request-id="${req.id}" style="font-size:0.72rem; padding:3px 6px; border-radius:6px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                      <option value="member" selected>Role: ${escapeHtml(getRoleName('member'))}</option>
                      <option value="viewer">Role: ${escapeHtml(getRoleName('viewer'))}</option>
                      <option value="co-admin">Role: ${escapeHtml(getRoleName('co-admin'))}</option>
                    </select>
                    <div style="display:flex; gap:6px;">
                      <button class="btn btn-primary btn-sm btn-accept-request" data-request-id="${req.id}" style="font-size:0.72rem; padding:3px 10px;">Accept</button>
                      <button class="btn btn-secondary btn-sm btn-decline-request" data-request-id="${req.id}" style="font-size:0.72rem; padding:3px 8px; color:var(--danger);">Decline</button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function boardMembersModalHTML(members, profileMap = {}) {
  return `
    <div class="modal-overlay" id="board-members-modal" hidden>
      <div class="modal" style="max-width: 480px;">
        <div class="modal-header">
          <h2>Board Members (${members.length})</h2>
          <button class="btn-icon btn-close-modal" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <div style="position:relative; margin-bottom:14px;">
            <input type="text" id="board-member-search" class="input" placeholder="Search members by name or email..." style="width:100%; box-sizing:border-box; font-size:0.85rem;" />
          </div>

          <div class="board-member-list-container" id="board-member-list" style="display:flex; flex-direction:column; gap:8px; max-height:360px; overflow-y:auto;">
            ${members.map((m) => {
              const prof = profileMap[m.uid] || {};
              const hasPhoto = prof.avatarType === 'custom' && prof.avatar;
              const avatarHTML = hasPhoto
                ? `<img src="${prof.avatar}" alt="${escapeHtml(m.displayName?.[0] || '?')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : escapeHtml(m.displayName?.[0] || '?');
              const roleLabel = getRoleName(m.role);
              const email = prof.email || m.email || (m.uid.includes('@') ? m.uid : '');

              return `
                <div class="board-member-item" data-member-id="${m.id}" data-name="${escapeHtml(m.displayName.toLowerCase())}" data-email="${escapeHtml(email.toLowerCase())}" style="display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:10px; border:1px solid var(--border); background:var(--bg-card); cursor:pointer; transition:all var(--transition);">
                  <div class="avatar" style="width:40px; height:40px; font-size:1.1rem; flex-shrink:0; overflow:hidden;">
                    ${avatarHTML}
                  </div>
                  <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.9rem; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(m.displayName)}</div>
                    ${email ? `<div style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(email)}</div>` : ''}
                  </div>
                  <span class="profile-role-badge" style="font-size:0.7rem; padding:3px 8px; flex-shrink:0;">${roleLabel}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}


export function proofReviewModalHTML() {
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

export function proofSubmitModalHTML() {
  return `
    <div class="modal-overlay" id="proof-submit-modal" hidden>
      <div class="modal" style="max-width:460px;">
        <div class="modal-header">
          <h2>Submit for Approval</h2>
          <button class="btn-icon btn-close-modal" aria-label="Close">✕</button>
        </div>
        <form id="proof-submit-form" class="modal-body">
          <input type="hidden" id="submit-task-id" />
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:16px;">Attach a link to your work (e.g. a PR, doc, or screenshot URL). You can also skip if no link is needed.</p>
          <div class="form-group">
            <label for="submit-proof-link">📎 Proof Link</label>
            <input type="url" id="submit-proof-link" placeholder="https://..." style="width:100%; box-sizing:border-box;" />
          </div>
          <div class="modal-footer" style="flex-direction:column; gap:8px; align-items:stretch;">
            <button type="submit" class="btn btn-primary" style="width:100%;">🚀 Submit with Link</button>
            <button type="button" class="btn btn-secondary" id="btn-submit-no-link" style="width:100%;">Proceed without a link</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// ── Modal open/populate functions ─────────────────────────────────────────────

/** Populate and open the task create/edit modal. */
export function openTaskModal(task = null, defaultStatus = 'todo') {
  const modal = document.getElementById('task-modal');
  document.getElementById('modal-title').innerHTML = task
    ? `Edit ${getTerm('task')}`
    : `New ${getTerm('task')}`;

  document.getElementById('task-id').value          = task?.id || '';
  document.getElementById('task-title-input').value = task?.title || '';
  document.getElementById('task-desc-input').value  = task?.description || '';

  // Safely populate fields that may be hidden (non-admin member edit)
  const diffEl   = document.getElementById('task-diff-input');
  const typeEl   = document.getElementById('task-type-input');
  const weightEl = document.getElementById('task-weight-input');
  const deadlineEl = document.getElementById('task-deadline-input');
  const assigneeEl = document.getElementById('task-assignee-input');
  const statusEl   = document.getElementById('task-status-input');

  if (diffEl)   diffEl.value   = task?.difficulty || 'medium';
  if (typeEl)   typeEl.value   = task?.type || (Array.isArray(task?.tags) && task.tags[0]) || 'task';
  if (weightEl) weightEl.value = task?.weight || 100;
  if (deadlineEl) deadlineEl.value = task?.deadline || '';

  const assigned = task?.assignedTo || '';
  if (assigneeEl) assigneeEl.value = assigned;
  document.querySelectorAll('#assignee-options-container .assignee-option').forEach((o) => {
    o.classList.toggle('selected', o.dataset.uid === assigned);
  });

  const status = task?.status || defaultStatus;
  if (statusEl) statusEl.value = status;
  // E1a: a Completed task's status is locked
  const statusLocked = task?.status === 'done';
  document.querySelectorAll('#status-options-container .assignee-option').forEach((o) => {
    const disabled = statusLocked && o.dataset.status !== 'done';
    o.classList.toggle('selected', o.dataset.status === status);
    o.classList.toggle('disabled', disabled);
    o.style.opacity = disabled ? '0.4' : '';
    o.style.cursor  = disabled ? 'not-allowed' : '';
    o.title = disabled ? 'Completed tasks are locked' : '';
  });

  modal.hidden = false;
  document.getElementById('task-title-input').focus();
}

/** Render and open the full task detail modal (with comments). */
export async function openTaskDetailModal(task, groupId, members, viewIsAdmin, me) {
  const container = document.getElementById('task-detail-modal-container');
  const assignee = members.find((m) => m.id === task.assignedTo);

  const commentsHTML = await renderCommentsUI(task.id, groupId, members);

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
            <span class="badge badge-subtle">📌 ${STATUS_LABELS[task.status] || task.status}</span>
            ${assignee ? `<a href="#/profile/${assignee.uid || assignee.id}" class="badge badge-subtle link-assignee-profile" style="text-decoration:none; cursor:pointer;" title="View ${escapeHtml(assignee.displayName)}'s profile & achievements">👤 ${escapeHtml(assignee.displayName)}</a>` : ''}
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
        ` : (me && task.assignedTo && (task.assignedTo === me.id || task.assignedTo === me.uid)) ? `
          <div class="modal-footer" style="border-top:1px solid var(--border); display:flex; justify-content:flex-end; align-items:center; padding:16px;">
            <button id="btn-edit-task-modal" data-task-id="${task.id}" class="btn btn-primary">
              ✏️ Edit Task
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  container.querySelector('.link-assignee-profile')?.addEventListener('click', () => {
    document.getElementById('task-detail-modal')?.remove();
  });

  // Re-render only the comments section on new comment
  bindCommentEvents(task.id, groupId, members, async () => {
    const newCommentsHTML = await renderCommentsUI(task.id, groupId, members);
    document.querySelector('.comments-section').outerHTML = newCommentsHTML;
    bindCommentEvents(task.id, groupId, members);
  });
}
