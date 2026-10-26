/**
 * Card Comments — Real-time commenting on tasks.
 * Shows commenter profile picture, top badge inline, and clickable member popup.
 */

import { STORES, get, getAllByIndex, getAll, put, add, addToSyncQueue, remove } from '../../services/indexedDBService.js';
import { currentUser } from '../../services/authService.js';
import { escapeHtml, generateId } from '../../utils/helpers.js';
import { notify } from '../../services/notificationService.js';
import { ICONS } from '../../assets/icons/icons.js';
import { logActivity } from '../../services/activityLogService.js';
import { getAllBadges } from '../../core/badgeEngine.js';

const ALL_BADGE_DEFS = getAllBadges();

/** Returns the top badge definition for a member by looking up their stored badges. */
async function getMemberTopBadge(memberUid, memberIdList) {
  const allBadges = await getAll(STORES.BADGES);
  const memberBadgeTypes = new Set(
    allBadges
      .filter(b => memberIdList.includes(b.memberId) || b.uid === memberUid)
      .map(b => b.type)
  );
  // Return first badge definition that is earned (ordered by ALL_BADGE_DEFS priority)
  return ALL_BADGE_DEFS.find(b => memberBadgeTypes.has(b.id)) || null;
}

/** Build a member mini-profile popup HTML. Called on member avatar/name click. */
async function buildMemberPopup(member, groupId) {
  const allTasks  = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  const allBadges = await getAll(STORES.BADGES);
  const allComments = await getAll(STORES.COMMENTS);
  const allMembers  = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
  const profile = await get(STORES.USER_PROFILES, member.uid) || {};

  const allMemberIds = allMembers.filter(m => m.uid === member.uid).map(m => m.id);
  const completedTasks = allTasks.filter(t => t.assignedTo === member.id && t.status === 'done').length;
  const commentCount   = allComments.filter(c => allMemberIds.includes(c.memberId) && !c.deleted).length;

  const memberBadgeTypes = new Set(
    allBadges
      .filter(b => allMemberIds.includes(b.memberId) || b.uid === member.uid)
      .map(b => b.type)
  );
  const earnedBadges = ALL_BADGE_DEFS.filter(b => memberBadgeTypes.has(b.id));

  // Streak calculation (simplified: count consecutive days with completed tasks)
  const doneDates = allTasks
    .filter(t => allMemberIds.includes(t.assignedTo) && t.completedAt)
    .map(t => new Date(t.completedAt).toDateString());
  const uniqueDays = [...new Set(doneDates)].sort();
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if (uniqueDays.includes(d.toDateString())) streak++;
    else if (i > 0) break;
  }

  const hasPhoto = profile.avatarType === 'custom' && profile.avatar;
  const avatarHTML = hasPhoto
    ? `<img src="${profile.avatar}" alt="${escapeHtml(member.displayName?.[0] || '?')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : escapeHtml(member.displayName?.[0] || '?');
  const mockUsers = JSON.parse(localStorage.getItem('grouptask_mock_users') || '[]');
  const email = profile.email || member.email || mockUser?.email || (member.uid === currentUser()?.uid ? currentUser()?.email : null) || '';

  return `
    <div class="member-popup-overlay" id="member-popup-overlay">
      <div class="member-popup">
        <button class="btn-icon member-popup-close" id="member-popup-close" style="position:absolute;top:12px;right:12px;">✕</button>
        <div style="display:flex; gap:16px; align-items:flex-start; margin-bottom:16px;">
          <div class="avatar" style="width:56px;height:56px;font-size:1.4rem;flex-shrink:0;overflow:hidden;">${avatarHTML}</div>
          <div>
            <h3 style="margin:0 0 4px 0; font-size:1.1rem;">${escapeHtml(member.displayName)}</h3>
            ${email ? `
              <div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:4px; display:flex; align-items:center; gap:4px;">
                <span>✉️</span> <span>${escapeHtml(email)}</span>
              </div>
            ` : ''}
            <div style="font-size:0.78rem; color:var(--primary); font-family:var(--font-heading); font-weight:600;">
              ${member.role === 'owner' ? 'Owner' : member.role === 'co-admin' ? 'Co-owner' : member.role === 'viewer' ? 'Only View' : 'Member'}
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:16px; text-align:center;">
          <div style="background:var(--bg); border-radius:8px; padding:10px 6px; border:1px solid var(--border);">
            <div style="font-size:1.1rem; font-weight:700; color:var(--primary);">${completedTasks}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">Tasks Done</div>
          </div>
          <div style="background:var(--bg); border-radius:8px; padding:10px 6px; border:1px solid var(--border);">
            <div style="font-size:1.1rem; font-weight:700; color:var(--accent);">${streak}d</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">Streak</div>
          </div>
          <div style="background:var(--bg); border-radius:8px; padding:10px 6px; border:1px solid var(--border);">
            <div style="font-size:1.1rem; font-weight:700; color:var(--success);">${commentCount}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">Comments</div>
          </div>
        </div>

        ${earnedBadges.length > 0 ? `
          <div style="margin-bottom:8px;">
            <div style="font-size:0.72rem; color:var(--text-muted); font-family:var(--font-heading); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Badges Earned</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${earnedBadges.map(b => `
                <span title="${escapeHtml(b.label)}" style="display:inline-flex;align-items:center;gap:4px; background:var(--bg-card); border:1px solid var(--border); border-radius:20px; padding:3px 8px; font-size:0.72rem; color:var(--text-secondary);">
                  <span style="font-size:0.85rem;">${b.icon}</span> ${escapeHtml(b.label)}
                </span>
              `).join('')}
            </div>
          </div>
        ` : `<p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">No badges yet.</p>`}
      </div>
    </div>
  `;
}

export async function renderCommentsUI(taskId, groupId, members) {
  const allComments = await getAllByIndex(STORES.COMMENTS, 'taskId', taskId);
  const sortedComments = allComments.sort((a, b) => a.createdAt - b.createdAt);
  
  const user = currentUser();
  const me = members.find(m => m.uid === user?.uid);

  // Pre-fetch badges for all comment authors
  const allBadges = await getAll(STORES.BADGES);
  const allProfiles = await getAll(STORES.USER_PROFILES);
  const profileMap = {};
  allProfiles.forEach(p => { profileMap[p.uid] = p; });

  const buildCommentHTML = (c) => {
    const author = members.find(m => m.id === c.memberId) || { displayName: 'Unknown', uid: '' };
    const isMine = c.memberId === me?.id;

    // Get top badge for this author
    const authorMemberIds = members.filter(m => m.uid === author.uid).map(m => m.id);
    const authorBadgeTypes = new Set(
      allBadges
        .filter(b => authorMemberIds.includes(b.memberId) || b.uid === author.uid)
        .map(b => b.type)
    );
    const topBadge = ALL_BADGE_DEFS.find(b => authorBadgeTypes.has(b.id));

    // Profile picture
    const prof = profileMap[author.uid];
    const hasPhoto = prof?.avatarType === 'custom' && prof?.avatar;
    const avatarHTML = hasPhoto
      ? `<img src="${prof.avatar}" alt="${escapeHtml(author.displayName?.[0] || '?')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : escapeHtml(author.displayName?.[0] || '?');

    return `
      <div class="comment-item" data-comment-id="${c.id}">
        <div class="avatar avatar-sm comment-author-avatar" data-member-id="${c.memberId}" data-group-id="${groupId}" style="cursor:pointer; overflow:hidden; flex-shrink:0;">${avatarHTML}</div>
        <div class="comment-content">
          <div class="comment-header">
            <span class="comment-author comment-author-link" data-member-id="${c.memberId}" data-group-id="${groupId}" style="cursor:pointer;">${escapeHtml(author.displayName)}</span>
            ${topBadge ? `<span class="comment-badge-inline" title="${escapeHtml(topBadge.label)}" style="display:inline-flex;align-items:center;gap:2px; background:var(--primary-soft); border:1px solid var(--border); border-radius:12px; padding:1px 6px; font-size:0.65rem; color:var(--primary); margin-left:4px; vertical-align:middle;">${topBadge.icon} <span style="font-family:var(--font-heading);">${escapeHtml(topBadge.label)}</span></span>` : ''}
            <span class="comment-time">${new Date(c.createdAt).toLocaleString()}</span>
          </div>
          <div class="comment-text ${c.deleted ? 'comment-deleted' : ''}">
            ${c.deleted ? '<i>This comment was deleted.</i>' : escapeHtml(c.text)}
          </div>
          ${!c.deleted && isMine ? `
            <div class="comment-actions">
              <button class="btn-link btn-delete-comment" data-id="${c.id}">Delete</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  };

  return `
    <div class="comments-section">
      <h3 style="margin-bottom:12px; font-size:1rem;">${ICONS.message} Comments (${sortedComments.filter(c => !c.deleted).length})</h3>
      <div class="comments-list" id="comments-list-${taskId}">
        ${sortedComments.map(buildCommentHTML).join('')}
        ${sortedComments.length === 0 ? '<p class="empty-state" style="padding:8px 0; font-size:0.85rem;">No comments yet.</p>' : ''}
      </div>
      
      <form class="comment-form" id="comment-form-${taskId}">
        <input type="text" id="comment-input-${taskId}" placeholder="Add a comment... (Type @ to mention)" required />
        <button type="submit" class="btn btn-primary btn-sm">Send</button>
      </form>
    </div>
  `;
}

