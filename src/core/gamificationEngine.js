/**
 * Gamification Engine
 *
 * Implements behavioral incentive mechanisms (experience points, leveling progression,
 * consecutive completion streaks, and milestone achievements) designed to foster student
 * accountability and sustained engagement throughout academic project lifecycles.
 */

import { ICONS } from '../assets/icons/icons.js';

/* ── XP Level Progression System ── */

/**
 * 20-tier level progression table calibrated for multi-week academic projects.
 * Thresholds grow exponentially to reward persistent high-weight contributions.
 */
const LEVEL_THRESHOLDS = [
  { level:  1, xp:     0,    title: 'Apprentice' },
  { level:  2, xp:   500,    title: 'Initiate' },
  { level:  3, xp:  1200,    title: 'Novice' },
  { level:  4, xp:  2000,    title: 'Journeyman' },
  { level:  5, xp:  3500,    title: 'Adept' },
  { level:  6, xp:  5000,    title: 'Veteran' },
  { level:  7, xp:  7500,    title: 'Expert' },
  { level:  8, xp: 10000,    title: 'Elite' },
  { level:  9, xp: 14000,    title: 'Champion' },
  { level: 10, xp: 18000,    title: 'Master' },
  { level: 11, xp: 23000,    title: 'Grandmaster' },
  { level: 12, xp: 30000,    title: 'Hero' },
  { level: 13, xp: 38000,    title: 'Legend' },
  { level: 14, xp: 48000,    title: 'Mythic' },
  { level: 15, xp: 60000,    title: 'Ascendant' },
  { level: 16, xp: 75000,    title: 'Paragon' },
  { level: 17, xp: 95000,    title: 'Transcendent' },
  { level: 18, xp: 120000,   title: 'Immortal' },
  { level: 19, xp: 150000,   title: 'Demigod' },
  { level: 20, xp: 200000,   title: 'Guild Overlord' },
];

export { LEVEL_THRESHOLDS };

/**
 * Maps cumulative points to the corresponding level tier and computes percentage progress to the next level.
 *
 * @param {number} points - Cumulative points earned.
 * @returns {{
 *   level: number,
 *   title: string,
 *   currentXP: number,
 *   nextLevelXP: number|null,
 *   progress: number
 * }}
 */
export function getXPLevel(points) {
  let current = LEVEL_THRESHOLDS[0];
  for (const threshold of LEVEL_THRESHOLDS) {
    if (points >= threshold.xp) current = threshold;
    else break;
  }

  const nextIdx = LEVEL_THRESHOLDS.findIndex((t) => t.level === current.level + 1);
  const next = nextIdx >= 0 ? LEVEL_THRESHOLDS[nextIdx] : null;

  const xpInLevel = points - current.xp;
  const xpNeeded = next ? next.xp - current.xp : 1;
  const progress = next ? Math.min(100, Math.round((xpInLevel / xpNeeded) * 100)) : 100;

  return {
    level: current.level,
    title: current.title,
    currentXP: points,
    nextLevelXP: next?.xp ?? null,
    progress,
  };
}

/* ── Streak Tracking ── */

/**
 * Computes consecutive active days with at least one task completion.
 *
 * Streak Invariants:
 * - Aggregates events into calendar day buckets (YYYY-MM-DD) to prevent multiple completions in a single day
 *   from inflating streak length.
 * - Allows a 1-day grace window from the current date so active streaks are not prematurely terminated
 *   before the current day concludes.
 *
 * @param {Array<{assignedTo:string, status:string, completedAt?:number}>} tasks
 * @param {string} memberId
 * @returns {{ currentStreak:number, longestStreak:number }}
 */
