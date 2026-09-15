/**
 * Peer Evaluation Engine
 *
 * Implements a hybrid quantitative-qualitative scoring model that synthesizes
 * objective task completion (Contribution Score) with subjective peer ratings.
 * Pure mathematical functions without DOM or network dependencies.
 *
 * Mathematical formulation:
 *   PE_i = (CS_i \times W_{\text{CS}}) + (\overline{R}_i \times W_{\text{Peer}})
 *   where W_{\text{CS}} = 0.70 and W_{\text{Peer}} = 0.30.
 *
 * Pedagogical Rationale:
 * Pure peer evaluations often degenerate into popularity contests, reciprocal inflation,
 * or unfair penalization. Anchoring 70% of the grade to verified task completions ensures
 * objective deliverables remain the primary criterion, while reserving 30% for team-observed
 * qualitative factors (collaboration, responsiveness, and communication).
 */

const CS_WEIGHT = 0.70;
const PEER_WEIGHT = 0.30;

/**
 * Linearly maps a discrete Likert scale rating (1 to 5 stars) onto a normalized 0-100 percentage range.
 *
 * Mathematical mapping:
 *   R_{\text{norm}} = \frac{r - 1}{5 - 1} \times 100 = \frac{r - 1}{4} \times 100
 *
 *   1 Star -> 0%   (Unacceptable / Free-rider behavior)
 *   3 Stars -> 50%  (Baseline competence)
 *   5 Stars -> 100% (Exemplary peer contribution)
 *
 * @param {number} rating - Integer or decimal rating in range [1, 5].
 * @returns {number} Normalized rating in range [0, 100]. Returns 0 for out-of-range values.
 */
export function normaliseRating(rating) {
  if (typeof rating !== 'number' || rating < 1 || rating > 5) return 0;
  return ((rating - 1) / 4) * 100;
}

/**
 * Computes the arithmetic mean of normalized peer ratings.
 *
 * @param {Array<{rating:number}>} ratings - Array of ratings received by the member.
 * @returns {number} Mean rating on a 0-100 scale, rounded to 2 decimal places.
 */
export function averagePeerRating(ratings) {
  if (!Array.isArray(ratings) || ratings.length === 0) return 0;
  const sum = ratings.reduce((acc, r) => acc + normaliseRating(r.rating), 0);
  return Math.round((sum / ratings.length) * 100) / 100;
}

/**
 * Computes the composite Peer Evaluation (PE) score for an individual student.
 *
 * If no peer ratings have been submitted yet, the score gracefully defaults
 * to the objective contribution component to avoid penalizing students for pending reviews.
 *
 * @param {number} contributionScore - Quantitative contribution score [0, 100].
 * @param {Array<{rating:number}>} peerRatings - List of peer ratings received by this student.
 * @returns {{
 *   peScore: number,
 *   csComponent: number,
 *   peerComponent: number,
 *   avgPeerRating: number,
 *   hasRatings: boolean
 * }}
 */
export function calculatePEScore(contributionScore, peerRatings) {
  const cs = typeof contributionScore === 'number' ? contributionScore : 0;
  const hasRatings = Array.isArray(peerRatings) && peerRatings.length > 0;
  const avg = averagePeerRating(peerRatings);

  const csComponent = Math.round(cs * CS_WEIGHT * 100) / 100;
  const peerComponent = hasRatings ? Math.round(avg * PEER_WEIGHT * 100) / 100 : 0;
  const peScore = Math.round((csComponent + peerComponent) * 100) / 100;

  return {
    peScore,
    csComponent,
    peerComponent,
    avgPeerRating: avg,
    hasRatings,
  };
}

/**
 * Batch computes Peer Evaluation scores for all members in a project group.
 *
 * @param {Record<string, {score:number}>} csMap - Mapping of memberId to CS objects.
 * @param {Record<string, Array<{rating:number}>>} ratingsMap - Mapping of memberId to arrays of peer ratings.
 * @returns {Record<string, ReturnType<typeof calculatePEScore>>} Composite PE evaluation map.
 */
export function calculateAllPEScores(csMap, ratingsMap) {
  const evaluations = {};
  for (const [id, cs] of Object.entries(csMap)) {
    evaluations[id] = calculatePEScore(cs.score, ratingsMap[id] || []);
  }
  return evaluations;
}

