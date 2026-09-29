/**
 * Profile Page — Shows user stats, global badges, activity, and reputation.
 */

import { STORES, get, getAll } from '../../services/indexedDBService.js';
import { currentUser } from '../../services/authService.js';
import { escapeHtml, formatTimeAgo } from '../../utils/helpers.js';
import { navigate } from '../../services/router.js';
import { getXPLevel, calculateStreak } from '../../core/gamificationEngine.js';
import { calculateGlobalXP, calculateTotalReputation } from '../../core/eventEngine.js';
import { getRepProgress, isFreeloader } from '../../core/reputationEngine.js';
import { getBadgeProgress, STREAK_BADGES, COMMENT_BADGES, CARD_BADGES, HIDDEN_BADGES, PEER_NOMINATED_BADGES } from '../../core/badgeEngine.js';
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

  const allMembers = await getAll(STORES.MEMBERS);
  const myMembers = allMembers.filter(m => m.uid === user.uid);
  const allTasks = await getAll(STORES.TASKS);
  const allBadges = await getAll(STORES.BADGES);
  const allReviews = await getAll(STORES.PEER_REVIEWS);

  // New Global Scoring
  const totalXP = await calculateGlobalXP(user.uid);
  const totalRep = await calculateTotalReputation(user.uid);
  
  const repProgress = getRepProgress(totalRep);
  const lvl = getXPLevel(totalXP);
  
  const isFlagged = isFreeloader(totalRep);

  // Collect badge stats
  let totalCompleted = 0;
  let totalStreak = 0;
  const earnedBadgeTypes = new Set();
  
  // Aggregate global task stats from all groups
  for (const mm of myMembers) {
    const groupTasks = allTasks.filter(t => t.groupId === mm.groupId);
    totalCompleted += groupTasks.filter(t => t.assignedTo === mm.id && t.status === 'done').length;
    const streakInfo = calculateStreak(groupTasks, mm.id);
    if (streakInfo.currentStreak > totalStreak) totalStreak = streakInfo.currentStreak;
    const memberBadges = allBadges.filter(b => b.memberId === mm.id);
    memberBadges.forEach(b => earnedBadgeTypes.add(b.type));
  }

  // Peer rating average
  let totalRatingSum = 0;
  let totalRatingCount = 0;
  for (const mm of myMembers) {
    const reviews = allReviews.filter(r => r.evaluateeId === mm.id);
    reviews.forEach(r => { totalRatingSum += r.score; totalRatingCount++; });
  }
  const avgRating = totalRatingCount > 0 ? (totalRatingSum / totalRatingCount).toFixed(1) : 'N/A';
  const memberSince = myMembers.length > 0 ? new Date(Math.min(...myMembers.map(m => m.joinedAt || Date.now()))).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A';
  const primaryRole = myMembers.length > 0 ? myMembers[0].role || 'member' : 'member';

  const badgeStats = getBadgeProgress({ streakDays: totalStreak, commentCount: 0 /* simplified */, cardCount: totalCompleted });
  
  // Collect all profile badges to render
  const ALL_PROFILE_BADGES = [...STREAK_BADGES, ...COMMENT_BADGES, ...CARD_BADGES, ...PEER_NOMINATED_BADGES, ...HIDDEN_BADGES];

  const recentTasks = allTasks
    .filter(t => myMembers.some(m => m.id === t.assignedTo) && t.status === 'done' && t.completedAt)
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 5);

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
      ${isFlagged ? `
        <div style="background: rgba(220, 38, 38, 0.1); border-left: 4px solid var(--danger); padding: 16px; margin-bottom: 24px; border-radius: 8px;">
          <h3 style="color: var(--danger); margin: 0 0 8px 0;">Needs Improvement</h3>
          <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary);">Your reputation score is below zero. Board badges are currently suspended. Focus on consistent deliverables and peer collaboration to recover.</p>
        </div>
      ` : ''}

      <div class="profile-hero" style="display:flex; flex-wrap:wrap; gap:32px;">
        <div style="display:flex; gap: 24px; align-items:center; flex: 1; min-width:300px;">
          <div class="profile-avatar-large">
            ${profile.avatarType === 'custom' && profile.avatar
              ? `<img src="${profile.avatar}" alt="Avatar" class="profile-avatar-img" />`
              : `<span class="profile-avatar-emoji">${profile.avatarEmoji || '🧙'}</span>`
            }
          </div>
          <div class="profile-hero-info">
            <h2 class="profile-name">${escapeHtml(profile.displayName)}</h2>
            <div style="margin-bottom:8px;">
              <span class="profile-role-badge">${getRoleName(primaryRole)}</span>
              <span class="profile-role-badge" style="background: var(--accent); color: white;">Tier: ${repProgress.current.label}</span>
            </div>
            ${profile.bio ? `<p class="profile-bio">${escapeHtml(profile.bio)}</p>` : ''}
          </div>
        </div>

        <div style="flex: 1; min-width:300px; display:flex; flex-direction:column; gap:16px;">
          <!-- Reputation Bar -->
          <div class="profile-xp-bar" title="${repProgress.current.description}">
            <div class="profile-xp-header">
              <span style="color:var(--accent); font-weight:bold;">Reputation: ${totalRep}</span>
              <span style="font-size:0.8rem;">${repProgress.next ? `Next: ${repProgress.next.label}` : 'Max Tier'}</span>
            </div>
            <div class="progress-bar" style="height:8px; background: rgba(16, 185, 129, 0.2);">
              <div class="progress-fill" style="width:${repProgress.progress}%; background: var(--accent);"></div>
            </div>
            ${repProgress.next ? `<span class="profile-xp-next">${repProgress.repNeeded - repProgress.repInTier} rep to ${repProgress.next.label}</span>` : ''}
          </div>

          <!-- XP Bar -->
          <div class="profile-xp-bar">
            <div class="profile-xp-header">
              <span>Level ${lvl.level} — ${lvl.title}</span>
              <span>${totalXP} XP</span>
            </div>
            <div class="progress-bar" style="height:8px;">
              <div class="progress-fill" style="width:${lvl.progress}%;"></div>
            </div>
            ${lvl.nextLevelXP ? `<span class="profile-xp-next">${lvl.nextLevelXP - totalXP} XP to Level ${lvl.level + 1}</span>` : '<span class="profile-xp-next">MAX LEVEL!</span>'}
          </div>
        </div>
      </div>

      <div class="profile-stats-grid" style="margin-top: 32px;">
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
        <h3 class="profile-section-title">🏅 Global Badges</h3>
        <div class="profile-badges-grid">
          ${ALL_PROFILE_BADGES.map(b => {
            const earned = earnedBadgeTypes.has(b.id);
            if (b.hidden && !earned) return ''; // Hide locked secret badges
            
            return `
              <div class="profile-badge ${earned ? 'earned' : 'locked'}" title="${b.description}">
                <span class="profile-badge-icon">${earned ? '🏆' : '🔒'}</span>
                <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                  <span class="profile-badge-label">${b.label}</span>
                  ${!earned && b.id.startsWith('streak_') ? `<div class="progress-bar" style="width:100%; height:4px;"><div class="progress-fill" style="width:${badgeStats.streak.pct}%;"></div></div>` : ''}
                  ${!earned && b.id.startsWith('card_') ? `<div class="progress-bar" style="width:100%; height:4px;"><div class="progress-fill" style="width:${badgeStats.card.pct}%;"></div></div>` : ''}
                </div>
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
