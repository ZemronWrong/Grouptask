/**
 * Badge Engine
 *
 * Two distinct badge categories exist intentionally:
 *
 * Profile Badges — global, tiered, persistent across all projects.
 *   These track a student's long-term growth as a contributor.
 *   They have progress bars because the goal is to encourage gradual improvement,
 *   not just reward single moments.
 *
 * Board Badges — static, per-project, awarded once at relevant thresholds.
 *   These recognise specific project-level behaviours (finishing, reviewing, not
 *   free-loading) that don't translate to a global scale.
 *
 * Board badges are suppressed for members whose reputation is below zero —
 * this is the primary anti-free-loader enforcement mechanism.
 */

import { isFreeloader } from './reputationEngine.js';

// ── Profile Badge Definitions ─────────────────────────────────────────────────

/**
 * Tiered streak badges. Days needed matches "a week", "two weeks", a month, etc.
 * Named after fire intensity because sustained daily effort is hard to fake.
 */
export const STREAK_BADGES = [
  { id: 'streak_spark',     label: 'Spark',     days: 3,  description: '3-day streak — you\'ve started something',      hidden: false },
  { id: 'streak_ember',     label: 'Ember',     days: 7,  description: '7-day streak — one full week of momentum',      hidden: false },
  { id: 'streak_wildfire',  label: 'Wildfire',  days: 14, description: '14-day streak — two weeks of sustained output', hidden: false },
  { id: 'streak_firestorm', label: 'Firestorm', days: 30, description: '30-day streak — a full month of dedication',    hidden: false },
  { id: 'streak_undying',   label: 'Undying',   days: 60, description: '60-day streak — rare and remarkable',          hidden: false },
];

/**
 * Comment volume badges. Named "Keyboard Warrior" because it takes genuine effort
 * to write 50+ useful comments — this isn't rewarding noise.
 */
export const COMMENT_BADGES = [
  { id: 'keyboard_i',   label: 'Keyboard Warrior I',   count: 10,  description: '10 comments posted',  hidden: false },
  { id: 'keyboard_ii',  label: 'Keyboard Warrior II',  count: 50,  description: '50 comments posted',  hidden: false },
  { id: 'keyboard_iii', label: 'Keyboard Warrior III', count: 200, description: '200 comments posted', hidden: false },
];

/**
 * Task completion volume badges (global, cross-board).
 */
export const CARD_BADGES = [
  { id: 'card_i',   label: 'Card Master I',   count: 5,   description: '5 tasks completed globally',   hidden: false },
  { id: 'card_ii',  label: 'Card Master II',  count: 25,  description: '25 tasks completed globally',  hidden: false },
  { id: 'card_iii', label: 'Card Master III', count: 100, description: '100 tasks completed globally', hidden: false },
];

/**
 * Peer-nominated badges. Only given when another member explicitly votes for someone.
 * Not auto-awarded — requires active recognition from the peer community.
 */
export const PEER_NOMINATED_BADGES = [
  { id: 'most_helpful',      label: 'Most Helpful',      description: 'Peer-nominated for outstanding helpfulness',    hidden: false },
  { id: 'best_collaborator', label: 'Best Collaborator', description: 'Peer-nominated for exceptional collaboration',  hidden: false },
];

/** Hidden badges — visible only after unlocking. Shown as "?" until earned. */
export const HIDDEN_BADGES = [
  { id: 'night_owl',  label: 'Night Owl',  description: 'Completed a task between 11 PM and 4 AM', hidden: true },
  { id: 'early_bird', label: 'Early Bird', description: 'Completed a task before 7 AM',            hidden: true },
];

// ── Board Badge Definitions ───────────────────────────────────────────────────

/**
 * These are awarded once per board. No tiers, no progress bar.
 * The `checkFn` receives the board context object — see evaluateBoardBadges().
 */
export const BOARD_BADGES = [
  {
    id: 'project_finisher',
    label: 'Project Finisher',
    description: 'Completed at least one task before the project closed',
    checkFn: ({ completedCount }) => completedCount >= 1,
  },
  {
    id: 'deadline_master',
    label: 'Deadline Master',
    description: 'All personal tasks completed before their deadlines',
    checkFn: ({ tasks, memberId }) => {
      const mine = tasks.filter((t) => t.assignedTo === memberId && t.status === 'done' && t.deadline);
      return mine.length > 0 && mine.every((t) => t.completedAt && t.completedAt < new Date(t.deadline).getTime());
    },
  },
  {
    id: 'team_player',
    label: 'Team Player',
    description: 'Received an average peer evaluation of 4.0 or above on this board',
    checkFn: ({ avgPeerScore }) => avgPeerScore >= 4.0,
  },
  {
    id: 'no_free_loader',
    label: 'No Free Loader',
    description: 'Contribution score ≥ 70% at project completion',
    checkFn: ({ contributionScore }) => contributionScore >= 70,
  },
  {
    id: 'documentation_hero',
    label: 'Documentation Hero',
    description: 'Completed 2 or more high-weight tasks with proof links',
    checkFn: ({ tasks, memberId, proofs }) => {
      const withProof = tasks.filter((t) =>
        t.assignedTo === memberId &&
        t.status === 'done' &&
        (t.weight || 0) >= 7 &&
        proofs.some((p) => p.taskId === t.id && p.status === 'approved' && p.link)
      );
      return withProof.length >= 2;
    },
  },
  {
    id: 'code_reviewer',
    label: 'Code Reviewer',
    description: 'Approved or rejected 3 or more proof submissions as an admin',
    checkFn: ({ reviewCount }) => reviewCount >= 3,
  },
  {
    id: 'bug_squasher',
    label: 'Bug Squasher',
    description: 'Completed tasks tagged as bugs',
    checkFn: ({ tasks, memberId }) =>
      tasks.some((t) => t.assignedTo === memberId && t.status === 'done' && t.tags?.includes('bug')),
  },
];

