/**
 * Scoring and Free-Rider Detection Engine
 *
 * Provides pure mathematical models for quantitative student contribution tracking
 * and automated heuristic detection of non-contributing team members ("free-riders").
 * Designed without DOM or network dependencies to allow isolated testing and reproducible evaluation.
 */

/**
 * Calculates the individual Contribution Score (CS) for a team member based on task weight completion.
 *
 * Mathematical formulation:
 *   CS_i = ( \sum_{t \in T_i^{\text{done}}} w_t / \sum_{t \in T_i^{\text{assigned}}} w_t ) \times 100
 *
 * Rationale:
 * Simple task counts unfairly reward trivial subtasks. Weight-based normalization ensures that
 * effort-intensive deliverables dictate contribution proportion. If no tasks are assigned or total
 * weight is zero, CS defaults to 0% to prevent division-by-zero artifacts.
 *
 * @param {Array<{assignedTo:string, status:string, weight:number}>} tasks - All project tasks.
 * @param {string} memberId - Target team member ID.
 * @returns {{
 *   score: number,
 *   completedWeight: number,
 *   totalWeight: number,
 *   completedCount: number,
 *   totalCount: number
 * }} Detailed contribution metrics.
 */
export function calculateContributionScore(tasks, memberId) {
  const emptyResult = { score: 0, completedWeight: 0, totalWeight: 0, completedCount: 0, totalCount: 0 };

  if (!Array.isArray(tasks) || !memberId) return emptyResult;

  const assigned = tasks.filter((t) => t.assignedTo === memberId);
  if (assigned.length === 0) return emptyResult;

  const totalWeight = assigned.reduce((sum, t) => sum + (Number(t.weight) || 0), 0);
  const completed = assigned.filter((t) => t.status === 'done');
  const completedWeight = completed.reduce((sum, t) => sum + (Number(t.weight) || 0), 0);

  const score = totalWeight === 0 ? 0 : Math.round((completedWeight / totalWeight) * 10000) / 100;

  return {
    score,
    completedWeight,
    totalWeight,
    completedCount: completed.length,
    totalCount: assigned.length,
  };
}

/**
 * Computes Contribution Scores in batch across all group members.
 *
 * @param {Array} tasks - All group tasks.
 * @param {string[]} memberIds - Array of member identifiers to evaluate.
 * @returns {Record<string, ReturnType<typeof calculateContributionScore>>} Map of memberId to contribution score details.
 */
export function calculateAllContributionScores(tasks, memberIds) {
  const scores = {};
  for (const id of memberIds) {
    scores[id] = calculateContributionScore(tasks, id);
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

