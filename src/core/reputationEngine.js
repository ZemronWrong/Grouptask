/**
 * Reputation Engine
 *
 * Reputation (Rep) is a global, cross-board trust score that reflects how a student
 * is *perceived* by peers over time — distinct from raw task output (Board Points)
 * or experience accumulation (Global XP).
 *
 * Rep is earned through substantive commenting and consistent task completion, but
 * can also decrease from late delivery or free-loader flags. Peer ratings never
 * change reputation: reputation is visible to the group, and the consent form
 * promises that individual ratings are never shown to groupmates (E2a).
 * This asymmetry matters: it's easy to lose reputation and harder to rebuild it,
 * which discourages coasting without penalizing genuine struggle.
 *
 * Tier system maps reputation onto a visible social identity that instructors and
 * teammates can use to assess trust levels at a glance.
 */

/** Six named tiers above the unranked baseline. */
export const REPUTATION_TIERS = [
  { tier: 0, label: 'Unranked',   minRep: -Infinity, description: 'Below zero — contribution is being questioned' },
  { tier: 1, label: 'Awakened',   minRep: 0,         description: 'Active and getting started'                    },
  { tier: 2, label: 'Ascended',   minRep: 500,       description: 'Consistent contributor'                        },
  { tier: 3, label: 'Transcended',minRep: 1500,      description: 'Reliable and quality-focused'                  },
  { tier: 4, label: 'Mystic',     minRep: 3500,      description: 'Peer-recognised for collaboration'             },
  { tier: 5, label: 'Celestial',  minRep: 7000,      description: 'Top-tier contributor across projects'          },
  { tier: 6, label: 'Eternal',    minRep: 15000,     description: 'Exceptional, sustained excellence'             },
];

/** Rep deltas per event type. Negative values are intentional — reputation has weight. */
export const REP_DELTAS = {
  card_complete:           +5,
  card_complete_overdue:   -2,   // late delivery signals unreliability
  comment_posted:          +2,
  streak_day:              +3,
  freeloaded_flagged:      -50,  // instructor-level penalty
  appeal_accepted:         +30,  // restores trust after a false flag
};

/** Rep threshold below which a member is considered a free-loader for display/badge purposes. */
export const FREELOADER_REP_THRESHOLD = 0;

/**
 * Maps a cumulative reputation total to its named tier.
 *
 * Tiers are assigned by the highest threshold the member has crossed.
 * Reputation can drop, so a member who was "Mystic" may fall back to "Transcended".
 *
 * @param {number} rep - Cumulative reputation score (may be negative).
 * @returns {{ tier:number, label:string, minRep:number, description:string }}
 */
export function getReputationTier(rep) {
  let current = REPUTATION_TIERS[0]; // Unranked
  for (const t of REPUTATION_TIERS) {
    if (rep >= t.minRep) current = t;
  }
  return current;
}

/**
 * Computes progress toward the *next* reputation tier as a 0–100 percentage,
 * plus the raw numbers for a progress bar label like "320 / 500 to Ascended".
 *
 * @param {number} rep
 * @returns {{
 *   current: object,       // current tier
 *   next: object|null,     // next tier (null if Eternal)
 *   progress: number,      // 0–100
 *   repInTier: number,     // rep earned since current tier threshold
 *   repNeeded: number,     // total rep needed to cross to next tier
 * }}
 */
export function getRepProgress(rep) {
  const current = getReputationTier(rep);
  const nextIdx = REPUTATION_TIERS.findIndex((t) => t.tier === current.tier + 1);
  const next = nextIdx >= 0 ? REPUTATION_TIERS[nextIdx] : null;

  const repInTier = rep - current.minRep;
  const repNeeded = next ? next.minRep - current.minRep : 1;
  const progress = next ? Math.min(100, Math.round((repInTier / repNeeded) * 100)) : 100;

  return { current, next, progress, repInTier: Math.max(0, repInTier), repNeeded };
}

/**
 * Event types recorded by older versions when a peer rating was submitted.
 * They may still exist in the append-only events ledger, so they are ignored
 * when totalling reputation (E2a).
 */
export const PEER_EVAL_EVENT_TYPES = ['peer_eval_received_high', 'peer_eval_received_low'];

/** True if an event counts toward reputation (everything except legacy peer-eval events). */
export function countsTowardReputation(event) {
  return !PEER_EVAL_EVENT_TYPES.includes(event?.eventType);
}

/**
 * Totals all reputation events for a given user to produce their current rep score.
 *
 * This is a pure reduce over the event log — no cached state, no side effects.
 * Re-computing from events guarantees correctness after retroactive adjustments.
 *
 * @param {Array<{userId:string, repDelta:number}>} events - All rep-affecting events.
 * @param {string} userId
 * @returns {number} Current reputation score.
 */
export function calculateReputation(events, userId) {
  if (!Array.isArray(events) || !userId) return 0;
  return events
    .filter((e) => e.userId === userId && typeof e.repDelta === 'number' && countsTowardReputation(e))
    .reduce((sum, e) => sum + e.repDelta, 0);
}

/**
 * Returns true if a member's reputation puts them in free-loader territory.
 * Used to suppress board badges and show the "Needs Improvement" flag.
 *
 * @param {number} rep
 * @returns {boolean}
 */
export function isFreeloader(rep) {
  return rep < FREELOADER_REP_THRESHOLD;
}
