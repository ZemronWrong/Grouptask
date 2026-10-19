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
  const allPR = await getAll(STORES.PEER_REVIEWS);
  const peerReviews = allPR.filter(pr => pr.groupId === groupId);

  // Compute WPS and PE scores for all members using Chapter 3 formulation
  const memberIds = members.map(m => m.id);
  const n = members.length;
  const csMap = calculateAllContributionScores(tasks, memberIds);
  const ratingsMap = {};
  for (const m of members) {
    ratingsMap[m.id] = peerReviews
      .filter(pr => pr.evaluateeId === m.id || pr.evaluateeId === m.uid || pr.evaluateeUid === m.uid)
      .map(pr => ({ rating: pr.score }));
  }
  const peMap = calculateAllPEScores(csMap, ratingsMap, n);

  // Compute Board Points & Peer Points concurrently for all members
  const memberPoints = await Promise.all(
    members.map(async m => {
      const bp = await calculateBoardPoints(groupId, m.uid);
      const mReviews = peerReviews.filter(pr => pr.evaluateeId === m.id || pr.evaluateeId === m.uid || pr.evaluateeUid === m.uid);
      const avgScore = mReviews.length > 0 
        ? mReviews.reduce((sum, pr) => sum + pr.score, 0) / mReviews.length 
        : 0;
      const pe = peMap[m.id] ?? { peScore: 0, ratingsStatus: 'task_based_only', ratingCount: 0, ciComponent: 0 };
      
      // Peer Adjustment Points: Each star gives 20 peer bonus points (up to 100 points for 5.0 stars)
      const peerPoints = mReviews.length > 0 ? Math.round(avgScore * 20) : 0;
      const totalPoints = bp + peerPoints;

      return {
        ...m,
        boardPoints: bp,
        peerPoints,
        totalPoints,
        avgScore,
        reviewCount: mReviews.length,
        badges: badges.filter(b => b.memberId === m.id || b.uid === m.uid),
        wps: csMap[m.id]?.score ?? 0,
        pe,
      };
    })
  );

  const leaderboardData = memberPoints.sort((a, b) => b.totalPoints - a.totalPoints);
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
                  <div class="podium-points">${m.totalPoints} <span style="font-size:0.7rem;">PTS</span></div>
                  <div class="podium-level" style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                    ${m.boardPoints} Task + ${m.peerPoints} Peer
                  </div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="leaderboard-table">
            <div class="lb-row lb-header">
              <div>Rank</div>
              <div>Member</div>
              <div>Total Points</div>
              <div>Task BP</div>
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
                <div style="font-family:var(--font-heading); font-weight:bold; color:var(--primary); font-size:1.05rem;">
                  ${m.totalPoints}
                </div>
                <div style="font-family:var(--font-heading); font-weight:600; color:var(--accent);">
                  ${m.boardPoints} BP
                </div>
                <div style="font-family:var(--font-heading); font-weight:700; color:var(--text);">
                  ${m.pe.peScore.toFixed(1)}/100
                  <div style="font-size:0.65rem; color:var(--text-muted); font-family:var(--font-body); font-weight:400;">
                    ${m.pe.ratingsStatus === 'has_ratings' ? `${m.pe.ratingCount} peer ratings` : 'Task-based only'}
                  </div>
                </div>
                <div style="color:var(--text-secondary); font-weight:600;">
                  ${m.avgScore > 0 ? `${m.avgScore.toFixed(1)} / 5.0 ⭐` : '<span style="opacity:0.5;">Pending</span>'}
                </div>
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
      const totalPoints = leaderboardData.map(m => m.totalPoints);
      const taskPoints = leaderboardData.map(m => m.boardPoints);
      const peerPoints = leaderboardData.map(m => m.peerPoints);

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
              label: 'Task BP',
              data: taskPoints,
              backgroundColor: secondaryColor,
              borderRadius: 4
            },
            {
              label: 'Peer Points',
              data: peerPoints,
              backgroundColor: '#F59E0B',
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
              label: 'Peer Quality (0-100)',
              data: leaderboardData.map(m => Math.round(m.avgScore * 20)),
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              borderColor: dangerColor,
              pointBackgroundColor: dangerColor,
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: dangerColor
            },
            {
              label: 'WPS Share (%)',
              data: leaderboardData.map(m => Math.round(m.wps)),
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
            data: leaderboardData.map(m => Math.max(1, m.totalPoints)), // base contribution on total points (task + peer)
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

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

export async function renderEvaluation(groupId) {
  const app = document.getElementById('app');
  const user = currentUser();
  const members = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
  const tasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  const allPR = await getAll(STORES.PEER_REVIEWS);
  const peerReviews = allPR.filter(pr => pr.groupId === groupId);

  const me = members.find(m => m.uid === user?.uid) || members.find(m => m.displayName === user?.displayName);
  const others = members.filter(m => m.uid !== user?.uid);

  const myReviews = peerReviews.filter(pr => 
    pr.reviewerId === me?.id || 
    pr.reviewerId === user?.uid || 
    pr.reviewerUid === user?.uid ||
    pr.reviewerMemberId === me?.id
  );

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
          <p style="color:var(--text-secondary); margin-bottom: 24px;">Rate your teammates' contributions. This confidentially adjusts their total points and standing on the leaderboard.</p>

          ${others.length === 0 ? '<div class="empty-state">You are the only member in this group.</div>' : ''}

          ${others.map(m => {
            const existingReview = myReviews.find(r => 
              r.evaluateeId === m.id || 
              r.evaluateeId === m.uid || 
              r.evaluateeUid === m.uid
            );
            const score = existingReview?.score || 0;
            return `
              <div class="eval-card" style="${existingReview ? 'border-color:rgba(34,197,94,0.45); background:linear-gradient(to bottom, rgba(34,197,94,0.06), transparent);' : ''}">
                <div class="eval-card-header">
                  <div style="display:flex; align-items:center; gap:12px;">
                    <div class="avatar">${escapeHtml(m.displayName?.[0] || '?')}</div>
                    <div>
                      <h3 style="margin:0; font-size:1.1rem; color:var(--text);">${escapeHtml(m.displayName)}</h3>
                    </div>
                  </div>
                  ${existingReview 
                    ? `<div style="display:flex; align-items:center; gap:8px;">
                         <span style="background:rgba(34,197,94,0.2); color:#22c55e; border:1px solid rgba(34,197,94,0.4); font-size:0.75rem; font-weight:700; padding:4px 10px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; font-family:var(--font-heading);">
                           ✓ EVALUATION SUBMITTED
                         </span>
                         <div class="eval-pe-score" style="color:var(--primary); font-weight:700;">Rated: ${score}/5 ⭐</div>
                       </div>` 
                    : `<div style="font-size:0.72rem; color:var(--warning); background:rgba(234,179,8,0.12); padding:4px 8px; border-radius:6px; border:1px solid rgba(234,179,8,0.3); text-transform:uppercase; font-family:var(--font-heading); font-weight:700;">⚠️ PENDING RATING</div>`
                  }
                </div>
                
                ${existingReview ? `<div style="font-size:0.82rem; color:#22c55e; margin: 8px 0 12px 0; font-weight:600; display:flex; align-items:center; gap:6px;">✓ You evaluated this teammate (${score}/5 ⭐). You can modify your rating or feedback below:</div>` : ''}

                <form class="eval-form" data-evaluatee-id="${m.id}">
                  <div class="form-group" style="margin-bottom:14px;">
                    <label style="font-weight:600; color:var(--text);">Rating (1-5 Stars)</label>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
                      ${[1,2,3,4,5].map(star => `
                        <label class="star-rating-pill" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:8px; border:1px solid ${score === star ? 'var(--primary)' : 'var(--border)'}; background:${score === star ? 'var(--primary-soft)' : 'var(--bg-input)'}; color:var(--text); font-family:var(--font-heading); font-weight:${score === star ? '700' : '400'}; transition:all 0.15s ease;">
                          <input type="radio" name="score_${m.id}" value="${star}" ${score === star ? 'checked' : ''} required style="accent-color:var(--primary);" />
                          ${star} ⭐
                        </label>
                      `).join('')}
                    </div>
                  </div>
                  <div class="form-group" style="margin-bottom:14px;">
                    <label style="font-weight:600; color:var(--text);">Feedback (Private)</label>
                    <textarea name="comment_${m.id}" rows="2" placeholder="Write private feedback for your teammate..." style="width:100%; border-radius:8px; border:1px solid var(--border); padding:8px 10px; background:var(--bg-input); color:var(--text); box-sizing:border-box;">${existingReview?.comment || ''}</textarea>
                  </div>
                  <div style="text-align:right;">
                    <button type="submit" class="btn ${existingReview ? 'btn-secondary' : 'btn-primary'} btn-sm" style="font-weight:700;">
                      ${existingReview ? '✓ Update Evaluation' : 'Submit Evaluation'}
                    </button>
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
      const evaluatee = members.find(m => m.id === evaluateeId);
      const scoreInput = form.querySelector(`input[name="score_${evaluateeId}"]:checked`);
      if (!scoreInput) {
        showToast('Please select a star rating first.');
        return;
      }
      const score = parseInt(scoreInput.value);
      const comment = form.querySelector(`textarea[name="comment_${evaluateeId}"]`)?.value || '';

      const existingReview = myReviews.find(r => 
        r.evaluateeId === evaluateeId || 
        r.evaluateeId === evaluatee?.uid || 
        r.evaluateeUid === evaluatee?.uid
      );
      const reviewId = existingReview ? existingReview.id : generateId();

      const review = {
        id: reviewId,
        groupId,
        reviewerId: user?.uid || me?.id, // Use user.uid so firestore.rules (request.auth.uid) matches!
        reviewerMemberId: me?.id || user?.uid,
        reviewerUid: user?.uid || me?.id,
        evaluateeId: evaluatee?.id || evaluateeId,
        evaluateeUid: evaluatee?.uid || null,
        score,
        comment,
        updatedAt: Date.now()
      };

      await put(STORES.PEER_REVIEWS, review);
      await addToSyncQueue({ collection: 'peerReviews', docId: reviewId, operation: 'update', data: review });

      // Calculate new average for the evaluatee
      const allReviewsForEvaluatee = (await getAll(STORES.PEER_REVIEWS))
        .filter(r => r.groupId === groupId && (r.evaluateeId === evaluateeId || r.evaluateeId === evaluatee?.uid || r.evaluateeUid === evaluatee?.uid));
      
      const newAvg = allReviewsForEvaluatee.length > 0 
        ? allReviewsForEvaluatee.reduce((sum, r) => sum + r.score, 0) / allReviewsForEvaluatee.length
        : score;
      
      if (evaluatee) {
        evaluatee.averagePeerScore = newAvg;
        await put(STORES.MEMBERS, evaluatee);
        await addToSyncQueue({ collection: 'members', docId: evaluatee.id, operation: 'update', data: evaluatee });
      }

      // Record Peer Eval Rep Event
      let eventType = null;
      let repDelta = 0;
      if (newAvg >= 4.0) { eventType = EVENT_TYPES.PEER_EVAL_HIGH; repDelta = 15; }
      else if (newAvg < 2.5) { eventType = EVENT_TYPES.PEER_EVAL_LOW; repDelta = -20; }
      
      if (eventType && evaluatee) {
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
      if (evaluatee) {
        await notify({
          uid: evaluatee.uid, type: 'evaluation_received',
          title: 'New Peer Evaluation',
          message: `Someone rated you ${score}★`,
          icon: '⭐', actionLink: `#/group/${groupId}/leaderboard`, groupId
        });
      }

      showToast(`Evaluation for ${evaluatee?.displayName || 'teammate'} submitted! ⭐`);
      await renderEvaluation(groupId);
    });
  });
}
