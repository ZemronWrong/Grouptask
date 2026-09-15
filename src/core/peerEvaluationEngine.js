/**
 * Peer Evaluation scoring — pure function, no DOM / network deps.
 *
 * PE = (CS × 0.70) + (avgPeerQualityRating × 0.30)
 *
 * avgPeerQualityRating is on a 0–100 scale (raw ratings are 1-5, normalised).
 */

const CS_WEIGHT   = 0.70;
const PEER_WEIGHT = 0.30;

/**
 * Normalise a 1-5 star rating to a 0-100 scale.
 * @param {number} rating  (1–5)
 * @returns {number}       (0–100)
 */
export function normaliseRating(rating) {
  if (typeof rating !== 'number' || rating < 1 || rating > 5) return 0;
  return ((rating - 1) / 4) * 100;
}

/**
 * Average of normalised ratings.
 * @param {Array<{rating:number}>} ratings
 * @returns {number} 0–100
 */
export function averagePeerRating(ratings) {
  if (!Array.isArray(ratings) || ratings.length === 0) return 0;
  const sum = ratings.reduce((s, r) => s + normaliseRating(r.rating), 0);
  return Math.round((sum / ratings.length) * 100) / 100;
}

/**
 * Full PE score for one member.
 *
 * @param {number} contributionScore  0-100
 * @param {Array<{rating:number}>} peerRatings — ratings this member received
 * @returns {{ peScore:number, csComponent:number, peerComponent:number,
 *             avgPeerRating:number, hasRatings:boolean }}
 */
export function calculatePEScore(contributionScore, peerRatings) {
  const cs = typeof contributionScore === 'number' ? contributionScore : 0;
  const hasRatings = Array.isArray(peerRatings) && peerRatings.length > 0;
  const avg = averagePeerRating(peerRatings);

  const csComponent   = Math.round(cs * CS_WEIGHT * 100) / 100;
  const peerComponent = hasRatings ? Math.round(avg * PEER_WEIGHT * 100) / 100 : 0;
  const peScore       = Math.round((csComponent + peerComponent) * 100) / 100;

  return { peScore, csComponent, peerComponent, avgPeerRating: avg, hasRatings };
}

/**
 * Batch PE scores for all members.
 *
 * @param {Record<string, {score:number}>} csMap — output of calculateAllContributionScores
 * @param {Record<string, Array<{rating:number}>>} ratingsMap — memberId → ratings received
 * @returns {Record<string, ReturnType<calculatePEScore>>}
 */
export function calculateAllPEScores(csMap, ratingsMap) {
  const out = {};
  for (const [id, cs] of Object.entries(csMap)) {
    out[id] = calculatePEScore(cs.score, ratingsMap[id] || []);
  }
  return out;
}
