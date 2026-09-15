/**
 * Profile Page — Shows user stats, badges, activity.
 */

import { STORES, get, getAll, getAllByIndex } from '../../services/indexedDBService.js';
import { currentUser } from '../../services/authService.js';
import { escapeHtml, formatTimeAgo } from '../../utils/helpers.js';
import { navigate } from '../../services/router.js';
import { calculatePoints, getXPLevel, calculateStreak, BADGE_TYPES } from '../../core/gamificationEngine.js';
import { getRoleName } from '../../services/themeService.js';
import { ICONS } from '../../assets/icons/icons.js';

export async function renderProfile() {
  const app = document.getElementById('app');
  const user = currentUser();
  if (!user) { navigate('#/login'); return; }

  const profile = await get(STORES.USER_PROFILES, user.uid) || {
    uid: user.uid,
    displayName: user.displayName || user.email || 'Unknown',
    bio: '',
    avatarEmoji: '🧙',
    avatarType: 'default',
    avatar: '',
  };

  // Aggregate stats across all groups
  const allMembers = await getAll(STORES.MEMBERS);
  const myMembers = allMembers.filter(m => m.uid === user.uid);
  const myGroupIds = myMembers.map(m => m.groupId);

  const allTasks = await getAll(STORES.TASKS);
  const allBadges = await getAll(STORES.BADGES);
  const allReviews = await getAll(STORES.PEER_REVIEWS);

  let totalPoints = 0;
  let totalCompleted = 0;
  let totalStreak = 0;
  let longestStreak = 0;
  const earnedBadgeTypes = new Set();

  for (const mm of myMembers) {
    const groupTasks = allTasks.filter(t => t.groupId === mm.groupId);
    const pts = calculatePoints(groupTasks, mm.id);
    totalPoints += pts;
    totalCompleted += groupTasks.filter(t => t.assignedTo === mm.id && t.status === 'done').length;

    const streakInfo = calculateStreak(groupTasks, mm.id);
    if (streakInfo.currentStreak > totalStreak) totalStreak = streakInfo.currentStreak;
    if (streakInfo.longestStreak > longestStreak) longestStreak = streakInfo.longestStreak;

    const memberBadges = allBadges.filter(b => b.memberId === mm.id);
    memberBadges.forEach(b => earnedBadgeTypes.add(b.type));
  }

  // Peer rating average across groups
  let totalRatingSum = 0;
  let totalRatingCount = 0;
  for (const mm of myMembers) {
    const reviews = allReviews.filter(r => r.evaluateeId === mm.id);
    reviews.forEach(r => { totalRatingSum += r.score; totalRatingCount++; });
  }
  const avgRating = totalRatingCount > 0 ? (totalRatingSum / totalRatingCount).toFixed(1) : 'N/A';

  const lvl = getXPLevel(totalPoints);
  const memberSince = myMembers.length > 0 ? new Date(Math.min(...myMembers.map(m => m.joinedAt || Date.now()))).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A';

  // Primary role (from first group)
  const primaryRole = myMembers.length > 0 ? myMembers[0].role || 'member' : 'member';

  // Recent activity
  const recentTasks = allTasks
    .filter(t => myMembers.some(m => m.id === t.assignedTo) && t.status === 'done' && t.completedAt)
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 5);

  // All badge type info
  const allBadgeTypesArray = Object.values(BADGE_TYPES);

  app.innerHTML = `
    <header class="board-header">
      <div class="board-header-left">
        <button class="btn-icon" id="btn-profile-back" title="Back">${ICONS.back}</button>
        <h1 class="board-title">My Profile</h1>
      </div>
      <div class="board-header-right">
        <button class="btn btn-secondary btn-sm" id="btn-edit-profile">Edit Profile</button>
      </div>
    </header>

    <div class="profile-page">
      <div class="profile-hero">
        <div class="profile-avatar-large">
          ${profile.avatarType === 'custom' && profile.avatar
            ? `<img src="${profile.avatar}" alt="Avatar" class="profile-avatar-img" />`
            : `<span class="profile-avatar-emoji">${profile.avatarEmoji || '🧙'}</span>`
          }
        </div>
        <div class="profile-hero-info">
          <h2 class="profile-name">${escapeHtml(profile.displayName)}</h2>
          <span class="profile-role-badge">${getRoleName(primaryRole)}</span>
          ${profile.bio ? `<p class="profile-bio">${escapeHtml(profile.bio)}</p>` : ''}
          
          <div class="profile-xp-bar">
            <div class="profile-xp-header">
              <span>Level ${lvl.level} — ${lvl.title}</span>
              <span>${totalPoints} XP</span>
            </div>
            <div class="progress-bar" style="height:12px;">
              <div class="progress-fill" style="width:${lvl.progress}%;"></div>
            </div>
            ${lvl.nextLevelXP ? `<span class="profile-xp-next">${lvl.nextLevelXP - totalPoints} XP to Level ${lvl.level + 1}</span>` : '<span class="profile-xp-next">MAX LEVEL!</span>'}
          </div>
        </div>
      </div>

      <div class="profile-stats-grid">
        <div class="stat-card">
          <span class="stat-card-value">${totalCompleted}</span>
          <span class="stat-card-label">Tasks Completed</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-value">${avgRating}${avgRating !== 'N/A' ? ' ★' : ''}</span>
          <span class="stat-card-label">Avg Peer Rating</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-value">${earnedBadgeTypes.size}</span>
          <span class="stat-card-label">Badges Earned</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-value">${totalStreak > 0 ? totalStreak + 'd' : '0d'}</span>
          <span class="stat-card-label">Active Streak</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-value">${memberSince}</span>
          <span class="stat-card-label">Member Since</span>
        </div>
      </div>

      <div class="profile-section">
        <h3 class="profile-section-title">🏅 Badges Collected</h3>
        <div class="profile-badges-grid">
          ${allBadgeTypesArray.map(b => {
            const earned = earnedBadgeTypes.has(b.id);
            return `
              <div class="profile-badge ${earned ? 'earned' : 'locked'}" title="${earned ? b.description : 'Not yet earned'}">
                <span class="profile-badge-icon">${b.icon}</span>
                <span class="profile-badge-label">${b.label}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="profile-section">
        <h3 class="profile-section-title">📜 Recent Activity</h3>
        <div class="activity-list">
          ${recentTasks.length === 0 ? '<p class="empty-state" style="padding:12px;">No recent activity yet.</p>' : ''}
          ${recentTasks.map(t => {
            const ago = formatTimeAgo(t.completedAt);
            return `
              <div class="activity-item">
                <div class="activity-icon">${ICONS.done}</div>
                <div class="activity-text">
                  Completed <strong>"${escapeHtml(t.title)}"</strong>
                  <span class="activity-time">${ago}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-profile-back').addEventListener('click', () => navigate('#/dashboard'));
  document.getElementById('btn-edit-profile').addEventListener('click', () => navigate('#/settings'));
}

