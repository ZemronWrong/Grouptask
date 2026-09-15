/**
 * Card Comments — Real-time commenting on tasks.
 */

import { STORES, get, getAllByIndex, put, add, addToSyncQueue, remove } from '../../services/indexedDBService.js';
import { currentUser } from '../../services/authService.js';
import { escapeHtml, generateId } from '../../utils/helpers.js';
import { notify } from '../../services/notificationService.js';
import { ICONS } from '../../assets/icons/icons.js';
import { logActivity } from '../../services/activityLogService.js';

export async function renderCommentsUI(taskId, groupId, members) {
  const allComments = await getAllByIndex(STORES.COMMENTS, 'taskId', taskId);
  const sortedComments = allComments.sort((a, b) => a.createdAt - b.createdAt);
  
  const user = currentUser();
  const me = members.find(m => m.uid === user?.uid);

  const buildCommentHTML = (c) => {
    const author = members.find(m => m.id === c.memberId) || { displayName: 'Unknown', avatarEmoji: '👤' };
    const isMine = c.memberId === me?.id;
    return `
      <div class="comment-item" data-comment-id="${c.id}">
        <div class="avatar avatar-sm">${author.displayName?.[0] || '?'}</div>
        <div class="comment-content">
          <div class="comment-header">
            <span class="comment-author">${escapeHtml(author.displayName)}</span>
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
}
