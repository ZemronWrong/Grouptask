/**
 * Card Comments — Real-time commenting on tasks.
 * Shows commenter profile picture, top badge inline, and clickable member popup.
 */

import { STORES, get, getAllByIndex, getAll, put, add, addToSyncQueue, remove } from '../../services/indexedDBService.js';
import { currentUser } from '../../services/authService.js';
import { escapeHtml, generateId } from '../../utils/helpers.js';
import { getRoleName } from '../../services/themeService.js';
import { notify } from '../../services/notificationService.js';
import { ICONS } from '../../assets/icons/icons.js';
import { logActivity } from '../../services/activityLogService.js';
import { getAllBadges, awardEligibleBadgesForUser } from '../../core/badgeEngine.js';

const ALL_BADGE_DEFS = getAllBadges();

/** Returns the top badge definition for a member by looking up their stored badges. */
async function getMemberTopBadge(memberUid, memberIdList) {
  const allBadges = await getAll(STORES.BADGES);
  const memberBadgeTypes = new Set(
    allBadges
      .filter(b => memberIdList.includes(b.memberId) || (memberUid && b.uid === memberUid))
      .map(b => b.type || b.id)
  );
  // Return first badge definition that is earned (ordered by ALL_BADGE_DEFS priority)
  return ALL_BADGE_DEFS.find(b => memberBadgeTypes.has(b.id)) || null;
}

