/**
 * boardEvents — All event binding, task persistence, and proof review logic.
 *
 * Uses a single delegated listener on `document` so handlers survive
 * re-renders without needing to be re-attached. The live board context
 * (`_boardContext`) is passed in by reference so handlers always see
 * the latest group/member state.
 */

import { STORES, put, remove, add, addToSyncQueue, get, getAllByIndex, getAll } from '../../services/indexedDBService.js';
import { generateId } from '../../utils/helpers.js';
import { currentUser } from '../../services/authService.js';
import { kickMember } from '../../services/memberService.js';
import { notify } from '../../services/notificationService.js';
import { logActivity } from '../../services/activityLogService.js';
import { openTaskModal, openTaskDetailModal } from './TaskModal.js';
import { renderAchievementPopup } from './TaskCard.js';
import { recordEvent, EVENT_TYPES } from '../../core/eventEngine.js';
import { awardEligibleBadgesForUser } from '../../core/badgeEngine.js';
import { openMemberPopup } from './TaskComments.js';

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ── Public: wire all board event listeners (call once per session) ────────────

/**
 * @param {object}   boardContext - Live ref object; updated by TaskBoard on every render.
 * @param {function} rerenderBoard - Async function that re-renders the board.
 */
export function bindBoardEvents(boardContext, rerenderBoard) {
  // ─── Delegated click ───
  document.addEventListener('click', async (e) => {
    const { groupId, members, group, viewIsAdmin, me, proofs } = boardContext;

    // Close modal on backdrop click
    const overlay = e.target.closest('.modal-overlay');
    if (overlay && e.target === overlay && overlay.id !== 'task-detail-modal') {
      overlay.hidden = true;
      return;
    }

    if (e.target.closest('.btn-close-modal')) {
      e.target.closest('.modal-overlay').hidden = true;
      return;
    }

    if (e.target.closest('#btn-close-detail-modal')) {
      document.getElementById('task-detail-modal')?.remove();
      await rerenderBoard(groupId);
      return;
    }

    if (e.target.closest('#btn-board-members')) {
      const modal = document.getElementById('board-members-modal');
      if (modal) modal.hidden = false;
      return;
    }

    if (e.target.closest('#btn-share-btn') || e.target.closest('#btn-share')) {
      const modal = document.getElementById('share-modal');
      if (modal) modal.hidden = false;
      return;
    }

    // Click member in Board Members modal -> open detailed member popup card
    const boardMemberItem = e.target.closest('.board-member-item');
    if (boardMemberItem) {
      const memberId = boardMemberItem.dataset.memberId;
      const targetMember = members.find((m) => m.id === memberId);
      if (targetMember) {
        await openMemberPopup(targetMember, groupId);
      }
      return;
    }

    // Share modal tab switching
    const shareTabBtn = e.target.closest('.share-tab-btn');
    if (shareTabBtn) {
      const tab = shareTabBtn.dataset.tab;
      document.querySelectorAll('.share-tab-btn').forEach((b) => {
        const isActive = b.dataset.tab === tab;
        b.classList.toggle('active', isActive);
        b.style.borderBottomColor = isActive ? 'var(--primary)' : 'transparent';
        b.style.color = isActive ? 'var(--primary)' : 'var(--text-secondary)';
      });
      const accessContent = document.getElementById('share-tab-access-content');
      const reqContent = document.getElementById('share-tab-requests-content');
      if (accessContent) accessContent.hidden = tab !== 'access';
      if (reqContent) reqContent.hidden = tab !== 'requests';
      return;
    }

    // Accept Join Request
    const acceptReqBtn = e.target.closest('.btn-accept-request');
    if (acceptReqBtn) {
      const reqId = acceptReqBtn.dataset.requestId;
      const currentGroup = await get(STORES.GROUPS, groupId);
      const reqList = currentGroup?.joinRequests || [];
      const req = reqList.find((r) => r.id === reqId);
      if (req) {
        const roleSel = document.querySelector(`.join-request-role-select[data-request-id="${reqId}"]`);
        const chosenRole = roleSel?.value || 'member';
        const newMember = {
          id: `${groupId}_${req.uid}`,
          uid: req.uid,
          groupId,
          displayName: req.displayName || 'New Member',
          email: req.email || null,
          role: chosenRole,
          joinedAt: Date.now(),
        };
        await put(STORES.MEMBERS, newMember);
        await addToSyncQueue({ collection: 'members', docId: newMember.id, operation: 'add', data: newMember });

        // Remove from group join requests
        currentGroup.joinRequests = reqList.filter((r) => r.id !== reqId);
        await put(STORES.GROUPS, currentGroup);
        await addToSyncQueue({ collection: 'groups', docId: groupId, operation: 'update', data: currentGroup });

        showToast(`Accepted ${req.displayName} as ${chosenRole}!`);
        await rerenderBoard(groupId);
        document.getElementById('share-modal').hidden = false;
      }
      return;
    }

    // Decline Join Request
    const declineReqBtn = e.target.closest('.btn-decline-request');
    if (declineReqBtn) {
      const reqId = declineReqBtn.dataset.requestId;
      const currentGroup = await get(STORES.GROUPS, groupId);
      const reqList = currentGroup?.joinRequests || [];
      currentGroup.joinRequests = reqList.filter((r) => r.id !== reqId);
      await put(STORES.GROUPS, currentGroup);
      await addToSyncQueue({ collection: 'groups', docId: groupId, operation: 'update', data: currentGroup });
      showToast('Join request declined.');
      await rerenderBoard(groupId);
      document.getElementById('share-modal').hidden = false;
      return;
    }

    if (e.target.closest('#btn-copy-link-bottom')) {
      const inviteUrl = `${window.location.origin}/#/?join=${group?.inviteCode || ''}`;
      navigator.clipboard.writeText(inviteUrl);
      showToast('Link copied to clipboard!');
      return;
    }

    const addTaskBtn = e.target.closest('.btn-add-task-col');
    if (addTaskBtn) {
      openTaskModal(null, addTaskBtn.dataset.status);
      return;
    }

    const assigneeOpt = e.target.closest('#assignee-options-container .assignee-option');
    if (assigneeOpt) {
      document.querySelectorAll('#assignee-options-container .assignee-option').forEach((o) => o.classList.remove('selected'));
      assigneeOpt.classList.add('selected');
      document.getElementById('task-assignee-input').value = assigneeOpt.dataset.uid;
      return;
    }

    const statusOpt = e.target.closest('#status-options-container .assignee-option');
    if (statusOpt) {
      document.querySelectorAll('#status-options-container .assignee-option').forEach((o) => o.classList.remove('selected'));
      statusOpt.classList.add('selected');
      document.getElementById('task-status-input').value = statusOpt.dataset.status;
      return;
    }

    // Self-assign a task
    const selfAssignBtn = e.target.closest('.btn-self-assign');
    if (selfAssignBtn) {
      e.stopPropagation();
      if (me?.role === 'viewer') { showToast('Only View members cannot accept tasks.'); return; }
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
      await rerenderBoard(groupId);
      return;
    }

    // Open proof-submit modal
    const submitProofBtn = e.target.closest('.btn-submit-proof');
    if (submitProofBtn) {
      e.stopPropagation();
      document.getElementById('submit-task-id').value = submitProofBtn.dataset.taskId;
      document.getElementById('submit-proof-link').value = '';
      document.getElementById('proof-submit-modal').hidden = false;
      return;
    }

    // Open proof-review modal
    const reviewBtn = e.target.closest('.btn-review-proof');
    if (reviewBtn) {
      e.stopPropagation();
      const proofId = reviewBtn.dataset.proofId;
      const taskId  = reviewBtn.dataset.taskId;
      const proof   = proofs?.find((p) => p.id === proofId);
      document.getElementById('review-proof-id').value = proofId || '';
      document.getElementById('review-task-id').value  = taskId;
      document.getElementById('review-note').value     = '';
      if (proof?.link) {
        document.getElementById('proof-link-group').hidden = false;
        document.getElementById('review-proof-link').href  = proof.link;
        document.getElementById('review-proof-link').textContent = proof.link;
      } else {
        document.getElementById('proof-link-group').hidden = true;
      }
      document.getElementById('proof-review-modal').hidden = false;
      return;
    }

    // Approve / reject proof
    const approveBtn = e.target.closest('#btn-approve-proof');
    const rejectBtn  = e.target.closest('#btn-reject-proof');
    if (approveBtn || rejectBtn) {
      e.preventDefault();
      await handleReview(approveBtn ? 'approved' : 'rejected', groupId, members, me, rerenderBoard);
      return;
    }

    // Delete task (from detail modal)
    const deleteBtn = e.target.closest('#btn-delete-task-modal');
    if (deleteBtn) {
      const taskId = deleteBtn.dataset.taskId;
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
      await rerenderBoard(groupId);
      return;
    }

    // Edit task (from detail modal)
    const editBtn = e.target.closest('#btn-edit-task-modal');
    if (editBtn) {
      const task = await get(STORES.TASKS, editBtn.dataset.taskId);
      document.getElementById('task-detail-modal')?.remove();
      if (task) openTaskModal(task);
      return;
    }

    // Click on card body — open detail modal (unless clicking button or link)
    const card = e.target.closest('.task-card');
    if (card && !e.target.closest('button') && !e.target.closest('a')) {
      const task = await get(STORES.TASKS, card.dataset.taskId);
      if (task) await openTaskDetailModal(task, groupId, members, viewIsAdmin, me);
      return;
    }
  });

  // ─── Form submits ───
  document.addEventListener('submit', async (e) => {
    const { groupId, members, me, proofs } = boardContext;

    if (e.target.id === 'task-form') {
      e.preventDefault();
      await saveTask(groupId, members);
      document.getElementById('task-modal').hidden = true;
      await rerenderBoard(groupId);
      return;
    }

    if (e.target.id === 'proof-submit-form') {
      e.preventDefault();
      const taskId = document.getElementById('submit-task-id').value;
      const link   = document.getElementById('submit-proof-link').value;
      const task   = await get(STORES.TASKS, taskId);
      task.status    = 'pending-approval';
      task.updatedAt = Date.now();
      await put(STORES.TASKS, task);
      await addToSyncQueue({ collection: 'tasks', docId: taskId, operation: 'update', data: task });
      if (link) {
        const existing = proofs?.find((p) => p.taskId === taskId);
        const proofId  = existing ? existing.id : generateId();
        const proof    = { id: proofId, taskId, groupId, memberId: me.id, link, status: 'pending', note: '', updatedAt: Date.now() };
        await put(STORES.PROOF_SUBMISSIONS, proof);
        await addToSyncQueue({ collection: 'proofSubmissions', docId: proofId, operation: 'update', data: proof });
      }
      const admins = members.filter((m) => m.role === 'owner' || m.role === 'co-admin');
      for (const a of admins) {
        await notify({ uid: a.uid, type: 'approval_request', title: 'Approval Requested',
          message: `${me.displayName} is requesting approval for "${task.title}"`,
          icon: '⏳', actionLink: `#/group/${groupId}`, groupId });
      }
      document.getElementById('proof-submit-modal').hidden = true;
      showToast('Submitted for approval!');
      await rerenderBoard(groupId);
      return;
    }
  });

  // ─── Role change in share modal ───
  document.addEventListener('change', async (e) => {
    const { groupId } = boardContext;
    const sel = e.target.closest('.share-role-select');
    if (!sel) return;
    const memberId = sel.dataset.memberId;
    const role     = sel.value;
    const member   = await get(STORES.MEMBERS, memberId);
    if (!member) return;
    if (role === 'remove') {
      if (confirm('Remove this member?')) {
        await kickMember(member, groupId);
      } else {
        sel.value = member.role;
      }
    } else {
      member.role = role;
      await put(STORES.MEMBERS, member);
      await addToSyncQueue({ collection: 'members', docId: memberId, operation: 'update', data: member });
    }
    await rerenderBoard(groupId);
    document.getElementById('share-modal').hidden = false;
  });

  // ─── Real-time Member Search filtering ───
  document.addEventListener('input', (e) => {
    if (e.target.id === 'board-member-search') {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.board-member-item').forEach((item) => {
        const name = item.dataset.name || '';
        const email = item.dataset.email || '';
        item.style.display = (name.includes(q) || email.includes(q)) ? 'flex' : 'none';
      });
    }

    if (e.target.id === 'share-member-search') {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.share-member-row').forEach((row) => {
        const name = row.dataset.memberName || '';
        row.style.display = name.includes(q) ? 'flex' : 'none';
      });
    }
  });
}

