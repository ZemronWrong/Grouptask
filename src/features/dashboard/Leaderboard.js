import { STORES, get, getAllByIndex, put, addToSyncQueue } from '../../services/indexedDBService.js';
import { calculateBoardPoints, recordEvent, EVENT_TYPES } from '../../core/eventEngine.js';
import { calculateAllContributionScores } from '../../core/scoringEngine.js';
import { calculateAllPEScores } from '../../core/peerEvaluationEngine.js';
import { getBadgeById } from '../../core/badgeEngine.js';
import { escapeHtml, generateId } from '../../utils/helpers.js';
import { currentUser } from '../../services/authService.js';
import { sidebarHTML, bindSidebarEvents } from '../members/MemberList.js';
import { getTerm } from '../../services/themeService.js';
import { notify } from '../../services/notificationService.js';
import { ICONS } from '../../assets/icons/icons.js';
import { Chart } from 'chart.js/auto';

export async function renderLeaderboard(groupId) {
  const app = document.getElementById('app');
  const group = await get(STORES.GROUPS, groupId);
  const tasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  const members = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
  const badges = await getAllByIndex(STORES.BADGES, 'groupId', groupId);
  const peerReviews = await getAllByIndex(STORES.PEER_REVIEWS, 'groupId', groupId);

  // Compute WPS and PE scores for all members using Chapter 3 formulation
  const memberIds = members.map(m => m.id);
  const n = members.length;
  const csMap = calculateAllContributionScores(tasks, memberIds);
  const ratingsMap = {};
  for (const m of members) {
    ratingsMap[m.id] = peerReviews
      .filter(pr => pr.evaluateeId === m.id)
      .map(pr => ({ rating: pr.score }));
  }
  const peMap = calculateAllPEScores(csMap, ratingsMap, n);

  // Compute Board Points concurrently for all members
  const memberPoints = await Promise.all(
    members.map(async m => {
      const bp = await calculateBoardPoints(groupId, m.uid);
      const mReviews = peerReviews.filter(pr => pr.evaluateeId === m.id);
      const avgScore = mReviews.length > 0 
        ? mReviews.reduce((sum, pr) => sum + pr.score, 0) / mReviews.length 
        : 0;
      return {
        ...m,
        boardPoints: bp,
        avgScore,
        reviewCount: mReviews.length,
        badges: badges.filter(b => b.memberId === m.id),
        wps: csMap[m.id]?.score ?? 0,
        pe:  peMap[m.id] ?? { peScore: 0, ratingsStatus: 'task_based_only', ratingCount: 0, ciComponent: 0 },
      };
    })
  );

  const leaderboardData = memberPoints.sort((a, b) => b.boardPoints - a.boardPoints);
  const top3 = leaderboardData.slice(0, 3);
  const rest = leaderboardData.slice(3);
  const rewardLabel = getTerm('rewardLabel');

  app.innerHTML = `
    <div class="app-layout">
      ${sidebarHTML(groupId, 'leaderboard', members, tasks)}
      <div class="main-content">
        <header class="board-header">
          <div class="board-header-left">
            <h1 class="board-title">${ICONS.trophy} Leaderboard and Data Visualization</h1>
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
                  <div class="podium-level">${m.reviewCount} Reviews</div>
                  <div class="podium-points">${m.boardPoints} <span style="font-size:0.7rem;">BP</span></div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="leaderboard-table">
            <div class="lb-row lb-header">
              <div>Rank</div>
              <div>Member</div>
              <div>Board Points (BP)</div>
              <div>WPS Share</div>
              <div>PE Score</div>
              <div>Peer Avg</div>
              <div>Board Badges</div>
            </div>
            ${rest.map((m, i) => `
              <div class="lb-row">
                <div class="lb-rank">#${i + 4}</div>
                <div>
                  <span style="font-family:var(--font-heading); font-weight:600; color:var(--text);">${escapeHtml(m.displayName)}</span>
                </div>
                <div style="font-family:var(--font-heading); font-weight:bold; color:var(--accent);">${m.boardPoints}</div>
                <div style="font-family:var(--font-heading); font-weight:600; color:var(--accent);">${m.wps.toFixed(1)}%</div>
                <div style="font-family:var(--font-heading); font-weight:700; color:var(--primary);">
                  ${m.pe.peScore.toFixed(1)}/100
                  <div style="font-size:0.65rem; color:var(--text-muted); font-family:var(--font-body); font-weight:400;">
                    ${m.pe.ratingsStatus === 'has_ratings' ? `${m.pe.ratingCount} peer ratings` : 'Task-based only'}
                  </div>
                </div>
                <div style="color:var(--text-secondary);">${m.avgScore.toFixed(1)} / 5.0</div>
                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                  ${m.badges.map(b => {
                    const meta = getBadgeById(b.type || b.id);
                    const icon = meta?.icon || '🏅';
                    const label = meta?.label || 'Badge';
                    const how = meta?.howToGet || meta?.description || 'Earned achievement';
                    return `<span title="${escapeHtml(`${label} — How to get: ${how}`)}" style="font-size:1.2rem; cursor:help;">${icon}</span>`;
                  }).join('')}
                </div>
              </div>
            `).join('')}
            ${rest.length === 0 ? `<div style="padding: 24px; text-align:center; color:var(--text-muted); font-family:var(--font-heading);">No other members to display.</div>` : ''}
          </div>

          <div class="leaderboard-charts" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-top: 40px;">
            <div style="background: var(--bg-card); border-radius: 16px; padding: 24px; box-shadow: var(--shadow-md); border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center;">
              <h3 style="font-family: var(--font-heading); margin-bottom: 24px; color: var(--text); font-size: 1.1rem; letter-spacing: 0.5px;">Contribution Share</h3>
              <div style="position: relative; width: 100%; max-width: 250px; aspect-ratio: 1;">
                <canvas id="pieChart"></canvas>
              </div>
            </div>
            
            <div style="background: var(--bg-card); border-radius: 16px; padding: 24px; box-shadow: var(--shadow-md); border: 1px solid var(--border); display: flex; flex-direction: column;">
              <h3 style="font-family: var(--font-heading); margin-bottom: 16px; color: var(--text); font-size: 1.1rem; letter-spacing: 0.5px;">Points Comparison</h3>
              <div style="flex-grow: 1; min-height: 250px; position: relative;">
                <canvas id="pointsChart"></canvas>
              </div>
            </div>

            <div style="background: var(--bg-card); border-radius: 16px; padding: 24px; box-shadow: var(--shadow-md); border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center;">
              <h3 style="font-family: var(--font-heading); margin-bottom: 16px; color: var(--text); font-size: 1.1rem; letter-spacing: 0.5px;">Performance Radar</h3>
              <div style="position: relative; width: 100%; max-width: 280px; aspect-ratio: 1;">
                <canvas id="radarChart"></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents(groupId);

  // Initialize Charts
  setTimeout(() => {
    const pointsCtx = document.getElementById('pointsChart');
    const radarCtx = document.getElementById('radarChart');
    const pieCtx = document.getElementById('pieChart');
    
    if (pointsCtx && radarCtx && pieCtx) {
      const labels = leaderboardData.map(m => m.displayName || 'Unknown');
      const totalPoints = leaderboardData.map(m => m.boardPoints);
      const taskPoints = leaderboardData.map(m => m.boardPoints); // Simplified for now since peer pts are gone
      const peerPoints = leaderboardData.map(m => m.avgScore);

      // Theme Colors & Fonts
      const style = getComputedStyle(document.body);
      const primaryColor = style.getPropertyValue('--primary').trim() || '#4F46E5';
      const secondaryColor = style.getPropertyValue('--accent').trim() || '#10B981';
      const dangerColor = style.getPropertyValue('--danger').trim() || '#EF4444';
      const textColor = style.getPropertyValue('--text').trim() || '#1f2937';
      const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#6b7280';
      const borderColor = style.getPropertyValue('--border').trim() || '#e5e7eb';
      const fontFamily = style.getPropertyValue('--font-body').trim() || "'Inter', sans-serif";

      Chart.defaults.font.family = fontFamily;
      Chart.defaults.color = textColor;

      new Chart(pointsCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Total Points',
              data: totalPoints,
              backgroundColor: primaryColor,
              borderRadius: 4
            },
            {
              label: 'Task Points',
              data: taskPoints,
              backgroundColor: secondaryColor,
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'top', labels: { color: textColor } }
          },
          scales: {
            y: { beginAtZero: true, grid: { color: borderColor }, ticks: { color: textSecondary } },
            x: { grid: { display: false }, ticks: { color: textSecondary } }
          }
        }
      });

      new Chart(radarCtx, {
        type: 'radar',
        data: {
          labels,
          datasets: [
            {
              label: 'Peer Adjustments',
              data: peerPoints,
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              borderColor: dangerColor,
              pointBackgroundColor: dangerColor,
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: dangerColor
            },
            {
              label: 'Task Points',
              data: taskPoints,
              backgroundColor: 'rgba(16, 185, 129, 0.2)',
              borderColor: secondaryColor,
              pointBackgroundColor: secondaryColor,
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: secondaryColor
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 } } }
          },
          scales: {
            r: {
              angleLines: { color: borderColor },
              grid: { color: borderColor },
              pointLabels: { color: textColor, font: { size: 10 } },
              ticks: { display: false, backdropColor: 'transparent' }
            }
          }
        }
      });

      // Distinct colors for the pie chart
      const pieColors = [
        primaryColor, 
        secondaryColor, 
        '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6'
      ];

      new Chart(pieCtx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: taskPoints, // base contribution on tasks completed
            backgroundColor: pieColors.slice(0, labels.length),
            borderWidth: 2,
            borderColor: getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { 
              position: 'bottom', 
              labels: { 
                color: textColor, 
                padding: 15,
                usePointStyle: true,
                font: { size: 11 }
              } 
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  let value = context.raw || 0;
                  let total = context.chart._metasets[context.datasetIndex].total;
                  let percentage = total > 0 ? Math.round((value / total) * 100) + '%' : '0%';
                  return ` ${value} pts (${percentage})`;
                }
              }
            }
          }
        }
      });
    }
  }, 0);
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

      // Record Peer Eval Rep Event
      let eventType = null;
      let repDelta = 0;
      if (newAvg >= 4.0) { eventType = EVENT_TYPES.PEER_EVAL_HIGH; repDelta = 15; }
      else if (newAvg < 2.5) { eventType = EVENT_TYPES.PEER_EVAL_LOW; repDelta = -20; }
      
      if (eventType) {
        await recordEvent({
          eventType,
          userId: evaluatee.uid,
          memberId: evaluatee.id,
          boardId: groupId,
          repDelta,
          metadata: { avgScore: newAvg, reviewId }
        });
      }

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