/** Build a member mini-profile popup HTML. Called on member avatar/name/badge click. */
async function buildMemberPopup(member, groupId) {
  // E3: opening a popup never writes. Badges are awarded when they are earned
  // (task approval, posting a comment), not when someone views them.

  const allTasks  = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  const allBadges = await getAll(STORES.BADGES);
  const allComments = await getAll(STORES.COMMENTS);
  const allMembers  = await getAll(STORES.MEMBERS);
  const profile = (member.uid ? await get(STORES.USER_PROFILES, member.uid) : null) || {};

  const allUserMembers = allMembers.filter(m => (member.uid && m.uid === member.uid) || m.id === member.id);
  const allMemberIds = allUserMembers.map(m => m.id);
  if (!allMemberIds.includes(member.id)) allMemberIds.push(member.id);

  const completedTasks = allTasks.filter(t => t.assignedTo === member.id && t.status === 'done').length;
  const commentCount   = allComments.filter(c => allMemberIds.includes(c.memberId) && !c.deleted).length;

  const memberBadgeTypes = new Set(
    allBadges
      .filter(b => allMemberIds.includes(b.memberId) || (member.uid && b.uid === member.uid))
      .map(b => b.type || b.id)
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
  const mockU = mockUsers.find(u => u.uid === member.uid);
  const email = profile.email || member.email || mockU?.email || (member.uid === currentUser()?.uid ? currentUser()?.email : '') || '';

  return `
    <div class="member-popup-overlay" id="member-popup-overlay">
      <div class="member-popup" style="width:360px; max-width:92vw;">
        <button class="btn-icon member-popup-close" id="member-popup-close" style="position:absolute;top:12px;right:12px;" title="Close">✕</button>
        <div style="display:flex; gap:14px; align-items:center; margin-bottom:16px;">
          <div class="avatar" style="width:52px;height:52px;font-size:1.3rem;flex-shrink:0;overflow:hidden;border:2px solid var(--border);">${avatarHTML}</div>
          <div style="min-width:0; flex:1;">
            <h3 style="margin:0 0 4px 0; font-size:1.05rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(member.displayName)}</h3>
            <div style="font-size:0.75rem; color:var(--primary); font-family:var(--font-heading); font-weight:600;">
              ${escapeHtml(getRoleName(member.role))}
            </div>
            ${email ? `
              <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ✉️ ${escapeHtml(email)}
              </div>
            ` : ''}
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:16px; text-align:center;">
          <div style="background:var(--bg); border-radius:8px; padding:8px 4px; border:1px solid var(--border);">
            <div style="font-size:1.05rem; font-weight:700; color:var(--primary);">${completedTasks}</div>
            <div style="font-size:0.68rem; color:var(--text-muted);">Tasks Done</div>
          </div>
          <div style="background:var(--bg); border-radius:8px; padding:8px 4px; border:1px solid var(--border);">
            <div style="font-size:1.05rem; font-weight:700; color:var(--accent);">${streak}d</div>
            <div style="font-size:0.68rem; color:var(--text-muted);">Streak</div>
          </div>
          <div style="background:var(--bg); border-radius:8px; padding:8px 4px; border:1px solid var(--border);">
            <div style="font-size:1.05rem; font-weight:700; color:var(--success);">${earnedBadges.length}</div>
            <div style="font-size:0.68rem; color:var(--text-muted);">Badges</div>
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:0.75rem; color:var(--text); font-family:var(--font-heading); font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">🏅 Badges Earned (${earnedBadges.length})</span>
          </div>
          ${earnedBadges.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:6px; max-height:180px; overflow-y:auto; padding-right:4px;">
              ${earnedBadges.map(b => `
                <div style="display:flex; align-items:center; gap:8px; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:6px 10px;">
                  <span style="font-size:1.2rem; flex-shrink:0;">${b.icon}</span>
                  <div style="min-width:0; flex:1;">
                    <div style="font-size:0.8rem; font-family:var(--font-heading); font-weight:600; color:var(--text);">${escapeHtml(b.label)}</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(b.description)}">${escapeHtml(b.description)}</div>
                  </div>
                  <span style="font-size:0.65rem; color:var(--accent); background:var(--primary-soft); padding:2px 6px; border-radius:10px; font-weight:600; flex-shrink:0;">${escapeHtml(b.category)}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="background:var(--bg); border-radius:8px; padding:12px; border:1px dashed var(--border); text-align:center;">
              <span style="font-size:1.2rem; display:block; margin-bottom:4px;">🔒</span>
              <p style="font-size:0.78rem; color:var(--text-muted); margin:0;">No badges unlocked yet.</p>
            </div>
          `}
        </div>

        <div style="border-top:1px solid var(--border); padding-top:12px;">
          <a href="#/profile/${member.uid || member.id}" class="btn btn-primary btn-sm btn-block" id="btn-view-member-full-profile" style="text-decoration:none; display:flex; align-items:center; justify-content:center; gap:6px; font-family:var(--font-heading);">
            <span>🏅</span> View Full Profile & Achievements
          </a>
        </div>
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
    const authorMemberIds = members.filter(m => (author.uid && m.uid === author.uid) || m.id === author.id).map(m => m.id);
    if (!authorMemberIds.includes(author.id)) authorMemberIds.push(author.id);
    const authorBadgeTypes = new Set(
      allBadges
        .filter(b => authorMemberIds.includes(b.memberId) || (author.uid && b.uid === author.uid))
        .map(b => b.type || b.id)
    );
    const topBadge = ALL_BADGE_DEFS.find(b => authorBadgeTypes.has(b.id));

    // Profile picture
    const prof = author.uid ? profileMap[author.uid] : null;
    const hasPhoto = prof?.avatarType === 'custom' && prof?.avatar;
    const avatarHTML = hasPhoto
      ? `<img src="${prof.avatar}" alt="${escapeHtml(author.displayName?.[0] || '?')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : escapeHtml(author.displayName?.[0] || '?');

    return `
      <div class="comment-item" data-comment-id="${c.id}">
        <div class="avatar avatar-sm comment-author-avatar" data-member-id="${c.memberId}" data-group-id="${groupId}" style="cursor:pointer; overflow:hidden; flex-shrink:0;" title="Click to view ${escapeHtml(author.displayName)}'s badges">${avatarHTML}</div>
        <div class="comment-content">
          <div class="comment-header" style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
            <span class="comment-author comment-author-link" data-member-id="${c.memberId}" data-group-id="${groupId}" style="cursor:pointer;" title="Click to view badges">${escapeHtml(author.displayName)}</span>
            ${topBadge ? `
              <span class="comment-badge-inline" data-member-id="${c.memberId}" data-group-id="${groupId}" title="${escapeHtml(topBadge.label)} — Click to view badges" style="display:inline-flex;align-items:center;gap:3px; background:var(--primary-soft); border:1px solid var(--border); border-radius:12px; padding:2px 8px; font-size:0.7rem; color:var(--primary); cursor:pointer;">
                <span>${topBadge.icon}</span> <span style="font-family:var(--font-heading); font-weight:600;">${escapeHtml(topBadge.label)}</span>
              </span>
            ` : `
              <span class="comment-badge-inline" data-member-id="${c.memberId}" data-group-id="${groupId}" title="View badges" style="display:inline-flex;align-items:center;gap:2px; background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:2px 6px; font-size:0.7rem; color:var(--text-muted); cursor:pointer;">
                <span>🏅</span>
              </span>
            `}
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
    // Comment badges are earned here (viewing a popup or profile no longer awards them)
    await awardEligibleBadgesForUser(me.uid);

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

  // Member popup on avatar/name/badge click
  const handleMemberClick = async (memberId, gId) => {
    let member = members.find(m => m.id === memberId || m.uid === memberId);
    if (!member) {
      const allM = await getAll(STORES.MEMBERS);
      member = allM.find(m => m.id === memberId || m.uid === memberId);
    }
    if (!member) return;
    await openMemberPopup(member, gId);
  };

  list.querySelectorAll('.comment-author-link, .comment-author-avatar, .comment-badge-inline').forEach(el => {
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
  document.getElementById('btn-view-member-full-profile')?.addEventListener('click', () => {
    document.getElementById('member-popup-overlay')?.remove();
  });
  document.getElementById('member-popup-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'member-popup-overlay') document.getElementById('member-popup-overlay')?.remove();
  });
}
