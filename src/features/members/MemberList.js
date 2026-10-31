import { STORES, get, getAllByIndex, put, remove, addToSyncQueue } from '../../services/indexedDBService.js';
import { kickMember, leaveGroup } from '../../services/memberService.js';
import { flushQueue } from '../../services/syncService.js';
import { escapeHtml } from '../../utils/helpers.js';
import { currentUser } from '../../services/authService.js';
import { getTerm, getRoleName } from '../../services/themeService.js';
// notify removed — 'Send Warning' button removed (UREB A3)
import { navigate } from '../../services/router.js';
import { ICONS } from '../../assets/icons/icons.js';
import { confirmDialog, withBusy } from '../../utils/ui.js';
// calculateContributionScore removed from this page — WPS/PE no longer shown on member cards (UREB A2/A3)
// calculatePEScore removed — WPS/PE no longer shown on other members' cards (UREB A2/A3)

export async function renderMembers(groupId) {
  const app = document.getElementById('app');
  const user = currentUser();
  const group = await get(STORES.GROUPS, groupId);
  const tasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  const membersList = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
  // peerReviews fetch removed — WPS/PE no longer computed per-member on this page (UREB A2/A3)

  const me = membersList.find(m => m.uid === user.uid);
  const isAdmin = me?.role === 'owner' || me?.role === 'co-admin';
  const isOwner = me?.role === 'owner';
  const isCoOwner = me?.role === 'co-admin';


  // Analysis variables
  // UREB A3: Risk score is computed internally for admin tools (restrict/kick) only.
  // Risk labels ('High Free-Rider Risk', 'Needs Attention') are removed — they must not
  // be visible to participants during the study (UREB consent form requirement).
  const analysisData = membersList.map((m) => {
    const assigned = tasks.filter((t) => t.assignedTo === m.id);
    const completed = assigned.filter((t) => t.status === 'done');
    const overdue = assigned.filter((t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done');

    return {
      member: m,
      assigned: assigned.length,
      completed: completed.length,
      overdue: overdue.length,
      restricted: !!m.restricted,
    };
  });

  app.innerHTML = `
    <div class="app-layout">
      ${sidebarHTML(groupId, 'members', membersList, tasks)}
      <div class="main-content">
        <header class="board-header">
          <div class="board-header-left">
            <h1 class="board-title">${ICONS.users} Team & Risks</h1>
          </div>
        </header>

        <div style="padding: 24px;">
          <div style="margin-bottom:24px; padding:16px; background:var(--bg-card); border-radius:12px; border:1px solid var(--border);">
            <h2 style="font-size:1.1rem; margin-bottom:8px;">Team Analysis</h2>
            <p style="color:var(--text-secondary); font-size:0.9rem;">
              Track assignment progress and completion across your team.
            </p>
          </div>

          <div class="members-grid">
            ${analysisData
              .sort((a, b) => (a.member.displayName || '').localeCompare(b.member.displayName || ''))
              .map((data) => memberCardHTML(data, isAdmin, isOwner, me, groupId))
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents(groupId);
  bindMemberEvents(groupId, membersList);
}

// UREB A3: Risk labels ('High Free-Rider Risk', 'Needs Attention', 'Active & Engaged') removed.
// UREB A2: WPS share and PE score removed from other members' cards.
// Members are sorted alphabetically, not by risk score.
function memberCardHTML(data, isAdmin, isOwner, me, groupId) {
  const { member, assigned, completed, overdue, restricted } = data;

  const isMe = member.id === me?.id;
  // Owner can manage co-owners and below; co-owner can manage members and viewers
  const canManage = isOwner
    ? !isMe && member.role !== 'owner'
    : (isAdmin && !isMe && (member.role === 'member' || member.role === 'viewer'));

  return `
    <div class="member-card${restricted ? ' member-restricted' : ''}">
      <div class="member-card-header">
        <a href="#/profile/${member.uid || member.id}" style="display:flex; align-items:center; gap:12px; text-decoration:none; color:inherit; flex:1;" title="View ${escapeHtml(member.displayName)}'s profile & achievements">
          <div class="avatar avatar-lg">${escapeHtml(member.displayName?.[0] || '?')}</div>
          <div>
            <h3 class="member-name">
              ${escapeHtml(member.displayName)}
              ${isMe ? '<span class="you-badge">(You)</span>' : ''}
            </h3>
            <div class="member-role">${getRoleName(member.role)}</div>
          </div>
        </a>
      </div>

      <div class="member-stats-row">
        <div class="member-stat">
          <span class="member-stat-val">${assigned}</span>
          <span class="member-stat-label">Assigned</span>
        </div>
        <div class="member-stat">
          <span class="member-stat-val">${completed}</span>
          <span class="member-stat-label">Done</span>
        </div>
        <div class="member-stat">
          <span class="member-stat-val" style="${overdue > 0 ? 'color:var(--danger);' : ''}">${overdue}</span>
          <span class="member-stat-label">Overdue</span>
        </div>
      </div>

      <div style="margin-top:14px; border-top:1px solid var(--border); padding-top:10px;">
        <a href="#/profile/${member.uid || member.id}" class="btn btn-secondary btn-sm" style="display:flex; align-items:center; justify-content:center; gap:6px; text-decoration:none; width:100%; font-size:0.8rem; font-family:var(--font-heading);">
          <span>🏅</span> View Achievements & Profile
        </a>
      </div>

      ${restricted ? `
        <div style="margin-top:8px; font-size:0.75rem; color:var(--danger); font-family:var(--font-heading); font-weight:700;">RESTRICTED</div>
      ` : ''}

      ${canManage && !isMe ? `
        <div style="margin-top:16px; border-top:1px solid var(--border); padding-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm btn-restrict-member" data-member-id="${member.id}">${restricted ? 'Unrestrict' : 'Restrict Tasks'}</button>
          <button class="btn btn-secondary btn-sm btn-kick-member" data-member-id="${member.id}" style="border-color:var(--danger); color:var(--danger);">Kick</button>
        </div>
      ` : ''}
    </div>
  `;
}

function bindMemberEvents(groupId, membersList) {
  document.querySelectorAll('.btn-restrict-member').forEach(btn => {
    btn.addEventListener('click', () => withBusy(btn, async () => {
      const member = membersList.find(m => m.id === btn.dataset.memberId);
      if (member) {
        member.restricted = !member.restricted;
        await put(STORES.MEMBERS, member);
        await addToSyncQueue({ collection: 'members', docId: member.id, operation: 'update', data: member });
        await renderMembers(groupId);
      }
    }));
  });

  document.querySelectorAll('.btn-kick-member').forEach(btn => {
    btn.addEventListener('click', async () => {
      const member = membersList.find(m => m.id === btn.dataset.memberId);
      const ok = await confirmDialog({
        title: 'Remove this member?',
        message: `${member?.displayName || 'This member'} will be permanently removed from the group.`,
        confirmLabel: 'Remove',
      });
      if (!ok) return;
      await withBusy(btn, async () => {
        if (member) await kickMember(member, groupId);
        await renderMembers(groupId);
      });
    });
  });
}

// ----------------------------------------------------------------------
// Reusable Sidebar Component
// ----------------------------------------------------------------------
export function sidebarHTML(groupId, currentPath, members, tasks) {
  const user = currentUser();
  const me = members?.find(m => m.uid === user?.uid);
  const myRole = me?.role || 'member';

  return `
    <nav class="sidebar">
      <div class="sidebar-logo">
        <a href="#/dashboard" style="display:flex; align-items:center; gap:8px; text-decoration:none; color:inherit;">
          <span style="font-size: 1.5rem;">${ICONS.clipboard}</span> 
          <span>GroupTask</span>
        </a>
      </div>
      <div class="sidebar-nav">
        <a href="#/dashboard" class="sidebar-link">
          <span>${ICONS.home}</span> Dashboard
        </a>
        <a href="#/group/${groupId}" class="sidebar-link ${currentPath === 'board' ? 'active' : ''}">
          <span>${ICONS.clipboard}</span> Board
        </a>
        <a href="#/group/${groupId}/leaderboard" class="sidebar-link ${currentPath === 'leaderboard' ? 'active' : ''}">
          <span>${ICONS.trophy}</span> Leaderboard and Data Visualization
        </a>
        <a href="#/group/${groupId}/evaluate" class="sidebar-link ${currentPath === 'evaluate' ? 'active' : ''}">
          <span>${ICONS.star}</span> Peer Eval
        </a>
        <a href="#/group/${groupId}/members" class="sidebar-link ${currentPath === 'members' ? 'active' : ''}">
          <span>${ICONS.users}</span> Team & Risks
        </a>
        <a href="#/group/${groupId}/audit" class="sidebar-link ${currentPath === 'audit' ? 'active' : ''}">
          <span>${ICONS.clipboard}</span> Activity
        </a>
      </div>
      
      <div style="margin-top: auto; padding: 16px;">
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-family:var(--font-heading); text-transform:uppercase;">${getTerm('myRole')}</div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 12px;">
          <div class="avatar" style="width:28px;height:28px;font-size:0.8rem;">${escapeHtml(me?.displayName?.[0] || '?')}</div>
          <div>
            <div style="font-weight:600; font-size:0.85rem; color:var(--text);">${escapeHtml(me?.displayName || 'Unknown')}</div>
            <div style="font-size:0.75rem; color:var(--primary); font-family:var(--font-heading);">${getRoleName(myRole)}</div>
          </div>
        </div>
        ${myRole === 'owner' ? `
          <button class="btn btn-danger btn-block btn-sm" id="btn-sidebar-delete-group" data-group-id="${groupId}" style="margin-top: 12px;">${ICONS.trash} Delete Board</button>
        ` : `
          <button class="btn btn-danger btn-block btn-sm" id="btn-sidebar-leave-group" data-group-id="${groupId}" style="margin-top: 12px;">${ICONS.door} Leave Group</button>
        `}
      </div>
    </nav>
  `;
}

// The sidebar is re-rendered with every screen, so its buttons use one
// delegated listener (bound once) instead of listeners on the old elements.
let sidebarEventsBound = false;

export function bindSidebarEvents() {
  if (sidebarEventsBound) return;
  sidebarEventsBound = true;

  document.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('#btn-sidebar-delete-group');
    const leaveBtn = e.target.closest('#btn-sidebar-leave-group');
    if (!deleteBtn && !leaveBtn) return;
    const groupId = (deleteBtn || leaveBtn).dataset.groupId;

    if (deleteBtn) {
      const ok = await confirmDialog({
        title: 'Delete this board?',
        message: "The board and all its tasks will be deleted for everyone in the group. This can't be undone.",
        confirmLabel: 'Delete board',
      });
      if (!ok) return;
      await withBusy(deleteBtn, async () => {
        await remove(STORES.GROUPS, groupId);
        await addToSyncQueue({ collection: 'groups', docId: groupId, operation: 'delete' });
        await flushQueue();
        navigate('#/dashboard');
      }, { label: 'Deleting…' });
      return;
    }

    const ok = await confirmDialog({
      title: 'Leave this group?',
      message: 'You will lose access to its board. You can join again later with the invite code.',
      confirmLabel: 'Leave group',
    });
    if (!ok) return;
    await withBusy(leaveBtn, async () => {
      const user = currentUser();
      const membersList = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
      const me = membersList.find(m => m.uid === user.uid);
      if (me) await leaveGroup(groupId, me);
      navigate('#/dashboard');
    }, { label: 'Leaving…' });
  });
}
