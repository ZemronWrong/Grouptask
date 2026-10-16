/**
 * Peer Evaluation Engine
 *
 * Implements the hybrid quantitative-qualitative scoring model approved in
 * Chapter 3 (Table 3.7 & 3.8) of the GroupTask thesis.
 *
 * ─── Mathematical Formulation ────────────────────────────────────────────────
 *
 * Step 1 — Relative Contribution Index (RCI):
 *   RCI_i = n × (W_i / W_G)
 *   where:
 *     n   = number of members in the group
 *     W_i = sum of done-task weights for member i
 *     W_G = sum of done-task weights across the ENTIRE group
 *
 * Step 2 — Contribution Component (C_i):
 *   C_i = min(RCI_i, 1.0) × 100
 *   Capped at 100 to prevent over-contributors from exceeding the scale.
 *   A member doing their exact equal share (W_i = W_G / n) produces RCI = 1.0
 *   and therefore C_i = 100.
 *
 * Step 3 — Peer Quality Rating (PQR_i):
 *   PQR_i = mean of all peer ratings normalised to [0, 100] via Likert mapping.
 *   Minimum threshold m_i ≥ 2 peers must have submitted a rating.
 *   A single rating is discarded to prevent 1-on-1 interpersonal bias from
 *   determining 30% of a student's evaluation grade.
 *
 * Step 4 — Final PE Score:
 *   PE_i = 0.70 × C_i + 0.30 × PQR_i    (if m_i ≥ 2)
 *   PE_i = C_i                             (if m_i < 2, labeled "task_based_only")
 *
 * Pedagogical Rationale:
 * Pure peer evaluations degenerate into popularity contests or reciprocal
 * inflation. Anchoring 70% of the grade to verified, adviser-locked task
 * weights ensures objective deliverables remain the primary criterion, while
 * reserving 30% for team-observed qualitative factors only when sufficient
 * independent ratings exist.
 *
 * Pure mathematical functions — no DOM or network dependencies.
 */

const CS_WEIGHT   = 0.70;
const PEER_WEIGHT = 0.30;

/** Minimum number of independent peer ratings required to activate the peer component. */
const MIN_RATINGS_THRESHOLD = 2;

// ─── Likert Normalisation ────────────────────────────────────────────────────

/**
 * Linearly maps a discrete Likert scale rating (1–5 stars) onto a [0, 100] range.
 *
 * Mapping:
 *   R_norm = ((r − 1) / (5 − 1)) × 100
 *
 *   1 Star → 0%   (Unacceptable / Free-rider behaviour)
 *   3 Stars → 50%  (Baseline competence)
 *   5 Stars → 100% (Exemplary peer contribution)
 *
 * @param {number} rating - Integer or decimal rating in [1, 5].
 * @returns {number} Normalised rating in [0, 100]. Returns 0 for out-of-range values.
 */
export function normaliseRating(rating) {
  if (typeof rating !== 'number' || rating < 1 || rating > 5) return 0;
  return ((rating - 1) / 4) * 100;
}

/**
 * Computes the arithmetic mean of normalised peer ratings.
 *
 * @param {Array<{rating:number}>} ratings - Array of rating objects received by the member.
 * @returns {number} Mean rating on a [0, 100] scale, rounded to 2 decimal places.
 */
export function averagePeerRating(ratings) {
  if (!Array.isArray(ratings) || ratings.length === 0) return 0;
  const sum = ratings.reduce((acc, r) => acc + normaliseRating(r.rating), 0);
  return Math.round((sum / ratings.length) * 100) / 100;
}

// ─── Relative Contribution Index ─────────────────────────────────────────────

/**
 * Computes the Relative Contribution Index (RCI) and the capped Contribution
 * Component (C_i) for one member, following Chapter 3 Table 3.7.
 *
 * RCI_i = n × (W_i / W_G)
 * C_i   = min(RCI_i, 1.0) × 100
 *
 * Edge cases:
 *   - W_G = 0 (no tasks done by anyone) → RCI = 0, C_i = 0.
 *   - W_i = 0 (member has not completed anything) → RCI = 0, C_i = 0.
 *   - RCI > 1 (over-contributor) → capped to C_i = 100.
 *
 * @param {number} completedWeight   - Sum of verified done-task weights for this member (W_i).
 * @param {number} groupDoneWeight   - Sum of verified done-task weights for the entire group (W_G).
 * @param {number} groupMemberCount  - Total number of members in the group (n).
 * @returns {{ rci: number, ci: number }}
 */
