/**
 * TaskModal — All modal HTML templates and open/populate functions.
 * Covers: task create/edit, task detail view, share, proof submit, proof review.
 */

import { escapeHtml, formatRelative } from '../../utils/helpers.js';
import { getTerm } from '../../services/themeService.js';
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

export function taskModalHTML(members, statuses) {
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
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-close-modal">Cancel</button>
            <button type="submit" class="btn btn-primary">${getTerm('saveTask')}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function shareModalHTML(members, group) {
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

              ${members.map((m) => `
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

// ── Modal open/populate functions ─────────────────────────────────────────────

/** Populate and open the task create/edit modal. */
export function openTaskModal(task = null, defaultStatus = 'todo') {
  const modal = document.getElementById('task-modal');
  document.getElementById('modal-title').innerHTML = task
    ? `Edit ${getTerm('task')}`
    : `New ${getTerm('task')}`;

  document.getElementById('task-id').value            = task?.id || '';
  document.getElementById('task-title-input').value   = task?.title || '';
  document.getElementById('task-desc-input').value    = task?.description || '';
  document.getElementById('task-diff-input').value    = task?.difficulty || 'medium';
  const taskTypeInput = document.getElementById('task-type-input');
  if (taskTypeInput) {
    taskTypeInput.value = task?.type || (Array.isArray(task?.tags) && task.tags[0]) || 'task';
  }
  document.getElementById('task-weight-input').value  = task?.weight || 100;
  document.getElementById('task-deadline-input').value = task?.deadline || '';

  const assigned = task?.assignedTo || '';
  document.getElementById('task-assignee-input').value = assigned;
  document.querySelectorAll('#assignee-options-container .assignee-option').forEach((o) => {
    o.classList.toggle('selected', o.dataset.uid === assigned);
  });

  const status = task?.status || defaultStatus;
  document.getElementById('task-status-input').value = status;
  document.querySelectorAll('#status-options-container .assignee-option').forEach((o) => {
    o.classList.toggle('selected', o.dataset.status === status);
  });

  modal.hidden = false;
  document.getElementById('task-title-input').focus();
}

/** Render and open the full task detail modal (with comments). */
export async function openTaskDetailModal(task, groupId, members, viewIsAdmin) {
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

  // Re-render only the comments section on new comment
  bindCommentEvents(task.id, groupId, members, async () => {
    const newCommentsHTML = await renderCommentsUI(task.id, groupId, members);
    document.querySelector('.comments-section').outerHTML = newCommentsHTML;
    bindCommentEvents(task.id, groupId, members);
  });
}