// ── Evaluators ────────────────────────────────────────────────────────────────

/**
 * Evaluates which board badges a member has newly earned.
 *
 * Board badges are suppressed entirely for members with negative reputation —
 * this is how the system discourages free-riding without explicit instructor
 * intervention for every case.
 *
 * @param {{
 *   memberId: string,
 *   reputation: number,
 *   tasks: Array,
 *   proofs: Array,
 *   contributionScore: number,
 *   avgPeerScore: number,
 *   completedCount: number,
 *   reviewCount: number,
 *   existingBadgeIds: string[]
 * }} ctx
 * @returns {Array<{id:string, label:string, description:string}>} Newly earned board badges.
 */
export function evaluateBoardBadges(ctx) {
  const { reputation, existingBadgeIds = [], ...rest } = ctx;

  // Free-loaders get no board badges — this is the enforcement mechanism
  if (isFreeloader(reputation)) return [];

  return BOARD_BADGES.filter((badge) => {
    if (existingBadgeIds.includes(badge.id)) return false;
    try { return badge.checkFn(rest); } catch { return false; }
  });
}

/**
 * Evaluates which profile streak badges have been newly unlocked.
 *
 * @param {number} currentStreakDays
 * @param {string[]} existingBadgeIds
 * @returns {Array}
 */
export function evaluateStreakBadges(currentStreakDays, existingBadgeIds = []) {
  return STREAK_BADGES.filter(
    (b) => currentStreakDays >= b.days && !existingBadgeIds.includes(b.id)
  );
}

/**
 * Evaluates which comment-volume badges have been newly unlocked.
 *
 * @param {number} totalComments
 * @param {string[]} existingBadgeIds
 * @returns {Array}
 */
export function evaluateCommentBadges(totalComments, existingBadgeIds = []) {
  return COMMENT_BADGES.filter(
    (b) => totalComments >= b.count && !existingBadgeIds.includes(b.id)
  );
}

/**
 * Evaluates which card-volume badges have been newly unlocked.
 *
 * @param {number} globalCompletedCount
 * @param {string[]} existingBadgeIds
 * @returns {Array}
 */
export function evaluateCardBadges(globalCompletedCount, existingBadgeIds = []) {
  return CARD_BADGES.filter(
    (b) => globalCompletedCount >= b.count && !existingBadgeIds.includes(b.id)
  );
}

/**
 * Evaluates hidden badges (Night Owl, Early Bird) from task completion timestamps.
 *
 * @param {Array<{completedAt?:number}>} completedTasks
 * @param {string[]} existingBadgeIds
 * @returns {Array}
 */
export function evaluateHiddenBadges(completedTasks, existingBadgeIds = []) {
  const earned = [];
  const nightOwl = HIDDEN_BADGES.find((b) => b.id === 'night_owl');
  const earlyBird = HIDDEN_BADGES.find((b) => b.id === 'early_bird');

  if (nightOwl && !existingBadgeIds.includes('night_owl')) {
    if (completedTasks.some((t) => {
      if (!t.completedAt) return false;
      const h = new Date(t.completedAt).getHours();
      return h >= 23 || h < 4;
    })) earned.push(nightOwl);
  }

  if (earlyBird && !existingBadgeIds.includes('early_bird')) {
    if (completedTasks.some((t) => {
      if (!t.completedAt) return false;
      return new Date(t.completedAt).getHours() < 7;
    })) earned.push(earlyBird);
  }

  return earned;
}

/**
 * Returns progress toward each badge family for display in the profile UI.
 * Used to render progress bars even before a badge is fully unlocked.
 *
 * @param {{ streakDays:number, commentCount:number, cardCount:number }} stats
 * @returns {object} Progress data per badge family.
 */
export function getBadgeProgress(stats) {
  const { streakDays = 0, commentCount = 0, cardCount = 0 } = stats;

  const streakNext  = STREAK_BADGES.find((b) => streakDays  < b.days)  || STREAK_BADGES.at(-1);
  const commentNext = COMMENT_BADGES.find((b) => commentCount < b.count) || COMMENT_BADGES.at(-1);
  const cardNext    = CARD_BADGES.find((b)    => cardCount   < b.count)  || CARD_BADGES.at(-1);

  return {
    streak:  { current: streakDays,   needed: streakNext.days,   nextLabel: streakNext.label,  pct: Math.min(100, Math.round((streakDays  / streakNext.days)   * 100)) },
    comment: { current: commentCount, needed: commentNext.count, nextLabel: commentNext.label, pct: Math.min(100, Math.round((commentCount / commentNext.count) * 100)) },
    card:    { current: cardCount,    needed: cardNext.count,    nextLabel: cardNext.label,    pct: Math.min(100, Math.round((cardCount    / cardNext.count)    * 100)) },
  };
}
