import { STORES, get, getAllByIndex, put, remove, addToSyncQueue } from '../../services/indexedDBService.js';
import { generateId, formatRelative, escapeHtml } from '../../utils/helpers.js';
import { currentUser } from '../../services/authService.js';
import { getTerm, getRoleName } from '../../services/themeService.js';
import { notify } from '../../services/notificationService.js';
import { navigate } from '../../services/router.js';
import { ICONS } from '../../assets/icons/icons.js';

export async function renderMembers(groupId) {
  const app = document.getElementById('app');
  const user = currentUser();
  const group = await get(STORES.GROUPS, groupId);
  const tasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  const membersList = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);

  const me = membersList.find(m => m.uid === user.uid);
  const isAdmin = me?.role === 'owner' || me?.role === 'co-admin';
  const isOwner = me?.role === 'owner';

  // Analysis variables
  let highestRisk = 0;
  const analysisData = membersList.map((m) => {
    const assigned = tasks.filter((t) => t.assignedTo === m.id);
    const completed = assigned.filter((t) => t.status === 'done');
    const overdue = assigned.filter((t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done');
    
    // Simple heuristic risk score
    let riskScore = 0;
    if (assigned.length > 0) {
      if (completed.length === 0) riskScore += 50;
      if (completed.length > 0 && (completed.length / assigned.length) < 0.3) riskScore += 30;
      riskScore += (overdue.length * 15);
    } else {
      riskScore = 10; // no tasks assigned
    }
    
    if (m.restricted) riskScore += 100; // Flagged manually

    if (riskScore > highestRisk) highestRisk = riskScore;
    return { member: m, assigned: assigned.length, completed: completed.length, overdue: overdue.length, riskScore, restricted: !!m.restricted };
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
              The system monitors assignment completion rates. Members with consistently zero completions or high overdue tasks are flagged as potential risks.
            </p>
          </div>

          <div class="members-grid">
            ${analysisData
              .sort((a, b) => b.riskScore - a.riskScore)
              .map((data) => memberCardHTML(data, highestRisk, isAdmin, isOwner, me, groupId))
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents(groupId);
  bindMemberEvents(groupId, membersList);
}

function memberCardHTML(data, maxRisk, isAdmin, isOwner, me, groupId) {
  const { member, assigned, completed, overdue, riskScore, restricted } = data;
  const isHighRisk = riskScore >= 50;
  
  let riskLabel = 'Active & Engaged';
  let riskColor = 'var(--success)';
  if (restricted) {
    riskLabel = 'RESTRICTED';
    riskColor = 'var(--danger)';
  } else if (isHighRisk) {
    riskLabel = 'High Free-Rider Risk';
    riskColor = 'var(--danger)';
  } else if (riskScore > 20) {
    riskLabel = 'Needs Attention';
    riskColor = 'var(--warning)';
  }

  const isMe = member.id === me?.id;
  const canManage = (isAdmin && member.role === 'member') || (isOwner && member.role === 'co-admin');

  return `
    <div class="member-card ${isHighRisk ? 'high-risk' : ''}">
      <div class="member-card-header">
        <div class="avatar avatar-lg">${escapeHtml(member.displayName?.[0] || '?')}</div>
        <div>
          <h3 class="member-name">
            ${escapeHtml(member.displayName)}
            ${isMe ? '<span class="you-badge">(You)</span>' : ''}
          </h3>
          <div class="member-role">${getRoleName(member.role)}</div>
        </div>
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

      <div class="risk-bar-container">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.75rem;">
          <span style="color:${riskColor}; font-family:var(--font-heading); font-weight:bold;">${riskLabel}</span>
        </div>
      </div>

      ${canManage && !isMe ? `
        <div style="margin-top:16px; border-top:1px solid var(--border); padding-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
          ${isHighRisk ? `<button class="btn btn-secondary btn-sm btn-warn-member" data-member-id="${member.id}" style="border-color:var(--warning); color:var(--warning);">Send Warning</button>` : ''}
          <button class="btn btn-secondary btn-sm btn-restrict-member" data-member-id="${member.id}">${restricted ? 'Unrestrict' : 'Restrict Tasks'}</button>
          <button class="btn btn-secondary btn-sm btn-kick-member" data-member-id="${member.id}" style="border-color:var(--danger); color:var(--danger);">Kick</button>
        </div>
      ` : ''}
    </div>
  `;
}

function bindMemberEvents(groupId, membersList) {
  document.querySelectorAll('.btn-warn-member').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const memberId = e.target.dataset.memberId;
      const member = membersList.find(m => m.id === memberId);
      if (member) {
        await notify({
          uid: member.uid, type: 'free_rider_alert',
          title: '⚠️ Activity Warning',
          message: 'You have been flagged for low participation or overdue tasks. Please complete your assigned tasks.',
          icon: ICONS.alert, actionLink: `#/group/${groupId}`, groupId
        });
        alert(`Warning sent to ${member.displayName}`);
      }
    });
  });

  document.querySelectorAll('.btn-restrict-member').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const memberId = e.target.dataset.memberId;
      const member = membersList.find(m => m.id === memberId);
      if (member) {
        member.restricted = !member.restricted;
        await put(STORES.MEMBERS, member);
        await addToSyncQueue({ collection: 'members', docId: memberId, operation: 'update', data: member });
        await renderMembers(groupId);
      }
    });
  });

  document.querySelectorAll('.btn-kick-member').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (confirm('Are you sure you want to permanently remove this member from the group?')) {
        const memberId = e.target.dataset.memberId;
        const member = membersList.find(m => m.id === memberId);
        
        await remove(STORES.MEMBERS, memberId);
        await addToSyncQueue({ collection: 'members', docId: memberId, operation: 'delete', data: { id: memberId, groupId } });

        // Notify member they were kicked
        if (member) {
          await notify({
            uid: member.uid, type: 'member_left',
            title: 'Removed from Group',
            message: 'You have been removed from the group.',
            icon: ICONS.door, groupId
          });
        }
        
        await renderMembers(groupId);
      }
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
          <span>${ICONS.trophy}</span> Leaderboard
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

export function bindSidebarEvents(groupId) {
  document.getElementById('btn-sidebar-delete-group')?.addEventListener('click', async (e) => {
    if (confirm('Are you sure you want to delete this board? This action cannot be undone.')) {
      const gId = e.currentTarget.dataset.groupId;
      await remove(STORES.GROUPS, gId);
      await addToSyncQueue({ collection: 'groups', docId: gId, operation: 'delete' });
      navigate('#/dashboard');
    }
  });

  document.getElementById('btn-sidebar-leave-group')?.addEventListener('click', async (e) => {
    if (confirm('Are you sure you want to leave this group?')) {
      const user = currentUser();
      const membersList = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
      const me = membersList.find(m => m.uid === user.uid);
      if (me) {
        await remove(STORES.MEMBERS, me.id);
        await addToSyncQueue({ collection: 'members', docId: me.id, operation: 'delete' });
      }
      navigate('#/dashboard');
    }
  });
}