// ── Task persistence helpers ──────────────────────────────────────────────────

/** Reads the task modal form and saves to IndexedDB + sync queue. */
export async function saveTask(groupId, members) {
  const id    = document.getElementById('task-id').value || generateId();
  const isNew = !document.getElementById('task-id').value;
  const assignedTo = document.getElementById('task-assignee-input').value || null;
  const status     = document.getElementById('task-status-input').value || 'todo';
  const me = members.find((m) => m.uid === currentUser()?.uid);

  const task = {
    id, groupId,
    title:       document.getElementById('task-title-input').value.trim(),
    description: document.getElementById('task-desc-input').value.trim(),
    difficulty:  document.getElementById('task-diff-input').value,
    type:        document.getElementById('task-type-input')?.value || 'task',
    tags:        [document.getElementById('task-type-input')?.value || 'task'],
    weight:      Number(document.getElementById('task-weight-input').value) || 100,
    deadline:    document.getElementById('task-deadline-input').value || null,
    assignedTo, status,
    updatedAt: Date.now(),
    createdAt:   isNew ? Date.now() : undefined,
    createdBy:   isNew ? me?.id : undefined,
    creatorName: isNew ? me?.displayName : undefined,
  };

  const STATUS_LABELS = { 'todo': 'To Do', 'in-progress': 'In Progress', 'pending-approval': 'Pending Approval', 'done': 'Completed' };

  let oldTask = null;
  if (!isNew) {
    oldTask = await get(STORES.TASKS, id);
    task.createdAt   = oldTask?.createdAt || Date.now();
    task.createdBy   = oldTask?.createdBy;
    task.creatorName = oldTask?.creatorName;
    await put(STORES.TASKS, task);
    await addToSyncQueue({ collection: 'tasks', docId: id, operation: 'update', data: task });
  } else {
    await add(STORES.TASKS, task);
    await addToSyncQueue({ collection: 'tasks', docId: id, operation: 'add', data: task });
  }

  if (isNew) {
    await logActivity({
      groupId, type: 'task_created',
      actorId: me?.id || null, actorName: me?.displayName || 'Someone',
      description: `Created task "${task.title}"${assignedTo ? ` and assigned to ${members.find((m) => m.id === assignedTo)?.displayName || 'a member'}` : ''} in ${STATUS_LABELS[status] || status}`,
      meta: { taskId: id, taskTitle: task.title, status },
    });
  } else {
    if (assignedTo && assignedTo !== oldTask?.assignedTo) {
      const assignee = members.find((m) => m.id === assignedTo);
      await logActivity({
        groupId, type: 'task_assigned',
        actorId: me?.id || null, actorName: me?.displayName || 'Someone',
        description: `${me?.displayName || 'Someone'} assigned "${task.title}" to ${assignee?.displayName || 'a member'}`,
        meta: { taskId: id, taskTitle: task.title },
      });
    }
    if (status !== oldTask?.status) {
      await logActivity({
        groupId, type: status === 'done' ? 'task_completed' : 'task_moved',
        actorId: me?.id || null, actorName: me?.displayName || 'Someone',
        description: `Moved "${task.title}" to ${STATUS_LABELS[status] || status}`,
        meta: { taskId: id, taskTitle: task.title, oldStatus: oldTask?.status, newStatus: status },
      });
    }
  }

  // If task was completed, award event points and badges
  if (status === 'done' && (!oldTask || oldTask.status !== 'done')) {
    const assignee = members.find((m) => m.id === assignedTo);
    if (assignee) {
      const weight = Number(task.weight) || 100;
      await recordEvent({
        eventType: EVENT_TYPES.CARD_COMPLETE,
        userId: assignee.uid,
        memberId: assignee.id,
        boardId: groupId,
        boardPoints: weight,
        xpDelta: weight,
        repDelta: 5,
        metadata: { taskId: id, taskTitle: task.title, weight }
      });
      await awardEligibleBadgesForUser(assignee.uid);
    }
  }

  // Notify newly assigned member
  if (assignedTo && (!oldTask || oldTask.assignedTo !== assignedTo)) {
    const assignee = members.find((m) => m.id === assignedTo);
    if (assignee) {
      await notify({ uid: assignee.uid, type: 'task_assigned', title: 'New Task Assigned',
        message: `You were assigned "${task.title}".`, icon: '📋', actionLink: `#/group/${groupId}`, groupId });
    }
  }
}