export function calculateStreak(tasks, memberId) {
  if (!Array.isArray(tasks) || !memberId) return { currentStreak: 0, longestStreak: 0 };

  const completedDates = tasks
    .filter((t) => t.assignedTo === memberId && t.status === 'done' && t.completedAt)
    .map((t) => {
      const d = new Date(t.completedAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

  const uniqueDays = [...new Set(completedDates)].sort();
  if (uniqueDays.length === 0) return { currentStreak: 0, longestStreak: 0 };

  let longestStreak = 1;
  let runningStreak = 1;

  for (let i = 1; i < uniqueDays.length; i++) {
    const prevDate = new Date(uniqueDays[i - 1]);
    const currDate = new Date(uniqueDays[i]);
    const diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      runningStreak++;
      if (runningStreak > longestStreak) longestStreak = runningStreak;
    } else {
      runningStreak = 1;
    }
  }

  // Active streak verification: last completion must be today or yesterday
  const lastActiveDay = new Date(uniqueDays[uniqueDays.length - 1]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysSinceLastActive = Math.round((today - lastActiveDay) / (1000 * 60 * 60 * 24));

  const currentStreak = daysSinceLastActive <= 1 ? runningStreak : 0;

  return { currentStreak, longestStreak };
}

/* ── Points & Leaderboard Calculation ── */

/**
 * Calculates raw reward points for completed tasks.
 * Formula: Points = \sum (weight \times 10).
 *
 * Scaling by 10 maps standard task weights (1-10) onto a gamified integer scale suitable for XP milestones.
 *
 * @param {Array<{assignedTo:string, status:string, weight:number}>} tasks
 * @param {string} memberId
 * @returns {number} Total accumulated points.
 */
export function calculatePoints(tasks, memberId) {
  if (!Array.isArray(tasks) || !memberId) return 0;
  return tasks
    .filter((t) => t.assignedTo === memberId && t.status === 'done')
    .reduce((sum, t) => sum + (Number(t.weight) || 0) * 10, 0);
}

/**
 * Constructs a competitive leaderboard ranked by total points, decorated with XP titles.
 *
 * @param {Array} tasks - Group task set.
 * @param {string[]} memberIds - Group member IDs.
 * @param {Record<string, string>} [nameMap] - Mapping of memberId to student display name.
 * @returns {Array<{
 *   memberId: string,
 *   displayName: string,
 *   points: number,
 *   rank: number,
 *   level: number,
 *   title: string,
 *   xpProgress: number
 * }>}
 */

export function buildLeaderboard(tasks, memberIds, nameMap = {}) {
  const board = memberIds.map((id) => {
    const points = calculatePoints(tasks, id);
    const xp = getXPLevel(points);
    return {
      memberId: id,
      displayName: nameMap[id] || id,
      points,
      level: xp.level,
      title: xp.title,
      xpProgress: xp.progress,
    };
  });
  board.sort((a, b) => b.points - a.points);
  board.forEach((entry, i) => { entry.rank = i + 1; });
  return board;
}

/**
 * Milestone achievement badge definitions.
 * Each badge corresponds to a specific behavioral goal (volume, high-complexity deliverables,
 * speed, consistency, or peer collaboration).
 */
export const BADGE_TYPES = {
  FIRST_TASK:       { id: 'first_task',       label: 'First Blood',       icon: ICONS.star,      description: 'Completed your first task'                },
  FIVE_TASKS:       { id: 'five_tasks',        label: 'On a Roll',         icon: ICONS.trending,  description: 'Completed 5 tasks'                        },
  TEN_TASKS:        { id: 'ten_tasks',         label: 'Workhorse',         icon: ICONS.clipboard, description: 'Completed 10 tasks'                       },
  TWENTY_TASKS:     { id: 'twenty_tasks',      label: 'Task Machine',      icon: ICONS.checkAll,  description: 'Completed 20 tasks'                       },
  HIGH_WEIGHT:      { id: 'high_weight',       label: 'Heavy Lifter',      icon: ICONS.alert,     description: 'Completed a task with weight ≥ 8'         },
  SPEED_DEMON:      { id: 'speed_demon',       label: 'Speed Demon',       icon: ICONS.todo,      description: 'Completed a task before its deadline'      },
  STREAK_MASTER:    { id: 'streak_master',     label: 'Streak Master',     icon: ICONS.shield,    description: 'Maintained a 7-day streak'                },
  PERFECTIONIST:    { id: 'perfectionist',     label: 'Perfectionist',     icon: ICONS.done,      description: 'All proofs approved on first submission'   },
  MOST_IMPROVED:    { id: 'most_improved',     label: 'Most Improved',     icon: ICONS.trending,  description: 'Biggest contribution score jump this week' },
  TOP_CONTRIBUTOR:  { id: 'top_contributor',   label: 'Top Contributor',   icon: ICONS.trophy,    description: 'Highest total points in the group'         },
  TEAM_COMMUNICATOR:{ id: 'social_butterfly',  label: 'Team Communicator', icon: ICONS.message,   description: 'Actively communicated on tasks'           },
  NIGHT_OWL:        { id: 'night_owl',         label: 'Night Owl',         icon: ICONS.bell,      description: 'Completed a task between 11PM – 4AM'      },
  EARLY_BIRD:       { id: 'early_bird',        label: 'Early Bird',        icon: ICONS.star,      description: 'Completed a task before 7AM'              },
  LEADER:           { id: 'leader',            label: 'Group Leader',      icon: ICONS.users,     description: 'Created and led a group'                  },
};

/**
 * Evaluates completion records and returns badges earned during the current state transition.
 * Only returns newly unlocked badges (badges not already present in existingBadgeIds).
 *
 * @param {Array} tasks - All group tasks.
 * @param {string} memberId - Target member ID.
 * @param {string[]} [existingBadgeIds] - IDs of badges previously awarded to this member.
 * @param {object} [extra] - Contextual metadata.
 * @param {number} [extra.currentStreak] - Length of active streak in days.
 * @param {Array} [extra.proofs] - Verification proof submissions.
 * @returns {Array<{id:string, label:string, icon:string, description:string}>} Array of newly earned badge objects.
 */
export function evaluateBadges(tasks, memberId, existingBadgeIds = [], extra = {}) {
  if (!Array.isArray(tasks) || !memberId) return [];

  const completed = tasks.filter((t) => t.assignedTo === memberId && t.status === 'done');
  const newBadges = [];


  function award(badge) {
    if (!existingBadgeIds.includes(badge.id)) newBadges.push(badge);
  }

  if (completed.length >= 1)  award(BADGE_TYPES.FIRST_TASK);
  if (completed.length >= 5)  award(BADGE_TYPES.FIVE_TASKS);
  if (completed.length >= 10) award(BADGE_TYPES.TEN_TASKS);
  if (completed.length >= 20) award(BADGE_TYPES.TWENTY_TASKS);
  if (completed.some((t) => (Number(t.weight) || 0) >= 8)) award(BADGE_TYPES.HIGH_WEIGHT);

  // Speed Demon: completed before deadline
  if (completed.some((t) => t.deadline && t.completedAt && t.completedAt < new Date(t.deadline).getTime())) {
    award(BADGE_TYPES.SPEED_DEMON);
  }

  // Streak Master: 7+ day streak
  if (extra.currentStreak && extra.currentStreak >= 7) {
    award(BADGE_TYPES.STREAK_MASTER);
  }

  // Perfectionist: all proofs approved on first submission (no rejections)
  if (extra.proofs && extra.proofs.length > 0) {
    const allApprovedFirst = extra.proofs.every((p) => p.status === 'approved');
    if (allApprovedFirst && completed.length >= 3) {
      award(BADGE_TYPES.PERFECTIONIST);
    }
  }

  // Night Owl: task completed between 11PM and 4AM
  const hasNightCompletion = completed.some((t) => {
    if (!t.completedAt) return false;
    const hour = new Date(t.completedAt).getHours();
    return hour >= 23 || hour < 4;
  });
  if (hasNightCompletion) award(BADGE_TYPES.NIGHT_OWL);

  // Early Bird: task completed before 7AM
  const hasEarlyCompletion = completed.some((t) => {
    if (!t.completedAt) return false;
    const hour = new Date(t.completedAt).getHours();
    return hour < 7;
  });
  if (hasEarlyCompletion) award(BADGE_TYPES.EARLY_BIRD);

  return newBadges;
}

/**
 * Identify the "Most Improved" member: the member with the largest CS increase
 * between two scoring snapshots.
 *
 * @param {Record<string, number>} previousScores — memberId → old CS
 * @param {Record<string, number>} currentScores  — memberId → new CS
 * @returns {string|null} — memberId of most improved, or null
 */
export function findMostImproved(previousScores, currentScores) {
  let bestId = null;
  let bestDelta = 0;

  for (const [id, current] of Object.entries(currentScores)) {
    const prev  = previousScores[id] || 0;
    const delta = current - prev;
    if (delta > bestDelta) { bestDelta = delta; bestId = id; }
  }

  return bestDelta > 0 ? bestId : null;
}