export function computeRCI(completedWeight, groupDoneWeight, groupMemberCount) {
  const W_i = typeof completedWeight  === 'number' ? completedWeight  : 0;
  const W_G = typeof groupDoneWeight  === 'number' ? groupDoneWeight  : 0;
  const n   = typeof groupMemberCount === 'number' && groupMemberCount > 0 ? groupMemberCount : 1;

  if (W_G === 0) return { rci: 0, ci: 0 };

  const rci = n * (W_i / W_G);
  const ci  = Math.min(rci, 1.0) * 100;
  return {
    rci: Math.round(rci * 10000) / 10000,  // 4 decimal places for transparency display
    ci:  Math.round(ci  * 100)   / 100,    // 2 decimal places
  };
}

// ─── Composite PE Score ───────────────────────────────────────────────────────

/**
 * Computes the composite Peer Evaluation (PE) score for one student,
 * implementing Chapter 3 Table 3.7 exactly.
 *
 * @param {number} completedWeight   - W_i: sum of done-task weights for this member.
 * @param {number} groupDoneWeight   - W_G: sum of done-task weights across the entire group.
 * @param {number} groupMemberCount  - n: number of members in the group.
 * @param {Array<{rating:number}>} peerRatings - All peer rating objects received by this member.
 * @returns {{
 *   peScore:       number,   Final PE score [0–100]
 *   rci:           number,   Raw Relative Contribution Index (pre-cap)
 *   ciComponent:   number,   Contribution Component C_i [0–100]
 *   peerComponent: number,   Weighted peer component (0 when m_i < 2)
 *   avgPeerRating: number,   Normalised mean peer rating [0–100]
 *   ratingCount:   number,   m_i — how many peers submitted a rating
 *   ratingsStatus: 'has_ratings' | 'task_based_only'
 * }}
 */
export function calculatePEScore(completedWeight, groupDoneWeight, groupMemberCount, peerRatings) {
  const { rci, ci } = computeRCI(completedWeight, groupDoneWeight, groupMemberCount);

  const ratings    = Array.isArray(peerRatings) ? peerRatings : [];
  const m_i        = ratings.length;
  const hasRatings = m_i >= MIN_RATINGS_THRESHOLD;
  const avg        = averagePeerRating(ratings);

  let peScore, csComponent, peerComponent;

  if (hasRatings) {
    // Full formula: 70% contribution + 30% peer quality rating
    csComponent   = Math.round(ci * CS_WEIGHT   * 100) / 100;
    peerComponent = Math.round(avg * PEER_WEIGHT * 100) / 100;
    peScore       = Math.round((csComponent + peerComponent) * 100) / 100;
  } else {
    // Fallback: score equals the contribution component only (no penalty)
    // Per manuscript Page 31: "PE_i = C_i when m_i < 2"
    csComponent   = Math.round(ci * 100) / 100;
    peerComponent = 0;
    peScore       = csComponent;
  }

  return {
    peScore,
    rci,
    ci:            Math.round(ci * 100) / 100,
    ciComponent:   Math.round(ci * 100) / 100,
    csComponent,
    peerComponent,
    avgPeerRating: avg,
    ratingCount:   m_i,
    // Transparent status string — must be displayed in the UI so evaluators
    // understand why a score is at full C_i rather than the 70/30 composite.
    ratingsStatus: hasRatings ? 'has_ratings' : 'task_based_only',
  };
}

// ─── Batch Computation ────────────────────────────────────────────────────────

/**
 * Batch-computes Peer Evaluation scores for all members in a group.
 *
 * All members share the same W_G (group done weight) and n (group size),
 * so scores are comparable on the same scale.
 *
 * @param {Record<string, {completedWeight:number, groupDoneWeight:number}>} csMap
 *   Mapping of memberId → scoring engine output (from calculateContributionScore).
 * @param {Record<string, Array<{rating:number}>>} ratingsMap
 *   Mapping of memberId → array of peer rating objects.
 * @param {number} groupMemberCount - Total number of members in the group (n).
 * @returns {Record<string, ReturnType<typeof calculatePEScore>>}
 */
export function calculateAllPEScores(csMap, ratingsMap, groupMemberCount) {
  const evaluations = {};
  for (const [id, cs] of Object.entries(csMap)) {
    evaluations[id] = calculatePEScore(
      cs.completedWeight,
      cs.groupDoneWeight,
      groupMemberCount,
      ratingsMap[id] || []
    );
  }
  return evaluations;
}