/** Move a task to a new status column (called by drag-drop). */
export async function moveTask(taskId, newStatus, groupId, members) {
  const task = await get(STORES.TASKS, taskId);
  if (!task || task.status === newStatus) return;

  const user   = currentUser();
  const me     = members.find((m) => m.uid === user?.uid);
  const isAdmin = me?.role === 'owner' || me?.role === 'co-admin';
  const isMyCard = task.assignedTo === me?.id;

  // ── Permission rules (enforced client-side; Firestore rules back this up) ──
  // 1. Members can move their own cards freely between todo ↔ in-progress.
  // 2. Any member can move their own card TO pending-approval (this is how
  //    they submit for review; mirrors the "Submit Proof" button).
  // 3. Only owner/co-admin can move a card directly to 'done' (approval bypass).
  // 4. Admins can move any card to any status.

  if (!isAdmin) {
    // Non-admin trying to approve directly to done
    if (newStatus === 'done') {
      showToast('Only an admin can approve tasks. Use "Submit for Approval" instead.');
      return;
    }
    // Non-admin trying to move someone else's card
    if (!isMyCard && newStatus !== 'todo') {
      showToast('You can only move your own tasks.');
      return;
    }
  } else {
    // B4: Admin cannot approve their own card to done
    if (newStatus === 'done' && isMyCard) {
      showToast('Admins cannot approve their own tasks. Another admin must approve this.');
      return;
    }
  }

  const oldStatus = task.status;
  task.status    = newStatus;
  task.updatedAt = Date.now();
  if (newStatus === 'done') task.completedAt = Date.now();
  await put(STORES.TASKS, task);
  await addToSyncQueue({ collection: 'tasks', docId: taskId, operation: 'update', data: task });

  const STATUS_LABELS = { 'todo': 'To Do', 'in-progress': 'In Progress', 'pending-approval': 'Pending Approval', 'done': 'Completed' };

  await logActivity({
    groupId, type: newStatus === 'done' ? 'task_completed' : 'task_moved',
    actorId: me?.id || null, actorName: me?.displayName || 'Someone',
    description: `Moved "${task.title}" from ${STATUS_LABELS[oldStatus] || oldStatus} → ${STATUS_LABELS[newStatus] || newStatus}`,
    meta: { taskId, taskTitle: task.title, oldStatus, newStatus },
  });

  if (newStatus === 'pending-approval') {
    const admins = members.filter((m) => m.role === 'owner' || m.role === 'co-admin');
    for (const a of admins) {
      await notify({ uid: a.uid, type: 'approval_request', title: 'Approval Requested',
        message: `A task needs approval: "${task.title}"`, icon: '⏳', actionLink: `#/group/${groupId}`, groupId });
    }
  } else if (newStatus === 'done' && oldStatus !== 'done') {
    const assignee = members.find((m) => m.id === task.assignedTo);
    if (assignee) {
      await notify({ uid: assignee.uid, type: 'approval_granted', title: 'Task Completed! 🎉',
        message: `Your task "${task.title}" was marked complete.`, icon: '✅', actionLink: `#/group/${groupId}`, groupId });
      const weight = Number(task.weight) || 100;
      await recordEvent({
        eventType: EVENT_TYPES.CARD_COMPLETE,
        userId: assignee.uid,
        memberId: assignee.id,
        boardId: groupId,
        boardPoints: weight,
        xpDelta: weight,
        repDelta: 5,
        metadata: { taskId, taskTitle: task.title, weight }
      });
      await awardEligibleBadgesForUser(assignee.uid);
    }
  }
}

