/**
 * TaskCard — Renders a single task card for the Kanban board.
 * Also handles the achievement unlock popup.
 */

import { escapeHtml, formatRelative } from '../../utils/helpers.js';
import { getTerm } from '../../services/themeService.js';
import { canDragTask } from './taskPermissions.js';

/** I2: the chip shows what the member earns; the tooltip says it is also the weight. */
export function rewardTooltip(weight) {
  return `Weight ${weight}. Earns ${weight} ${getTerm('rewardLabel').toLowerCase()} when approved.`;
}

/**
 * Returns the HTML string for a single task card.
 * The board delegates events, so no listeners are attached here.
 */
export function taskCardHTML(task, members, proofs, comments, viewIsAdmin, me, profileMap = {}) {
  const assignee = members.find((m) => m.id === task.assignedTo);
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';
  const deadlineClass = isOverdue ? 'overdue' : '';
  const diffClass = `badge-${task.difficulty || 'medium'}`;

  const proof = proofs.find((p) => p.taskId === task.id);
  const commentCount = comments.filter((c) => c.taskId === task.id && !c.deleted).length;
  const isMyCard = !viewIsAdmin && assignee?.id === me?.id;
  // D5: only cards this person can actually move pick up on drag
  const canDrag = canDragTask(task, me);

  let proofBadge = '';
  if (task.status === 'pending-approval') {
    proofBadge = viewIsAdmin
      ? `<button class="btn btn-primary btn-block btn-review-proof" data-proof-id="${proof?.id || ''}" data-task-id="${task.id}" style="margin-bottom:12px; font-size:0.7rem;">${getTerm('reviewProof')}</button>`
      : `<span class="proof-status-badge">AWAITING APPROVAL</span>`;
  } else if (proof?.status === 'rejected') {
    proofBadge = `<span class="proof-status-badge proof-status-rejected">REJECTED ${proof.note ? `- ${escapeHtml(proof.note)}` : ''}</span>`;
    if (!viewIsAdmin && isMyCard && task.status !== 'done') {
      proofBadge += `<button class="btn btn-secondary btn-block btn-submit-proof" data-task-id="${task.id}" style="margin-bottom:12px; font-size:0.7rem;">🔄 ${getTerm('resubmitProof')}</button>`;
    }
  } else if (!viewIsAdmin && task.status === 'in-progress' && isMyCard) {
    proofBadge = `<button class="btn btn-primary btn-block btn-submit-proof" data-task-id="${task.id}" style="margin-bottom:12px; font-size:0.75rem; letter-spacing:0.5px;">🚀 ${getTerm('submitProof')}</button>`;
  } else if (!viewIsAdmin && task.status === 'todo' && isMyCard) {
    proofBadge = `<button class="btn btn-secondary btn-block btn-move-to-progress" data-task-id="${task.id}" style="margin-bottom:12px; font-size:0.75rem;">▶ MOVE TO IN PROGRESS</button>`;
  } else if (!viewIsAdmin && task.status === 'todo' && !assignee) {
    proofBadge = `<button class="btn btn-primary btn-block btn-self-assign" data-task-id="${task.id}" style="margin-bottom:12px; font-size:0.7rem;">${getTerm('acceptTask')}</button>`;
  }

  const isBug = task.type === 'bug' || (Array.isArray(task.tags) && task.tags.some(t => t.toLowerCase() === 'bug'));
  const tagBadge = isBug
    ? `<span class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3); font-weight:600;">🐛 Bug</span>`
    : (task.type && task.type !== 'task' ? `<span class="badge badge-subtle">${escapeHtml(task.type)}</span>` : '');

  // Build assignee avatar — show photo if available
  let assigneeAvatarHTML = '';
  if (assignee) {
    const prof = profileMap[assignee.uid];
    const hasPhoto = prof?.avatarType === 'custom' && prof?.avatar;
    assigneeAvatarHTML = `
      <a href="#/profile/${assignee.uid || assignee.id}" class="task-assignee" data-member-uid="${assignee.uid}" style="text-decoration:none; color:inherit; cursor:pointer;" title="View ${escapeHtml(assignee.displayName || 'member')}'s achievements">
        <div class="avatar" style="overflow:hidden;">
          ${hasPhoto
            ? `<img src="${prof.avatar}" alt="${escapeHtml(assignee.displayName?.[0] || '?')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : escapeHtml(assignee.displayName?.[0] || '?')
          }
        </div>
        <div>
          <span class="task-assignee-label">Assigned</span>
          <span class="task-assignee-name">${escapeHtml(assignee.displayName || assignee.uid)}</span>
        </div>
      </a>`;
  } else {
    assigneeAvatarHTML = `<span class="task-assignee-label" style="margin:0; opacity:0.6;">Unassigned</span>`;
  }

  // Show proof link row if proof has a link
  const proofLinkRow = proof?.link
    ? `<div class="task-proof-link" style="display:flex; align-items:center; gap:6px; padding:6px 0; border-top:1px solid var(--border); margin-top:6px; font-size:0.75rem; color:var(--text-secondary);">
        <span>🔗</span>
        <a href="${escapeHtml(proof.link)}" target="_blank" rel="noopener" style="color:var(--primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;" title="${escapeHtml(proof.link)}">${escapeHtml(proof.link)}</a>
      </div>`
    : '';

  return `
    <div class="task-card ${canDrag ? 'draggable' : ''}" ${canDrag ? 'draggable="true"' : ''} data-task-id="${task.id}">
      <div class="task-card-top">
        <div class="task-badges">
          <span class="badge ${diffClass}">${escapeHtml(task.difficulty || 'MEDIUM')}</span>
          ${tagBadge}
          ${task.deadline ? `<span class="task-deadline ${deadlineClass}">⏳ ${formatRelative(task.deadline)}</span>` : ''}
          ${commentCount > 0 ? `<span class="badge badge-subtle">💬 ${commentCount}</span>` : ''}
        </div>
        ${canDrag ? '<span class="drag-handle" title="Drag to move" aria-hidden="true">⋮⋮</span>' : ''}
      </div>
      <h3 class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</h3>
      ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ''}

      ${proofBadge}
      ${proofLinkRow}

      <div class="task-card-bottom">
        ${assigneeAvatarHTML}
          <span class="task-reward" style="margin-left: auto;" title="${escapeHtml(rewardTooltip(task.weight || 100))}">${task.weight || 100} ${getTerm('rewardIcon')}</span>
      </div>
    </div>
  `;
}



/** Brief achievement unlock popup — auto-dismisses after 5 s. */
export function renderAchievementPopup(badge) {
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
