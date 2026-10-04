/**
 * Scoring and Free-Rider Detection Engine
 *
 * Provides pure mathematical models for quantitative student contribution tracking
 * and automated heuristic detection of non-contributing team members ("free-riders").
 * Designed without DOM or network dependencies to allow isolated testing and reproducible evaluation.
 */

/**
 * Calculates the individual Weighted Proportional Share (WPS) for a team member.
 *
 * This replaces the previous completion-rate formula which measured efficiency
 * (done/assigned) rather than contribution (my share / total group output).
 *
 * New mathematical formulation:
 *
 *   WPS_i = ( Σ w_t  for t ∈ done tasks of member i )
 *           ─────────────────────────────────────────  × 100
 *           ( Σ w_t  for ALL done tasks in the group  )
 *
 * Rationale:
 *  - A member with 1 easy done task can no longer outscore someone who
 *    completed most of the group's work.
 *  - A member with 0 assigned tasks returns 0 (no divide-by-zero).
 *  - When no tasks are done by anyone, all scores are 0 (avoids NaN).
 *
 * @param {Array<{assignedTo:string, status:string, weight:number}>} allGroupTasks - ALL tasks in the group.
 * @param {string} memberId - Target team member ID (member record ID, not UID).
 * @returns {{
 *   score: number,         — WPS as a percentage [0–100]
 *   completedWeight: number, — sum of done-task weights for this member
 *   groupDoneWeight: number, — sum of done-task weights across the entire group
 *   completedCount: number,
 *   totalCount: number
 * }}
 */
export function calculateContributionScore(allGroupTasks, memberId) {
  const emptyResult = { score: 0, completedWeight: 0, groupDoneWeight: 0, completedCount: 0, totalCount: 0 };

  if (!Array.isArray(allGroupTasks) || !memberId) return emptyResult;

  // All done tasks across the entire group (denominator)
  const allDone       = allGroupTasks.filter((t) => t.status === 'done');
  const groupDoneWeight = allDone.reduce((sum, t) => sum + (Number(t.weight) || 0), 0);

  // This member's done tasks (numerator)
  const myDone          = allDone.filter((t) => t.assignedTo === memberId);
  const completedWeight = myDone.reduce((sum, t) => sum + (Number(t.weight) || 0), 0);

  // Total tasks assigned to this member (for informational output only)
  const assigned = allGroupTasks.filter((t) => t.assignedTo === memberId);

  // Guard: if nothing is done group-wide, every score is 0
  const score = groupDoneWeight === 0 ? 0 : Math.round((completedWeight / groupDoneWeight) * 10000) / 100;

  return {
    score,
    completedWeight,
    groupDoneWeight,
    completedCount: myDone.length,
    totalCount: assigned.length,
  };
}

/**
 * Computes Weighted Proportional Share scores in batch across all group members.
 *
 * All members receive the same `allGroupTasks` array so that each score
 * is calculated relative to the same group-wide denominator.
 *
 * @param {Array} allGroupTasks - All tasks in the group.
 * @param {string[]} memberIds  - Member IDs to evaluate.
 * @returns {Record<string, ReturnType<typeof calculateContributionScore>>}
 */
export function calculateAllContributionScores(allGroupTasks, memberIds) {
  const scores = {};
  for (const id of memberIds) {
    scores[id] = calculateContributionScore(allGroupTasks, id);
  }
  return scores;
}

/**
 * Heuristic threshold configuration for identifying disengagement patterns.
 * 7 days represents a typical academic sprint iteration.
 */
const INACTIVITY_THRESHOLD_DAYS = 7;
const LOW_CS_THRESHOLD = 20;
const GROUP_AVG_BENCHMARK = 50;
const ONBOARDING_GRACE_PERIOD_DAYS = 3;

/**
 * Computes calendar days elapsed since a member's most recent task completion.
 * Used to differentiate between consistent contributors and sudden drop-offs.
 *
 * @param {Array<{assignedTo:string, status:string, completedAt?:number}>} tasks
 * @param {string} memberId
 * @returns {number} Elapsed days since last completion, or Infinity if no tasks were ever completed.
 */
