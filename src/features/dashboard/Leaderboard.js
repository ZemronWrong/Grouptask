import { STORES, get, getAllByIndex, put, add, addToSyncQueue } from '../../services/indexedDBService.js';
import { calculatePoints, getXPLevel } from '../../core/gamificationEngine.js';
import { escapeHtml, generateId } from '../../utils/helpers.js';
import { currentUser } from '../../services/authService.js';
import { sidebarHTML, bindSidebarEvents } from '../members/MemberList.js';
import { getTerm } from '../../services/themeService.js';
import { notify } from '../../services/notificationService.js';
import { ICONS } from '../../assets/icons/icons.js';

export async function renderLeaderboard(groupId) {
  const app = document.getElementById('app');
  const group = await get(STORES.GROUPS, groupId);
  const tasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  const members = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
  const badges = await getAllByIndex(STORES.BADGES, 'groupId', groupId);
  const peerReviews = await getAllByIndex(STORES.PEER_REVIEWS, 'groupId', groupId);

  const leaderboardData = members.map(m => {
    const taskPts = calculatePoints(tasks, m.id);
    const mReviews = peerReviews.filter(pr => pr.evaluateeId === m.id);
    const avgScore = mReviews.length > 0 
      ? mReviews.reduce((sum, pr) => sum + pr.score, 0) / mReviews.length 
      : 0;
    
    // Add 50 pts per star above 3, subtract 50 pts per star below 3 (if there are reviews)
    let peerPts = 0;
    if (mReviews.length > 0) {
      peerPts = Math.round((avgScore - 3) * 50);
    }
    
    const totalPts = Math.max(0, taskPts + peerPts);
    const memberBadges = badges.filter(b => b.memberId === m.id);
    const lvlInfo = getXPLevel(totalPts);

    return {
      ...m,
      taskPts,
      peerPts,
      totalPts,
      avgScore,
      reviewCount: mReviews.length,
      badges: memberBadges,
      level: lvlInfo.level
    };
  }).sort((a, b) => b.totalPts - a.totalPts);

  const top3 = leaderboardData.slice(0, 3);
  const rest = leaderboardData.slice(3);
  const rewardLabel = getTerm('rewardLabel');

  app.innerHTML = `
    <div class="app-layout">
      ${sidebarHTML(groupId, 'leaderboard', members, tasks)}
      <div class="main-content">
        <header class="board-header">
          <div class="board-header-left">
            <h1 class="board-title">${ICONS.trophy} Leaderboard</h1>
          </div>
        </header>

        <div class="leaderboard-container">
          <div class="podium">
            ${top3.map((m, i) => `
              <div class="podium-card podium-${i+1}">
                <span class="podium-rank">
                  ${i === 0 ? '👑' : i === 1 ? '🥈' : '🥉'}
                </span>
                <div class="avatar avatar-lg">${escapeHtml(m.displayName?.[0] || '?')}</div>
                <div style="text-align:center;">
                  <div class="podium-name">${escapeHtml(m.displayName)}</div>
                  <div class="podium-level">Level ${m.level}</div>
                  <div class="podium-points">${m.totalPts} <span style="font-size:0.7rem;">${rewardLabel}</span></div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="leaderboard-table">
            <div class="lb-row lb-header">
              <div>Rank</div>
              <div>Member</div>
              <div>Tasks (${rewardLabel})</div>
              <div>Peer Adjust</div>
              <div>Total ${rewardLabel}</div>
              <div>Badges</div>
            </div>
            ${rest.map((m, i) => `
              <div class="lb-row">
                <div class="lb-rank">#${i + 4}</div>
                <div>
                  <span style="font-family:var(--font-heading); font-weight:600; color:var(--text);">${escapeHtml(m.displayName)}</span>
                  <span class="lb-name-level">Level ${m.level}</span>
                </div>
                <div style="color:var(--text-secondary);">${m.taskPts}</div>
                <div style="color:${m.peerPts >= 0 ? 'var(--success)' : 'var(--danger)'};">
                  ${m.peerPts > 0 ? '+' : ''}${m.peerPts}
                </div>
                <div style="font-family:var(--font-heading); font-weight:bold; color:var(--accent);">${m.totalPts}</div>
                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                  ${m.badges.map(b => `<span title="Achievement Unlocked" style="font-size:1.2rem;">${b.type === 'first_blood' ? '🩸' : b.type === 'overachiever' ? '🔥' : b.type === 'speed_demon' ? '⚡' : '🏅'}</span>`).join('')}
                </div>
              </div>
            `).join('')}
            ${rest.length === 0 ? `<div style="padding: 24px; text-align:center; color:var(--text-muted); font-family:var(--font-heading);">No other members to display.</div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents(groupId);
}

export async function renderEvaluation(groupId) {
  const app = document.getElementById('app');
  const user = currentUser();
  const members = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
  const tasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  const peerReviews = await getAllByIndex(STORES.PEER_REVIEWS, 'groupId', groupId);

  const me = members.find(m => m.uid === user.uid);
  const others = members.filter(m => m.uid !== user.uid);

  const myReviews = peerReviews.filter(pr => pr.reviewerId === me?.id);

  app.innerHTML = `
    <div class="app-layout">
      ${sidebarHTML(groupId, 'evaluate', members, tasks)}
      <div class="main-content">
        <header class="board-header">
          <div class="board-header-left">
            <h1 class="board-title">${ICONS.star} Peer Evaluation</h1>
          </div>
        </header>
        
        <div class="leaderboard-container">
          <p style="color:var(--text-secondary); margin-bottom: 24px;">Rate your teammates' contributions. This confidentially adjusts their total points on the leaderboard.</p>

          ${others.length === 0 ? '<div class="empty-state">You are the only member in this group.</div>' : ''}

          ${others.map(m => {
            const existingReview = myReviews.find(r => r.evaluateeId === m.id);
            const score = existingReview?.score || 0;
            return `
              <div class="eval-card">
                <div class="eval-card-header">
                  <div style="display:flex; align-items:center; gap:12px;">
                    <div class="avatar">${escapeHtml(m.displayName?.[0] || '?')}</div>
                    <div>
                      <h3 style="margin:0; font-size:1.1rem; color:var(--text);">${escapeHtml(m.displayName)}</h3>
                    </div>
                  </div>
                  ${existingReview ? `<div class="eval-pe-score">Rated: ${score}/5</div>` : `<div style="font-size:0.75rem; color:var(--warning); text-transform:uppercase; font-family:var(--font-heading);">PENDING RATING</div>`}
                </div>
                
                <form class="eval-form" data-evaluatee-id="${m.id}">
                  <div class="form-group" style="margin-bottom:12px;">
                    <label>Rating (1-5 Stars)</label>
                    <div style="display:flex; gap:8px;">
                      ${[1,2,3,4,5].map(star => `
                        <label style="cursor:pointer; display:flex; align-items:center; gap:4px; color:var(--text); font-family:var(--font-heading);">
                          <input type="radio" name="score_${m.id}" value="${star}" ${score === star ? 'checked' : ''} required />
                          ${star} ⭐
                        </label>
                      `).join('')}
                    </div>
                  </div>
                  <div class="form-group" style="margin-bottom:12px;">
                    <label>Feedback (Private)</label>
                    <textarea name="comment_${m.id}" rows="2" placeholder="How was working with them?">${existingReview?.comment || ''}</textarea>
                  </div>
                  <div style="text-align:right;">
                    <button type="submit" class="btn btn-primary btn-sm">Submit Evaluation</button>
                  </div>
                </form>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents(groupId);

  document.querySelectorAll('.eval-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const evaluateeId = form.dataset.evaluateeId;
      const score = parseInt(form.querySelector(`input[name="score_${evaluateeId}"]:checked`).value);
      const comment = form.querySelector(`textarea[name="comment_${evaluateeId}"]`).value;

      const existingReview = myReviews.find(r => r.evaluateeId === evaluateeId);
      const reviewId = existingReview ? existingReview.id : generateId();

      const review = {
        id: reviewId,
        groupId,
        reviewerId: me.id,
        evaluateeId,
        score,
        comment,
        updatedAt: Date.now()
      };

      await put(STORES.PEER_REVIEWS, review);
      await addToSyncQueue({ collection: 'peerReviews', docId: reviewId, operation: 'update', data: review });

      // Calculate new average for the evaluatee
      const allReviewsForEvaluatee = (await getAllByIndex(STORES.PEER_REVIEWS, 'groupId', groupId))
                                      .filter(r => r.evaluateeId === evaluateeId);
      
      const newAvg = allReviewsForEvaluatee.reduce((sum, r) => sum + r.score, 0) / allReviewsForEvaluatee.length;
      
      const evaluatee = await get(STORES.MEMBERS, evaluateeId);
      evaluatee.averagePeerScore = newAvg;
      await put(STORES.MEMBERS, evaluatee);
      await addToSyncQueue({ collection: 'members', docId: evaluatee.id, operation: 'update', data: evaluatee });

      // Notify the evaluatee
      await notify({
        uid: evaluatee.uid, type: 'evaluation_received',
        title: 'New Peer Evaluation',
        message: `Someone rated you ${score}★`,
        icon: '⭐', actionLink: `#/group/${groupId}/leaderboard`, groupId
      });

      await renderEvaluation(groupId);
    });
  });
}
