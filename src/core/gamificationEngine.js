/**
 * Gamification logic — pure functions, no DOM / network deps.
 *
 * - Points per completed task = weight × 10
 * - XP level system (Level 1–20 with titles)
 * - Streak tracking
 * - Milestone badges based on real completions
 */

import { ICONS } from '../assets/icons/icons.js';

/* ── XP Level System ── */

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
 * Get XP level info for a given point total.
 * @param {number} points
 * @returns {{ level:number, title:string, currentXP:number, nextLevelXP:number|null, progress:number }}
 */
export function getXPLevel(points) {
  let current = LEVEL_THRESHOLDS[0];
  for (const t of LEVEL_THRESHOLDS) {
    if (points >= t.xp) current = t;
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
 * Calculate the current completion streak (consecutive days with at least one task completed).
 *
 * @param {Array<{assignedTo:string, status:string, completedAt?:number}>} tasks
 * @param {string} memberId
 * @returns {{ currentStreak:number, longestStreak:number }}
 */
export function calculateStreak(tasks, memberId) {
  if (!Array.isArray(tasks) || !memberId) return { currentStreak: 0, longestStreak: 0 };

  const completed = tasks
    .filter((t) => t.assignedTo === memberId && t.status === 'done' && t.completedAt)
    .map((t) => {
      const d = new Date(t.completedAt);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

  const uniqueDays = [...new Set(completed)].sort();
  if (uniqueDays.length === 0) return { currentStreak: 0, longestStreak: 0 };

  // Build streaks
  let longestStreak = 1;
  let streak = 1;

  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = new Date(uniqueDays[i - 1]);
    const curr = new Date(uniqueDays[i]);
    const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      streak++;
      if (streak > longestStreak) longestStreak = streak;
    } else {
      streak = 1;
    }
  }

  // Check if current streak is still active (last completion was today or yesterday)
  const lastDay = new Date(uniqueDays[uniqueDays.length - 1]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffFromToday = Math.round((today - lastDay) / (1000 * 60 * 60 * 24));

  const currentStreak = diffFromToday <= 1 ? streak : 0;

  return { currentStreak, longestStreak };
}

/* ── Points ── */

/**
 * Calculate total points for a member from their completed tasks.
 *
 * @param {Array<{assignedTo:string, status:string, weight:number}>} tasks
 * @param {string} memberId
 * @returns {number}
 */
export function calculatePoints(tasks, memberId) {
  if (!Array.isArray(tasks) || !memberId) return 0;
  return tasks
    .filter((t) => t.assignedTo === memberId && t.status === 'done')
    .reduce((sum, t) => sum + (Number(t.weight) || 0) * 10, 0);
}

/**
 * Build a sorted leaderboard for a group.
 *
 * @param {Array} tasks — all group tasks
 * @param {string[]} memberIds
 * @param {Record<string, string>} nameMap — memberId → displayName
 * @returns {Array<{memberId, displayName, points, rank, level, title}>}
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

/* ── Badge definitions ── */

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
 * Determine which badges a member has earned.
 *
 * @param {Array} tasks — all group tasks
 * @param {string} memberId
 * @param {Array} existingBadgeIds — badge type IDs already earned
 * @param {object} [extra] — optional extra data
 * @param {number} [extra.currentStreak] — current streak length
 * @param {Array}  [extra.proofs] — proof submissions for this member
 * @returns {Array<{id:string, label:string, icon:string, description:string}>} — newly earned badges
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
