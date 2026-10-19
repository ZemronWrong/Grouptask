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
import { BADGE_ICONS } from '../assets/icons/badgeIcons.js';

// ── Profile Badge Definitions ─────────────────────────────────────────────────

/**
 * Tiered streak badges. Days needed matches "a week", "two weeks", a month, etc.
 * Named after fire intensity because sustained daily effort is hard to fake.
 */
export const STREAK_BADGES = [
  { id: 'streak_spark',     label: 'Spark',     icon: BADGE_ICONS.streak_spark,     days: 3,  category: 'Streaks',     description: '3-day streak — you\'ve started something',      howToGet: 'Complete tasks or contribute for 3 consecutive days in a row.', hidden: false },
  { id: 'streak_ember',     label: 'Ember',     icon: BADGE_ICONS.streak_ember,     days: 7,  category: 'Streaks',     description: '7-day streak — one full week of momentum',      howToGet: 'Maintain an unbroken daily activity streak for 7 consecutive days (1 full week).', hidden: false },
  { id: 'streak_wildfire',  label: 'Wildfire',  icon: BADGE_ICONS.streak_wildfire,  days: 14, category: 'Streaks',     description: '14-day streak — two weeks of sustained output', howToGet: 'Maintain an unbroken daily activity streak for 14 consecutive days (2 weeks).', hidden: false },
  { id: 'streak_firestorm', label: 'Firestorm', icon: BADGE_ICONS.streak_firestorm, days: 30, category: 'Streaks',     description: '30-day streak — a full month of dedication',    howToGet: 'Maintain an unbroken daily activity streak for 30 consecutive days (1 full month).', hidden: false },
  { id: 'streak_undying',   label: 'Undying',   icon: BADGE_ICONS.streak_undying,   days: 60, category: 'Streaks',     description: '60-day streak — rare and remarkable',          howToGet: 'Maintain an unbroken daily activity streak for 60 consecutive days.', hidden: false },
];

/**
 * Comment volume badges. Named "Keyboard Warrior" because it takes genuine effort
 * to write 50+ useful comments — this isn't rewarding noise.
 */
export const COMMENT_BADGES = [
  { id: 'keyboard_i',   label: 'Keyboard Warrior I',   icon: BADGE_ICONS.keyboard_i,   count: 10,  category: 'Discussions', description: '10 comments posted',  howToGet: 'Post at least 10 comments across task discussions.', hidden: false },
  { id: 'keyboard_ii',  label: 'Keyboard Warrior II',  icon: BADGE_ICONS.keyboard_ii,  count: 50,  category: 'Discussions', description: '50 comments posted',  howToGet: 'Post at least 50 comments across task discussions.', hidden: false },
  { id: 'keyboard_iii', label: 'Keyboard Warrior III', icon: BADGE_ICONS.keyboard_iii, count: 200, category: 'Discussions', description: '200 comments posted', howToGet: 'Post at least 200 comments across task discussions.', hidden: false },
];

/**
 * Task completion volume badges (global, cross-board).
 */
export const CARD_BADGES = [
  { id: 'card_i',   label: 'Card Master I',   icon: BADGE_ICONS.card_i,   count: 5,   category: 'Tasks', description: '5 tasks completed globally',   howToGet: 'Complete and finish 5 tasks across any project boards.', hidden: false },
  { id: 'card_ii',  label: 'Card Master II',  icon: BADGE_ICONS.card_ii,  count: 25,  category: 'Tasks', description: '25 tasks completed globally',  howToGet: 'Complete and finish 25 tasks across any project boards.', hidden: false },
  { id: 'card_iii', label: 'Card Master III', icon: BADGE_ICONS.card_iii, count: 100, category: 'Tasks', description: '100 tasks completed globally', howToGet: 'Complete and finish 100 tasks across any project boards.', hidden: false },
];

/**
 * Peer-nominated badges. Only given when another member explicitly votes for someone.
 * Not auto-awarded — requires active recognition from the peer community.
 */
export const PEER_NOMINATED_BADGES = [
  { id: 'most_helpful',      label: 'Most Helpful',      icon: BADGE_ICONS.most_helpful,      category: 'Peer', description: 'Peer-nominated for outstanding helpfulness',    howToGet: 'Be nominated by teammates for outstanding helpfulness during peer evaluation.', hidden: false },
  { id: 'best_collaborator', label: 'Best Collaborator', icon: BADGE_ICONS.best_collaborator, category: 'Peer', description: 'Peer-nominated for exceptional collaboration',  howToGet: 'Be nominated by teammates for exceptional teamwork and collaboration during peer evaluation.', hidden: false },
];

