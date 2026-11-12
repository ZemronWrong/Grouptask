import { STORES, get, getAll, getAllByIndex, put, addToSyncQueue, getSyncQueue } from '../../services/indexedDBService.js';
// profileMap for avatar images

import { calculateBoardPoints } from '../../core/eventEngine.js';
import { calculateAllContributionScores } from '../../core/scoringEngine.js';
import { calculateAllPEScores } from '../../core/peerEvaluationEngine.js';
import { getBadgeById } from '../../core/badgeEngine.js';
import { escapeHtml, generateId } from '../../utils/helpers.js';
import { currentUser } from '../../services/authService.js';
import { sidebarHTML, bindSidebarEvents } from '../members/MemberList.js';
import { showToast } from '../../utils/ui.js';
import { getTerm } from '../../services/themeService.js';
import { ICONS } from '../../assets/icons/icons.js';
// F3: register only the parts the bar chart uses, not every chart type
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

export async function renderLeaderboard(groupId) {
  const app = document.getElementById('app');
  const group = await get(STORES.GROUPS, groupId);
  const tasks = await getAllByIndex(STORES.TASKS, 'groupId', groupId);
  const members = await getAllByIndex(STORES.MEMBERS, 'groupId', groupId);
  const badges = await getAllByIndex(STORES.BADGES, 'groupId', groupId);
  const allPR = await getAll(STORES.PEER_REVIEWS);
  const peerReviews = allPR.filter(pr => pr.groupId === groupId);

  const user = currentUser();
  const me = members.find(m => m.uid === user?.uid);

  // Build profileMap for avatar images
  const allProfiles = await getAll(STORES.USER_PROFILES);
  const profileMap = {};
  (allProfiles || []).forEach(p => { profileMap[p.uid] = p; });

  // Compute WPS and PE scores ONLY for the signed-in member's private card (UREB A2)
  const memberIds = members.map(m => m.id);
  const n = members.length;
  const csMap = calculateAllContributionScores(tasks, memberIds);

  let myWps = 0;
  let myPeScore = 0;
  let myRatingCount = 0;
  let myAvgScore = 0;

  if (me) {
    const myReviews = peerReviews.filter(pr =>
      pr.evaluateeId === me.id || pr.evaluateeId === me.uid || pr.evaluateeUid === me.uid
    );
    myRatingCount = myReviews.length;
    myAvgScore = myRatingCount > 0 ? (myReviews.reduce((sum, pr) => sum + pr.score, 0) / myRatingCount) : 0;
    myWps = csMap[me.id]?.score ?? 0;

    // Under Chapter 3 PE formulation: requires at least 2 ratings for peer component
    const myRatingsMap = { [me.id]: myReviews.map(pr => ({ rating: pr.score })) };
    const myPeMap = calculateAllPEScores(csMap, myRatingsMap, n);
    const myPeData = myPeMap[me.id] ?? { peScore: 0, ratingsStatus: 'task_based_only' };
    myPeScore = myPeData.peScore;
  }

  // Compute Board Points for all members — leaderboard ranks by Board Points only (UREB A2)
  const memberPoints = await Promise.all(
    members.map(async m => {
      const bp = await calculateBoardPoints(groupId, m.uid);
      return {
        ...m,
        boardPoints: bp,
        badges: badges.filter(b => b.memberId === m.id || b.uid === m.uid),
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
            <h1 class="board-title">${ICONS.trophy} Leaderboard</h1>
          </div>
        </header>

        <div class="leaderboard-container">
          ${!group?.scoresHidden && me ? `
            <div class="your-scores-card" style="background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:20px; margin-bottom:28px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="margin:0; font-size:1.05rem; color:var(--text); display:flex; align-items:center; gap:8px;">
                  <span>👤</span> Your Private Scores
                </h3>
                <span style="font-size:0.75rem; color:var(--text-muted); background:var(--bg); border:1px solid var(--border); padding:3px 8px; border-radius:12px;">Only visible to you</span>
              </div>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:16px;">
                <div style="background:var(--bg); padding:12px 16px; border-radius:8px; border:1px solid var(--border);">
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">Contribution Share (WPS)</div>
                  <div style="font-size:1.25rem; font-weight:700; color:var(--primary);">${myWps.toFixed(1)}%</div>
                </div>
                <div style="background:var(--bg); padding:12px 16px; border-radius:8px; border:1px solid var(--border);">
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">Peer Evaluation (PE) Score</div>
                  <div style="font-size:1.25rem; font-weight:700; color:var(--accent);">${myPeScore.toFixed(1)} / 100</div>
                  <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
                    ${myRatingCount >= 2 ? `${myRatingCount} peer ratings applied` : 'Task-based only, waiting for ratings'}
                  </div>
                </div>
                <div style="background:var(--bg); padding:12px 16px; border-radius:8px; border:1px solid var(--border);">
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">Average Peer Rating</div>
                  <div style="font-size:1.25rem; font-weight:700; color:var(--text);">
                    ${myRatingCount >= 2 ? `${myAvgScore.toFixed(1)} / 5.0 ⭐` : '<span style="font-size:0.85rem; font-weight:normal; color:var(--text-muted);">Waiting for ≥ 2 ratings</span>'}
                  </div>
                </div>
              </div>
            </div>
          ` : ''}

          <div class="podium">
            ${top3.map((m, i) => `
              <a href="#/profile/${m.uid || m.id}" class="podium-card podium-${i+1}" style="text-decoration:none; color:inherit; cursor:pointer;" title="View ${escapeHtml(m.displayName)}'s profile & achievements">
                <span class="podium-rank">
                  ${i === 0 ? `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="7"/><path d="M12 14v-4"/><path d="M8 6L6 3"/><path d="M16 6l2-3"/><path d="M9 3h6"/></svg>` : i === 1 ? `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="7"/><path d="M12 14v-4"/><path d="M8 6L6 3"/><path d="M16 6l2-3"/><path d="M9 3h6"/></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CD7C4B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="7"/><path d="M12 14v-4"/><path d="M8 6L6 3"/><path d="M16 6l2-3"/><path d="M9 3h6"/></svg>`}
                </span>
                <div class="avatar avatar-lg" style="overflow:hidden;">
                  ${(() => { const pr=profileMap[m.uid]; return pr?.avatarType==='custom'&&pr?.avatar ? `<img src="${pr.avatar}" alt="${escapeHtml(m.displayName?.[0]||'?')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : escapeHtml(m.displayName?.[0]||'?'); })()}
                </div>
                <div style="text-align:center;">
                  <div class="podium-name">${escapeHtml(m.displayName)}</div>
                  <div class="podium-points">${m.boardPoints} <span style="font-size:0.7rem;">BP</span></div>
                  <div style="font-size:0.75rem; color:var(--primary); margin-top:4px; font-weight:600;">View Profile ➔</div>
                </div>
              </a>
            `).join('')}
          </div>

          <div class="leaderboard-table">
            <div class="lb-row lb-header">
              <div>Rank</div>
              <div>Member</div>
              <div>Board Points</div>
              <div>Board Badges</div>
            </div>
            ${rest.map((m, i) => `
              <div class="lb-row">
                <div class="lb-rank">#${i + 4}</div>
                <div>
                  <a href="#/profile/${m.uid || m.id}" class="lb-member-link" style="font-family:var(--font-heading); font-weight:600; color:var(--text); text-decoration:none; display:inline-flex; align-items:center; gap:6px;" title="View ${escapeHtml(m.displayName)}'s achievements">
                    <span>${escapeHtml(m.displayName)}</span>
                    <span style="font-size:0.75rem; color:var(--primary); opacity:0.8;">➔</span>
                  </a>
                </div>
                <div style="font-family:var(--font-heading); font-weight:bold; color:var(--primary); font-size:1.05rem;">
                  ${m.boardPoints} BP
                </div>
                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                  ${m.badges.map(b => {
                    const meta = getBadgeById(b.type || b.id);
                    const icon = meta?.icon || '🏅';
                    const label = meta?.label || 'Badge';
                    const how = meta?.howToGet || meta?.description || 'Earned achievement';
                    return `<a href="#/profile/${m.uid || m.id}" title="${escapeHtml(`${label} — How to get: ${how} (Click to view full achievements)`)}" style="font-size:1.2rem; cursor:pointer; text-decoration:none;">${icon}</a>`;
                  }).join('')}
                </div>
              </div>
            `).join('')}
            ${rest.length === 0 ? `<div style="padding: 24px; text-align:center; color:var(--text-muted); font-family:var(--font-heading);">No other members to display.</div>` : ''}
          </div>

          <div class="leaderboard-charts" style="margin-top: 40px;">
            <div style="background: var(--bg-card); border-radius: 16px; padding: 24px; box-shadow: var(--shadow-md); border: 1px solid var(--border); display: flex; flex-direction: column;">
              <h3 style="font-family: var(--font-heading); margin-bottom: 16px; color: var(--text); font-size: 1.1rem; letter-spacing: 0.5px;">Board Points Comparison</h3>
              <div class="chart-box">
                <canvas id="pointsChart" role="img" aria-label="Board points per member"></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents(groupId);

  // Initialize Bar Chart for Board Points
  setTimeout(() => {
    const pointsCtx = document.getElementById('pointsChart');
    if (pointsCtx) {
      const labels = leaderboardData.map(m => m.displayName || 'Unknown');
      const taskPoints = leaderboardData.map(m => m.boardPoints);

      const style = getComputedStyle(document.body);
      const primaryColor = style.getPropertyValue('--primary').trim() || '#4F46E5';
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
          datasets: [{
            label: 'Board Points (BP)',
            data: taskPoints,
            backgroundColor: primaryColor,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: true, grid: { color: borderColor }, ticks: { color: textSecondary } },
            x: { grid: { display: false }, ticks: { color: textSecondary } }
          }
        }
      });
    }
  }, 0);
}

// ── Per-card "Syncing… / Saved ✓" indicator (E2b) ─────────────────────────────
// The review is saved locally first; the sync engine uploads it in the
// background and announces each upload with a window event.
const SYNC_LABELS = {
  syncing:  { text: '⟳ Syncing…', color: 'var(--text-muted)' },
  offline:  { text: '○ Saved on this device, will sync when online', color: 'var(--text-muted)' },
  saved:    { text: 'Saved ✓', color: '#22c55e' },
  rejected: { text: '✕ Not saved to the server. Please submit again.', color: 'var(--danger, #ef4444)' },
};

function setEvalSyncStatus(reviewId, state) {
  if (!reviewId) return;
  const el = document.querySelector(`.eval-sync-status[data-review-id="${reviewId}"]`);
  const cfg = SYNC_LABELS[state];
  if (!el || !cfg) return;
  el.textContent = cfg.text;
  el.style.color = cfg.color;
}

let evalSyncListenersBound = false;
function bindEvalSyncListeners() {
  if (evalSyncListenersBound) return;
  evalSyncListenersBound = true;
  window.addEventListener('sync-flushed', (e) => {
    if (e.detail?.collection === 'peerReviews') setEvalSyncStatus(e.detail.docId, 'saved');
  });
  window.addEventListener('sync-rejected', (e) => {
    if (e.detail?.collection === 'peerReviews') setEvalSyncStatus(e.detail.docId, 'rejected');
  });
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

  // profileMap for avatars in eval cards
  const evalProfiles = await getAll(STORES.USER_PROFILES);
  const profileMap = {};
  (evalProfiles || []).forEach(p => { profileMap[p.uid] = p; });

  const myReviews = peerReviews.filter(pr => 
    pr.reviewerId === me?.id || 
    pr.reviewerId === user?.uid || 
    pr.reviewerUid === user?.uid ||
    pr.reviewerMemberId === me?.id
  );
  const queuedReviewIds = new Set(
    (await getSyncQueue()).filter(q => q.collection === 'peerReviews').map(q => q.docId)
  );

  app.innerHTML = `
    <div class="app-layout">
      ${sidebarHTML(groupId, 'evaluate', members, tasks)}
      <div class="main-content">
        <header class="board-header">
          <div class="board-header-left">
            <h1 class="board-title">${ICONS.star} Peer evaluation</h1>
          </div>
        </header>
        
        <div class="leaderboard-container">
          <p style="color:var(--text-secondary); margin-bottom: 24px;">Rate your teammates' contributions. Your ratings are private: teammates never see the individual ratings you give.</p>

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
                    <div class="avatar" style="overflow:hidden;">
                      ${(() => { const pr=profileMap[m.uid]; return pr?.avatarType==='custom'&&pr?.avatar ? `<img src="${pr.avatar}" alt="${escapeHtml(m.displayName?.[0]||'?')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : escapeHtml(m.displayName?.[0]||'?'); })()}
                    </div>
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
                
                ${existingReview ? `
                  <div style="display:flex; align-items:center; gap:8px; margin: 8px 0 14px 0; padding:8px 12px; border-radius:8px; background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.25);">
                    <span style="font-size:1rem;">✓</span>
                    <span style="font-size:0.82rem; color:#4ade80; font-weight:600;">You rated this teammate <strong style="color:#86efac;">${score}/5</strong> — you can update it below.</span>
                  </div>` : ''}

                <form class="eval-form" data-evaluatee-id="${m.id}">

                  <!-- ★ Star picker -->
                  <div class="form-group" style="margin-bottom:18px;">
                    <label style="font-size:0.72rem; font-weight:700; letter-spacing:0.08em; color:var(--text-muted); text-transform:uppercase; font-family:var(--font-heading); display:block; margin-bottom:10px;">Rating</label>
                    <div class="star-picker" data-name="score_${m.id}" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                      ${[1,2,3,4,5].map(star => `
                        <label class="star-btn" title="${star} star${star>1?'s':''}" style="
                          cursor:pointer; display:flex; align-items:center; justify-content:center;
                          width:44px; height:44px; border-radius:10px; font-size:1.5rem;
                          border:2px solid ${score >= star ? 'var(--primary)' : 'var(--border)'};
                          background:${score >= star ? 'rgba(99,102,241,0.18)' : 'var(--bg-input)'};
                          transition:all 0.15s ease; position:relative;
                          box-shadow:${score >= star ? '0 0 8px rgba(99,102,241,0.3)' : 'none'};
                        ">
                          <input type="radio" name="score_${m.id}" value="${star}" ${score === star ? 'checked' : ''} required
                            style="position:absolute;opacity:0;width:0;height:0;" />
                          <span style="pointer-events:none; filter:${score >= star ? 'none' : 'grayscale(1) opacity(0.35)'}; transition:filter 0.15s;">★</span>
                        </label>
                      `).join('')}
                      <span class="star-label" style="margin-left:10px; font-size:0.85rem; font-weight:700; color:var(--text-muted); font-family:var(--font-heading); min-width:60px;">
                        ${score > 0 ? `${score} / 5` : 'No rating'}
                      </span>
                    </div>
                  </div>

                  <!-- Feedback -->
                  <div class="form-group" style="margin-bottom:16px;">
                    <label style="font-size:0.72rem; font-weight:700; letter-spacing:0.08em; color:var(--text-muted); text-transform:uppercase; font-family:var(--font-heading); display:block; margin-bottom:8px;">Feedback <span style="font-weight:400; text-transform:none; letter-spacing:0;">(private — only you and admins can see this)</span></label>
                    <textarea name="comment_${m.id}" rows="3"
                      placeholder="Share private feedback for your teammate…"
                      style="width:100%; border-radius:10px; border:1.5px solid var(--border); padding:10px 12px; background:var(--bg-input); color:var(--text); box-sizing:border-box; font-size:0.9rem; resize:vertical; transition:border-color 0.15s;"
                      onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'"
                    >${existingReview?.comment || ''}</textarea>
                  </div>

                  <div style="display:flex; justify-content:flex-end; align-items:center; gap:12px;">
                    <span class="eval-sync-status" data-review-id="${existingReview?.id || ''}" style="font-size:0.75rem; color:var(--text-muted);">${existingReview && queuedReviewIds.has(existingReview.id) ? SYNC_LABELS.syncing.text : ''}</span>
                    <button type="submit" class="btn ${existingReview ? 'btn-secondary' : 'btn-primary'} btn-sm" style="font-weight:700; padding:8px 20px; border-radius:8px;">
                      ${existingReview ? '✓ Update Evaluation' : '⭐ Submit Evaluation'}
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

  bindEvalSyncListeners();

  // ★ Interactive star picker — hover preview + click to select
  document.querySelectorAll('.star-picker').forEach(picker => {
    const btns  = Array.from(picker.querySelectorAll('.star-btn'));
    const label = picker.querySelector('.star-label');
    const descriptions = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

    const paint = (upTo, active) => {
      btns.forEach((btn, i) => {
        const filled = i < upTo;
        btn.style.borderColor    = filled ? 'var(--primary)' : 'var(--border)';
        btn.style.background     = filled ? 'rgba(99,102,241,0.18)' : 'var(--bg-input)';
        btn.style.boxShadow      = filled ? '0 0 8px rgba(99,102,241,0.3)' : 'none';
        btn.style.transform      = (active && filled) ? 'scale(1.08)' : 'scale(1)';
        const star = btn.querySelector('span');
        if (star) star.style.filter = filled ? 'none' : 'grayscale(1) opacity(0.35)';
      });
    };

    // Hover preview
    btns.forEach((btn, i) => {
      btn.addEventListener('mouseenter', () => {
        paint(i + 1, false);
        if (label) label.textContent = `${i + 1} / 5 — ${descriptions[i + 1]}`;
      });
      btn.addEventListener('mouseleave', () => {
        const checked = picker.querySelector('input[type="radio"]:checked');
        const val = checked ? parseInt(checked.value) : 0;
        paint(val, true);
        if (label) label.textContent = val > 0 ? `${val} / 5 — ${descriptions[val]}` : 'No rating';
      });
      btn.addEventListener('click', () => {
        const radio = btn.querySelector('input[type="radio"]');
        if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
        paint(i + 1, true);
        if (label) label.textContent = `${i + 1} / 5 — ${descriptions[i + 1]}`;
      });
    });

    // Init paint for existing rating
    const checked = picker.querySelector('input[type="radio"]:checked');
    if (checked) paint(parseInt(checked.value), true);
  });

  // E2b: submitting only writes the review locally and queues it (two quick
  // IndexedDB writes), then shows the result. The upload runs in the background.
  const inFlight = new Set();

  document.querySelectorAll('.eval-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const evaluateeId = form.dataset.evaluateeId;
      if (inFlight.has(evaluateeId)) return;  // ignore double submits

      const evaluatee = members.find(m => m.id === evaluateeId);
      const scoreInput = form.querySelector(`input[name="score_${evaluateeId}"]:checked`);
      if (!scoreInput) {
        showToast('Please select a star rating first.', { type: 'error' });
        return;
      }
      const score = parseInt(scoreInput.value);
      const comment = form.querySelector(`textarea[name="comment_${evaluateeId}"]`)?.value || '';
      const submitBtn = form.querySelector('button[type="submit"]');

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

      inFlight.add(evaluateeId);
      const previousLabel = submitBtn?.textContent;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';
      }

      try {
        await put(STORES.PEER_REVIEWS, review);
        await addToSyncQueue({ collection: 'peerReviews', docId: reviewId, operation: 'update', data: review });
      } catch (err) {
        console.error('[Evaluation] Could not save review:', err);
        showToast('Could not save your evaluation. Please try again.', { type: 'error' });
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = previousLabel;
        }
        inFlight.delete(evaluateeId);
        return;
      }

      // E2a: nothing else happens on submit. A reviewer's device only holds the
      // reviews they wrote, so any "average" here would be their own rating, and
      // events, reputation, member records and notifications are visible to (or
      // sent to) the evaluatee. The consent form promises individual ratings are
      // never shown to groupmates, so a rating must not change anything they see.

      // Keep the in-closure myReviews in sync so later submits use the update path.
      const existingIdx = myReviews.findIndex(r =>
        r.evaluateeId === evaluateeId || r.evaluateeUid === evaluatee?.uid
      );
      if (existingIdx >= 0) myReviews[existingIdx] = review;
      else myReviews.push(review);

      // Patch only the submitted card in-place - preserving other cards' unsaved star ratings.
      // A full renderEvaluation() would destroy the entire page DOM, losing any ratings the
      // user has selected but not yet submitted on other teammate cards.
      const submittedCard = form.closest('.eval-card');
      if (submittedCard) {
        // Swap the 'PENDING RATING' pill for the 'EVALUATION SUBMITTED' badge
        const headerRight = submittedCard.querySelector('.eval-card-header > div:last-child');
        if (headerRight) {
          headerRight.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="background:rgba(34,197,94,0.2); color:#22c55e; border:1px solid rgba(34,197,94,0.4); font-size:0.75rem; font-weight:700; padding:4px 10px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; font-family:var(--font-heading);">
                ✓ EVALUATION SUBMITTED
              </span>
              <div class="eval-pe-score" style="color:var(--primary); font-weight:700;">Rated: ${score}/5 ⭐</div>
            </div>`;
        }

        // Apply submitted card green styling
        submittedCard.style.borderColor = 'rgba(34,197,94,0.45)';
        submittedCard.style.background = 'linear-gradient(to bottom, rgba(34,197,94,0.06), transparent)';

        // Insert or refresh the 'already evaluated' note just above the form
        let alreadyNote = submittedCard.querySelector('.eval-already-note');
        if (!alreadyNote) {
          alreadyNote = document.createElement('div');
          alreadyNote.className = 'eval-already-note';
          submittedCard.insertBefore(alreadyNote, form);
        }
        alreadyNote.style.cssText = 'font-size:0.82rem; color:#22c55e; margin:8px 0 12px 0; font-weight:600; display:flex; align-items:center; gap:6px;';
        alreadyNote.textContent = `✓ You evaluated this teammate (${score}/5 ⭐). You can modify your rating or feedback below:`;

        // Background upload status for this review
        const syncStatus = form.querySelector('.eval-sync-status');
        if (syncStatus) syncStatus.dataset.reviewId = reviewId;
        setEvalSyncStatus(reviewId, navigator.onLine ? 'syncing' : 'offline');
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '✓ Update Evaluation';
        submitBtn.className = 'btn btn-secondary btn-sm';
        submitBtn.style.fontWeight = '700';
      }
      inFlight.delete(evaluateeId);

      showToast(`Evaluation for ${evaluatee?.displayName || 'teammate'} submitted! ⭐`, { type: 'success' });
    });
  });
}