export function daysSinceLastCompletion(tasks, memberId) {
  if (!Array.isArray(tasks) || !memberId) return Infinity;

  const completionTimestamps = tasks
    .filter((t) => t.assignedTo === memberId && t.status === 'done' && t.completedAt)
    .map((t) => t.completedAt);

  if (completionTimestamps.length === 0) return Infinity;

  const latest = Math.max(...completionTimestamps);
  const diffMs = Date.now() - latest;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Determines whether a member currently holds any ongoing work commitments.
 *
 * @param {Array} tasks
 * @param {string} memberId
 * @returns {boolean} True if the member has neither 'in-progress' nor 'todo' tasks.
 */
export function hasNoActiveTasks(tasks, memberId) {
  if (!Array.isArray(tasks) || !memberId) return true;
  return !tasks.some(
    (t) => t.assignedTo === memberId && (t.status === 'in-progress' || t.status === 'todo')
  );
}

/**
 * Multi-factor heuristic classifier for assessing free-riding risk.
 *
 * Factors evaluated:
 * 1. Contribution Disparity: CS significantly lower than the peer group average.
 * 2. Prolonged Inactivity: Extended gaps since last task completion relative to sprint cycle.
 * 3. Work Avoidance: Refusal or failure to claim/accept active tasks after initial onboarding.
 *
 * Note: A 3-day grace period is enforced from join date to prevent false positives during team formation.
 *
 * @param {object} params
 * @param {Array} params.tasks - Full project task set.
 * @param {string} params.memberId - Target member ID.
 * @param {number} params.memberCS - Calculated contribution score (0-100).
 * @param {number} params.groupAvgCS - Overall group average contribution score.
 * @param {number} [params.memberJoinedAt] - Epoch timestamp when the member joined the team.
 * @returns {{ risk: 'none'|'low'|'medium'|'high', reasons: string[] }}
 */
export function detectFreeRider({ tasks, memberId, memberCS, groupAvgCS, memberJoinedAt }) {
  const reasons = [];
  let severityScore = 0;

  // Factor 1: Divergence from team baseline
  if (memberCS < LOW_CS_THRESHOLD && groupAvgCS >= GROUP_AVG_BENCHMARK) {
    reasons.push(`Contribution score (${memberCS}%) is critically below team average (${groupAvgCS}%)`);
    severityScore += 2;
  } else if (memberCS < LOW_CS_THRESHOLD) {
    reasons.push(`Low overall completion rate (${memberCS}%)`);
    severityScore += 1;
  }

  // Factor 2: Temporal dormancy (exempt new joiners during grace window)
  const daysActive = Math.floor((Date.now() - (memberJoinedAt || Date.now())) / (1000 * 60 * 60 * 24));
  if (daysActive >= ONBOARDING_GRACE_PERIOD_DAYS) {
    const inactiveDays = daysSinceLastCompletion(tasks, memberId);
    if (inactiveDays >= INACTIVITY_THRESHOLD_DAYS * 2) {
      reasons.push(`No deliverable completed in over ${inactiveDays === Infinity ? '∞' : inactiveDays} days`);
      severityScore += 2;
    } else if (inactiveDays >= INACTIVITY_THRESHOLD_DAYS) {
      reasons.push(`Inactive for ${inactiveDays} days (exceeds sprint iteration threshold)`);
      severityScore += 1;
    }
  }

  // Factor 3: Absence of assigned active deliverables
  if (hasNoActiveTasks(tasks, memberId)) {
    const assignedCount = tasks.filter((t) => t.assignedTo === memberId).length;
    if (assignedCount === 0 && daysActive >= ONBOARDING_GRACE_PERIOD_DAYS) {
      reasons.push('Has not claimed or accepted any tasks since joining');
      severityScore += 2;
    } else if (assignedCount > 0) {
      reasons.push('Currently holds no active tasks in progress');
      severityScore += 1;
    }
  }

  let risk = 'none';
  if (severityScore >= 5) risk = 'high';
  else if (severityScore >= 3) risk = 'medium';
  else if (severityScore >= 1) risk = 'low';

  return { risk, reasons };
}

/**
 * Batch analysis of free-rider indicators across an entire team cohort.
 *
 * @param {Array} tasks - Full task list.
 * @param {Array<{id:string, joinedAt?:number}>} members - Team member records.
 * @param {Record<string, {score:number}>} csMap - Pre-calculated contribution scores.
 * @returns {Record<string, {risk:string, reasons:string[]}>}
 */
export function detectAllFreeRiders(tasks, members, csMap) {
  const scoreValues = Object.values(csMap).map((c) => c.score);
  const groupAvgCS = scoreValues.length > 0
    ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
    : 0;

  const evaluations = {};
  for (const member of members) {
    const memberCS = csMap[member.id]?.score ?? 0;
    evaluations[member.id] = detectFreeRider({
      tasks,
      memberId: member.id,
      memberCS,
      groupAvgCS,
      memberJoinedAt: member.joinedAt,
    });
  }
  return evaluations;
}