/** Hidden badges — visible only after unlocking. Shown as "?" until earned. */
export const HIDDEN_BADGES = [
  { id: 'night_owl',  label: 'Night Owl',  icon: BADGE_ICONS.night_owl,  category: 'Secret', description: 'Completed a task between 11 PM and 4 AM', howToGet: 'Complete and finish any task between 11:00 PM and 4:00 AM.', hint: 'Late-night productivity secret', hidden: true },
  { id: 'early_bird', label: 'Early Bird', icon: BADGE_ICONS.early_bird, category: 'Secret', description: 'Completed a task before 7 AM',            howToGet: 'Complete and finish any task before 7:00 AM.',            hint: 'Early-morning dedication secret', hidden: true },
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
    icon: BADGE_ICONS.project_finisher,
    category: 'Board',
    description: 'Completed at least one task before the project closed',
    howToGet: 'Complete at least 1 task on a project board before the project is completed.',
    checkFn: ({ completedCount }) => completedCount >= 1,
  },
  {
    id: 'deadline_master',
    label: 'Deadline Master',
    icon: BADGE_ICONS.deadline_master,
    category: 'Board',
    description: 'All personal tasks completed before their deadlines',
    howToGet: 'Complete all of your assigned tasks on the board on or before their deadlines.',
    checkFn: ({ tasks, memberId }) => {
      const mine = tasks.filter((t) => t.assignedTo === memberId && t.status === 'done' && t.deadline);
      return mine.length > 0 && mine.every((t) => t.completedAt && t.completedAt < new Date(t.deadline).getTime());
    },
  },
  {
    id: 'team_player',
    label: 'Team Player',
    icon: BADGE_ICONS.team_player,
    category: 'Board',
    description: 'Received an average peer evaluation of 4.0 or above on this board',
    howToGet: 'Receive an average peer rating score of 4.0 / 5.0 or higher from your teammates on this board.',
    checkFn: ({ avgPeerScore }) => avgPeerScore >= 4.0,
  },
  {
    id: 'no_free_loader',
    label: 'No Free Loader',
    icon: BADGE_ICONS.no_free_loader,
    category: 'Board',
    description: 'Contribution score ≥ 70% at project completion',
    howToGet: 'Achieve a Work Package Share (WPS) contribution score of 70% or higher at project completion.',
    checkFn: ({ contributionScore }) => contributionScore >= 70,
  },
  {
    id: 'documentation_hero',
    label: 'Documentation Hero',
    icon: BADGE_ICONS.documentation_hero,
    category: 'Board',
    description: 'Completed 2 or more high-weight tasks with proof links',
    howToGet: 'Complete 2 or more high-weight tasks (weight ≥ 7) with approved proof submission links.',
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
    icon: BADGE_ICONS.code_reviewer,
    category: 'Board',
    description: 'Approved or rejected 3 or more proof submissions as an admin',
    howToGet: 'Review and approve/reject 3 or more proof submissions as a board administrator.',
    checkFn: ({ reviewCount }) => reviewCount >= 3,
  },
  {
    id: 'bug_squasher',
    label: 'Bug Squasher',
    icon: BADGE_ICONS.bug_squasher,
    category: 'Board',
    description: 'Completed tasks tagged as bugs',
    howToGet: 'Complete and finish at least 1 task with the "bug" tag on the board.',
    checkFn: ({ tasks, memberId }) =>
      tasks.some((t) => 
        t.assignedTo === memberId && 
        t.status === 'done' && 
        (
          t.type === 'bug' || 
          (Array.isArray(t.tags) && t.tags.some(tag => tag.toLowerCase() === 'bug')) ||
          (typeof t.tags === 'string' && t.tags.toLowerCase().includes('bug')) ||
          (t.title && t.title.toLowerCase().includes('[bug]'))
        )
      ),
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
    streak:  { current: streakDays,   needed: streakNext?.days || 3,   nextLabel: streakNext?.label || 'Spark',  pct: Math.min(100, Math.round((streakDays  / (streakNext?.days || 1))   * 100)) },
    comment: { current: commentCount, needed: commentNext?.count || 10, nextLabel: commentNext?.label || 'Keyboard Warrior I', pct: Math.min(100, Math.round((commentCount / (commentNext?.count || 1)) * 100)) },
    card:    { current: cardCount,    needed: cardNext?.count || 5,    nextLabel: cardNext?.label || 'Card Master I',    pct: Math.min(100, Math.round((cardCount    / (cardNext?.count || 1))    * 100)) },
  };
}

/**
 * Returns all system badges with their categories and instructions.
 * @returns {Array<object>}
 */
export function getAllBadges() {
  return [
    ...STREAK_BADGES,
    ...CARD_BADGES,
    ...COMMENT_BADGES,
    ...BOARD_BADGES,
    ...PEER_NOMINATED_BADGES,
    ...HIDDEN_BADGES,
  ];
}

/**
 * Look up any badge by its unique ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getBadgeById(id) {
  return getAllBadges().find((b) => b.id === id) || null;
}

