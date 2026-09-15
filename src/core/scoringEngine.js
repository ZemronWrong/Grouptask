/**
 * Contribution scoring and free-rider detection — pure functions, no DOM / network deps.
 */

/**
 * CS = (Σ weighted-completed-tasks / Σ total-assigned-weight) × 100
 *
 * @param {Array<{assignedTo:string, status:string, weight:number}>} tasks
 * @param {string} memberId
 * @returns {{ score:number, completedWeight:number, totalWeight:number,
 *             completedCount:number, totalCount:number }}
 */
export function calculateContributionScore(tasks, memberId) {
  const empty = { score: 0, completedWeight: 0, totalWeight: 0, completedCount: 0, totalCount: 0 };

  if (!Array.isArray(tasks) || !memberId) return empty;

  const assigned = tasks.filter((t) => t.assignedTo === memberId);
  if (assigned.length === 0) return empty;

  const totalWeight     = assigned.reduce((s, t) => s + (Number(t.weight) || 0), 0);
  const completed       = assigned.filter((t) => t.status === 'done');
  const completedWeight = completed.reduce((s, t) => s + (Number(t.weight) || 0), 0);

  const score = totalWeight === 0 ? 0 : Math.round((completedWeight / totalWeight) * 100 * 100) / 100;

  return { score, completedWeight, totalWeight, completedCount: completed.length, totalCount: assigned.length };
}

/**
 * Batch-calculate CS for every member in a group.
 *
 * @param {Array} tasks
 * @param {string[]} memberIds
 * @returns {Record<string, ReturnType<calculateContributionScore>>}
 */
export function calculateAllContributionScores(tasks, memberIds) {
  const out = {};
  for (const id of memberIds) out[id] = calculateContributionScore(tasks, id);
  return out;
}

/**
 * Free-Rider Detection — pure functions, no DOM / network deps.
 *
 * Detects free-riding behaviour by analysing:
 *   1. Contribution score relative to group average
 *   2. Inactivity (days since last task completion)
 *   3. Task acceptance pattern (no in-progress tasks for extended period)
 *
 * Risk levels: 'none' | 'low' | 'medium' | 'high'
 */

const INACTIVITY_THRESHOLD_DAYS = 7;
const LOW_CS_THRESHOLD = 20;
const GROUP_AVG_MIN = 50;

/**
 * Calculate days since a member last completed a task.
 *
 * @param {Array<{assignedTo:string, status:string, completedAt?:number}>} tasks
 * @param {string} memberId
 * @returns {number} days since last completion, or Infinity if never completed
 */
export function daysSinceLastCompletion(tasks, memberId) {
  if (!Array.isArray(tasks) || !memberId) return Infinity;

  const completed = tasks
    .filter((t) => t.assignedTo === memberId && t.status === 'done' && t.completedAt)
    .map((t) => t.completedAt);

  if (completed.length === 0) return Infinity;

  const latest = Math.max(...completed);
  const diffMs = Date.now() - latest;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Check if a member has zero in-progress or assigned tasks.
 *
 * @param {Array} tasks
 * @param {string} memberId
 * @returns {boolean}
 */
export function hasNoActiveTasks(tasks, memberId) {
  if (!Array.isArray(tasks) || !memberId) return true;
  return !tasks.some(
    (t) => t.assignedTo === memberId && (t.status === 'in-progress' || t.status === 'todo')
  );
}

/**
 * Detect free-rider risk for a single member.
 *
 * @param {object} params
 * @param {Array} params.tasks — all group tasks
 * @param {string} params.memberId
 * @param {number} params.memberCS — member's contribution score (0-100)
 * @param {number} params.groupAvgCS — group average CS
 * @param {number} params.memberJoinedAt — timestamp when member joined
 * @returns {{ risk: 'none'|'low'|'medium'|'high', reasons: string[] }}
 */
export function detectFreeRider({ tasks, memberId, memberCS, groupAvgCS, memberJoinedAt }) {
  const reasons = [];
  let score = 0; // 0-3 severity points

  // Factor 1: Low CS while group average is decent
  if (memberCS < LOW_CS_THRESHOLD && groupAvgCS >= GROUP_AVG_MIN) {
    reasons.push(`Contribution score (${memberCS}%) far below group average (${groupAvgCS}%)`);
    score += 2;
  } else if (memberCS < LOW_CS_THRESHOLD) {
    reasons.push(`Very low contribution score (${memberCS}%)`);
    score += 1;
  }

  // Factor 2: Inactivity
  const daysMemberActive = Math.floor((Date.now() - (memberJoinedAt || Date.now())) / (1000 * 60 * 60 * 24));
  if (daysMemberActive >= 3) { // Only check after 3 days of membership
    const inactiveDays = daysSinceLastCompletion(tasks, memberId);
    if (inactiveDays >= INACTIVITY_THRESHOLD_DAYS * 2) {
      reasons.push(`Inactive for ${inactiveDays === Infinity ? '∞' : inactiveDays} days`);
      score += 2;
    } else if (inactiveDays >= INACTIVITY_THRESHOLD_DAYS) {
      reasons.push(`Inactive for ${inactiveDays} days`);
      score += 1;
    }
  }

  // Factor 3: No active tasks
  if (hasNoActiveTasks(tasks, memberId)) {
    const assignedCount = tasks.filter((t) => t.assignedTo === memberId).length;
    if (assignedCount === 0 && daysMemberActive >= 3) {
      reasons.push('Has never accepted any tasks');
      score += 2;
    } else if (assignedCount > 0) {
      reasons.push('No currently active tasks');
      score += 1;
    }
  }

  let risk = 'none';
  if (score >= 5) risk = 'high';
  else if (score >= 3) risk = 'medium';
  else if (score >= 1) risk = 'low';

  return { risk, reasons };
}

/**
 * Batch free-rider detection for all members in a group.
 *
 * @param {Array} tasks — all group tasks
 * @param {Array<{id:string, joinedAt?:number}>} members
 * @param {Record<string, {score:number}>} csMap — contribution scores
 * @returns {Record<string, {risk:string, reasons:string[]}>}
 */
export function detectAllFreeRiders(tasks, members, csMap) {
  const scores = Object.values(csMap).map((c) => c.score);
  const groupAvgCS = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const result = {};
  for (const m of members) {
    const memberCS = csMap[m.id]?.score ?? 0;
    result[m.id] = detectFreeRider({
      tasks,
      memberId: m.id,
      memberCS,
      groupAvgCS,
      memberJoinedAt: m.joinedAt,
    });
  }
  return result;
}