// ── Proof review ──────────────────────────────────────────────────────────────

async function handleReview(status, groupId, members, me, rerenderBoard) {
  const proofId  = document.getElementById('review-proof-id').value;
  const taskId   = document.getElementById('review-task-id').value;
  const note     = document.getElementById('review-note').value;
  const task     = await get(STORES.TASKS, taskId);
  const assignee = members.find((m) => m.id === task.assignedTo);

  // B4: Admin cannot approve their own proof/task
  if (status === 'approved' && task?.assignedTo === me?.id) {
    showToast('Admins cannot approve their own tasks. Another admin must approve this.');
    return;
  }

  if (proofId) {
    const proof = await get(STORES.PROOF_SUBMISSIONS, proofId);
    if (proof) {
      proof.status = status;
      proof.note = note;
      proof.reviewedBy = me?.id || null;
      proof.reviewedByUid = me?.uid || null;
      proof.updatedAt = Date.now();
      await put(STORES.PROOF_SUBMISSIONS, proof);
      await addToSyncQueue({ collection: 'proofSubmissions', docId: proofId, operation: 'update', data: proof });
    }
  }

  let newBadges = [];
  if (status === 'approved') {
    task.status = 'done'; task.completedAt = Date.now(); task.updatedAt = Date.now();
    await put(STORES.TASKS, task);
    await addToSyncQueue({ collection: 'tasks', docId: taskId, operation: 'update', data: task });

    if (assignee) {
      await notify({ uid: assignee.uid, type: 'approval_granted', title: 'Task Approved! 🎉',
        message: `Your task "${task.title}" was approved.`, icon: '✅', actionLink: `#/group/${groupId}`, groupId });

      const isOverdue = task.deadline && Date.now() > new Date(task.deadline).getTime();
      const weight = Number(task.weight) || 0;

      // 1. Record the Unified Event
      await recordEvent({
        eventType: isOverdue ? EVENT_TYPES.CARD_COMPLETE_OVERDUE : EVENT_TYPES.CARD_COMPLETE,
        userId: assignee.uid,
        memberId: assignee.id,
        boardId: groupId,
        boardPoints: isOverdue ? Math.round(weight * 0.5) : weight,
        xpDelta: isOverdue ? Math.round(weight * 0.8) : weight,
        repDelta: isOverdue ? -2 : 5,
        metadata: { taskId, taskTitle: task.title, weight }
      });

      // 2. Evaluate and award all eligible badges for the assignee using the
      //    comprehensive engine (correctly syncs to Firestore and covers all badge types).
      //    Bug fix: the previous code used simplified hardcoded values (contributionScore: 100,
      //    avgPeerScore: 3) and was duplicated from the self-complete path. Using
      //    awardEligibleBadgesForUser ensures real data is used and badges reach Firestore.
      newBadges = await awardEligibleBadgesForUser(assignee.uid);

      // Send a badge_earned notification to the assignee for each new badge.
      // awardEligibleBadgesForUser handles the IndexedDB/Firestore write but not notifications.
      for (const b of newBadges) {
        await notify({ uid: assignee.uid, type: 'badge_earned', title: 'Badge Earned! 🏆',
          message: `You earned the "${b.label}" badge!`, icon: b.icon || '🏆', actionLink: '#/profile', groupId });
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
  await rerenderBoard(groupId);

  // Show achievement popup if the currently logged-in user is the one who was just approved
  // (i.e., the assignee approved their own task, or same-user scenario).
  // Bug fix: was checking assignee?.id === me?.id which always fails when a leader approves
  // someone else's task. Now we check by uid so it works regardless of role.
  if (newBadges.length > 0 && assignee?.uid === me?.uid) {
    setTimeout(() => renderAchievementPopup(newBadges[0]), 500);
  }
}