export function bindCommentEvents(taskId, groupId, members, onCommentAdded) {
  const form = document.getElementById(`comment-form-${taskId}`);
  const input = document.getElementById(`comment-input-${taskId}`);
  const list = document.getElementById(`comments-list-${taskId}`);

  if (!form || !input || !list) return;

  const user = currentUser();
  const me = members.find(m => m.uid === user?.uid);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !me) return;

    const comment = {
      id: generateId(),
      taskId,
      groupId,
      memberId: me.id,
      text,
      createdAt: Date.now(),
      deleted: false
    };

    await add(STORES.COMMENTS, comment);
    await addToSyncQueue({ collection: 'comments', docId: comment.id, operation: 'add', data: comment });

    // Log comment activity
    const task = await get(STORES.TASKS, taskId).catch(() => null);
    await logActivity({
      groupId,
      type: 'comment_added',
      actorId: me?.id || null,
      actorName: me?.displayName || 'Someone',
      description: `${me?.displayName || 'Someone'} commented on "${task?.title || 'a task'}": "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`,
      meta: { taskId, commentId: comment.id },
    });

    input.value = '';
    
    // Check for mentions and notify
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const name = match[1].toLowerCase();
      const mentioned = members.find(m => m.displayName.toLowerCase().includes(name));
      if (mentioned && mentioned.id !== me.id) {
        await notify({
          uid: mentioned.uid, type: 'comment_added',
          title: 'You were mentioned',
          message: `${me.displayName} mentioned you in a comment.`,
          icon: '💬', actionLink: `#/group/${groupId}`, groupId
        });
      }
    }

    if (onCommentAdded) await onCommentAdded();
  });

  // Delete comments
  list.querySelectorAll('.btn-delete-comment').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Delete this comment?')) {
        const id = btn.dataset.id;
        const comment = await get(STORES.COMMENTS, id);
        if (comment) {
          comment.deleted = true;
          await put(STORES.COMMENTS, comment);
          await addToSyncQueue({ collection: 'comments', docId: id, operation: 'update', data: comment });
          if (onCommentAdded) await onCommentAdded();
        }
      }
    });
  });

  // Member popup on avatar/name click
  const handleMemberClick = async (memberId, gId) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    await openMemberPopup(member, gId);
  };

  list.querySelectorAll('.comment-author-link, .comment-author-avatar').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const memberId = el.dataset.memberId;
      const gId = el.dataset.groupId;
      await handleMemberClick(memberId, gId);
    });
  });
}

/** Opens the member popup card for any member object and board ID. */
export async function openMemberPopup(member, gId) {
  if (!member) return;
  const popupHTML = await buildMemberPopup(member, gId);
  document.getElementById('member-popup-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', popupHTML);
  document.getElementById('member-popup-close')?.addEventListener('click', () => {
    document.getElementById('member-popup-overlay')?.remove();
  });
  document.getElementById('member-popup-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'member-popup-overlay') document.getElementById('member-popup-overlay')?.remove();
  });
}
