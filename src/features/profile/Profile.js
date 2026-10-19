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
import { getBadgeProgress, getAllBadges } from '../../core/badgeEngine.js';
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
  const allComments = await getAll(STORES.COMMENTS);

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
  
  // Collect all member IDs for this user across all groups
  const myMemberIds = myMembers.map(m => m.id);

  // Aggregate global task stats from all groups
  for (const mm of myMembers) {
    const groupTasks = allTasks.filter(t => t.groupId === mm.groupId);
    totalCompleted += groupTasks.filter(t => t.assignedTo === mm.id && t.status === 'done').length;
    const streakInfo = calculateStreak(groupTasks, mm.id);
    if (streakInfo.currentStreak > totalStreak) totalStreak = streakInfo.currentStreak;
  }

  // Collect earned badges — check by memberId (from all member records) AND uid
  allBadges
    .filter(b => myMemberIds.includes(b.memberId) || b.uid === user.uid)
    .forEach(b => earnedBadgeTypes.add(b.type || b.id));

  // Count user's comments across tasks (by all member IDs)
  const totalComments = allComments.filter(c => myMemberIds.includes(c.memberId) && !c.deleted).length;

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

  const badgeStats = getBadgeProgress({ streakDays: totalStreak, commentCount: totalComments, cardCount: totalCompleted });
  
  // Collect all system badges with descriptions and instructions
  const allBadgesList = getAllBadges();

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
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h3 class="profile-section-title" style="margin-bottom:4px;">🏅 Badges & Achievements</h3>
            <p style="color:var(--text-secondary); font-size:0.85rem; margin:0;">
              Earn badges by completing tasks, maintaining streaks, participating in discussions, and excelling in teamwork.
            </p>
          </div>
          <span style="font-family:var(--font-heading); font-size:0.85rem; color:var(--accent); background:var(--bg-card); padding:6px 14px; border-radius:12px; border:1px solid var(--border); box-shadow:var(--shadow-sm);">
            ${earnedBadgeTypes.size} / ${allBadgesList.length} Unlocked
          </span>
        </div>

        <!-- Filter tabs -->
        <div class="badge-filter-nav" id="badge-filter-nav">
          <button class="badge-filter-btn active" data-filter="all">All <span class="badge-filter-count">${allBadgesList.length}</span></button>
          <button class="badge-filter-btn" data-filter="Streaks">⚡ Streaks <span class="badge-filter-count">${allBadgesList.filter(b => b.category === 'Streaks').length}</span></button>
          <button class="badge-filter-btn" data-filter="Tasks">🎯 Tasks <span class="badge-filter-count">${allBadgesList.filter(b => b.category === 'Tasks').length}</span></button>
          <button class="badge-filter-btn" data-filter="Discussions">💬 Discussions <span class="badge-filter-count">${allBadgesList.filter(b => b.category === 'Discussions').length}</span></button>
          <button class="badge-filter-btn" data-filter="Board">🏁 Board & Project <span class="badge-filter-count">${allBadgesList.filter(b => b.category === 'Board').length}</span></button>
          <button class="badge-filter-btn" data-filter="Peer">🤝 Peer <span class="badge-filter-count">${allBadgesList.filter(b => b.category === 'Peer').length}</span></button>
          <button class="badge-filter-btn" data-filter="Secret">🔒 Secret <span class="badge-filter-count">${allBadgesList.filter(b => b.category === 'Secret').length}</span></button>
        </div>

        <div class="profile-badges-cards-grid" id="badge-cards-container">
          ${allBadgesList.map(b => {
            const earned = earnedBadgeTypes.has(b.id);
            let progressHtml = '';

            if (!earned) {
              if (b.category === 'Streaks') {
                const pct = Math.min(100, Math.round((totalStreak / b.days) * 100));
                progressHtml = `
                  <div class="badge-progress-wrap">
                    <div class="badge-progress-header">
                      <span>Progress</span>
                      <span>${totalStreak} / ${b.days} days (${pct}%)</span>
                    </div>
                    <div class="progress-bar" style="height:6px;">
                      <div class="progress-fill" style="width:${pct}%;"></div>
                    </div>
                  </div>
                `;
              } else if (b.category === 'Tasks') {
                const pct = Math.min(100, Math.round((totalCompleted / b.count) * 100));
                progressHtml = `
                  <div class="badge-progress-wrap">
                    <div class="badge-progress-header">
                      <span>Progress</span>
                      <span>${totalCompleted} / ${b.count} tasks (${pct}%)</span>
                    </div>
                    <div class="progress-bar" style="height:6px;">
                      <div class="progress-fill" style="width:${pct}%;"></div>
                    </div>
                  </div>
                `;
              } else if (b.category === 'Discussions') {
                const pct = Math.min(100, Math.round((totalComments / b.count) * 100));
                progressHtml = `
                  <div class="badge-progress-wrap">
                    <div class="badge-progress-header">
                      <span>Progress</span>
                      <span>${totalComments} / ${b.count} comments (${pct}%)</span>
                    </div>
                    <div class="progress-bar" style="height:6px;">
                      <div class="progress-fill" style="width:${pct}%;"></div>
                    </div>
                  </div>
                `;
              }
            }

            return `
              <div class="badge-card ${earned ? 'badge-earned' : 'badge-locked'}" data-category="${b.category}">
                <div class="badge-card-header">
                  <div class="badge-card-icon-wrap">
                    <span class="badge-card-icon">${earned ? b.icon : (b.hidden ? '❓' : b.icon)}</span>
                  </div>
                  <div class="badge-card-title-wrap">
                    <div class="badge-card-top-meta">
                      <span class="badge-category-pill">${b.category}</span>
                      ${earned
                        ? `<span class="badge-status-pill earned">✓ Earned</span>`
                        : (progressHtml ? `<span class="badge-status-pill in-progress">In Progress</span>` : `<span class="badge-status-pill locked">🔒 Locked</span>`)
                      }
                    </div>
                    <h4 class="badge-card-name">${b.hidden && !earned ? 'Secret Badge' : escapeHtml(b.label)}</h4>
                  </div>
                </div>

                <p class="badge-card-desc">${b.hidden && !earned ? (b.hint || 'A mysterious hidden achievement.') : escapeHtml(b.description)}</p>

                <div class="badge-how-box">
                  <span class="badge-how-title">🎯 How to get:</span>
                  <span class="badge-how-text">${b.hidden && !earned ? 'Perform specific secret actions during group work to discover and unlock.' : escapeHtml(b.howToGet)}</span>
                </div>

                ${progressHtml}
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

  // Category filter handlers
  const filterBtns = document.querySelectorAll('.badge-filter-btn');
  const badgeCards = document.querySelectorAll('.badge-card');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');
      badgeCards.forEach(card => {
        if (filter === 'all' || card.getAttribute('data-category') === filter) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  document.getElementById('btn-profile-back').addEventListener('click', () => navigate('#/dashboard'));
  document.getElementById('btn-edit-profile').addEventListener('click', () => navigate('#/settings'));
}
