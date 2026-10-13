import { describe, test, expect } from '@jest/globals';
import {
  normaliseRating,
  averagePeerRating,
  computeRCI,
  calculatePEScore,
  calculateAllPEScores,
} from '../src/core/peerEvaluationEngine.js';

// ─── normaliseRating ─────────────────────────────────────────────────────────

describe('normaliseRating', () => {
  test('maps 1 → 0, 3 → 50, 5 → 100', () => {
    expect(normaliseRating(1)).toBe(0);
    expect(normaliseRating(3)).toBe(50);
    expect(normaliseRating(5)).toBe(100);
  });

  test('returns 0 for out-of-range values', () => {
    expect(normaliseRating(0)).toBe(0);
    expect(normaliseRating(6)).toBe(0);
    expect(normaliseRating(-1)).toBe(0);
    expect(normaliseRating(null)).toBe(0);
  });
});

// ─── averagePeerRating ───────────────────────────────────────────────────────

describe('averagePeerRating', () => {
  test('averages normalised ratings correctly', () => {
    // 5→100, 3→50, 1→0 → avg = 50
    const ratings = [{ rating: 5 }, { rating: 3 }, { rating: 1 }];
    expect(averagePeerRating(ratings)).toBe(50);
  });

  test('returns 0 for empty array', () => {
    expect(averagePeerRating([])).toBe(0);
  });

  test('returns 0 for null', () => {
    expect(averagePeerRating(null)).toBe(0);
  });

  test('single 5-star rating normalises to 100', () => {
    expect(averagePeerRating([{ rating: 5 }])).toBe(100);
  });
});

// ─── computeRCI ──────────────────────────────────────────────────────────────

describe('computeRCI', () => {
  test('equal share in a group of 6 gives RCI = 1.0, C_i = 100', () => {
    // W_i = 4, W_G = 24 (6 members × 4 each), n = 6
    // RCI = 6 × (4/24) = 1.0 → C_i = 100
    const result = computeRCI(4, 24, 6);
    expect(result.rci).toBe(1.0);
    expect(result.ci).toBe(100);
  });

  test('over-contributor caps at C_i = 100', () => {
    // W_i = 20, W_G = 24, n = 6 → RCI = 5.0 → capped
    const result = computeRCI(20, 24, 6);
    expect(result.rci).toBeGreaterThan(1);
    expect(result.ci).toBe(100);
  });

  test('zero contribution gives RCI = 0, C_i = 0', () => {
    const result = computeRCI(0, 24, 6);
    expect(result.rci).toBe(0);
    expect(result.ci).toBe(0);
  });

  test('W_G = 0 (no group tasks done) gives RCI = 0, C_i = 0', () => {
    const result = computeRCI(0, 0, 6);
    expect(result.rci).toBe(0);
    expect(result.ci).toBe(0);
  });

  test('half-share in group of 4 gives C_i = 50', () => {
    // W_i = 3, W_G = 24, n = 4 → RCI = 4 × (3/24) = 0.5 → C_i = 50
    const result = computeRCI(3, 24, 4);
    expect(result.ci).toBe(50);
  });
});

// ─── calculatePEScore ────────────────────────────────────────────────────────

describe('calculatePEScore', () => {
  // Standard scenario: group of 6, all doing equal share (W_G = 24, W_i = 4 each)

  test('equal-share member with 2+ perfect 5-star ratings → PE = 100', () => {
    // C_i = 100, PQR = 100, m_i = 2 → PE = 0.70×100 + 0.30×100 = 100
    const result = calculatePEScore(4, 24, 6, [{ rating: 5 }, { rating: 5 }]);
    expect(result.peScore).toBe(100);
    expect(result.ciComponent).toBe(100);
    expect(result.peerComponent).toBe(30);
    expect(result.ratingsStatus).toBe('has_ratings');
    expect(result.ratingCount).toBe(2);
  });

  test('equal-share member with 0 ratings → PE = C_i (task_based_only, not penalised)', () => {
    // m_i = 0 < 2, fallback: PE = C_i = 100
    const result = calculatePEScore(4, 24, 6, []);
    expect(result.peScore).toBe(100);
    expect(result.peerComponent).toBe(0);
    expect(result.ratingsStatus).toBe('task_based_only');
    expect(result.ratingCount).toBe(0);
  });

  test('equal-share member with only 1 rating → still task_based_only (single rating discarded)', () => {
    // m_i = 1 < 2 → peer component NOT activated
    const result = calculatePEScore(4, 24, 6, [{ rating: 1 }]);
    expect(result.peScore).toBe(100);
    expect(result.peerComponent).toBe(0);
    expect(result.ratingsStatus).toBe('task_based_only');
  });

  test('zero contributor with 5-star peer ratings → PE = 30 (peer carries the score)', () => {
    // C_i = 0, m_i = 2, PQR = 100 → PE = 0.70×0 + 0.30×100 = 30
    const result = calculatePEScore(0, 24, 6, [{ rating: 5 }, { rating: 5 }]);
    expect(result.peScore).toBe(30);
    expect(result.ciComponent).toBe(0);
    expect(result.peerComponent).toBe(30);
  });

  test('zero contributor with no ratings → PE = 0', () => {
    const result = calculatePEScore(0, 24, 6, []);
    expect(result.peScore).toBe(0);
    expect(result.ratingsStatus).toBe('task_based_only');
  });

  test('no group tasks done anywhere → PE = 0', () => {
    // W_G = 0 → RCI = 0 → C_i = 0
    const result = calculatePEScore(0, 0, 6, [{ rating: 5 }, { rating: 5 }]);
    expect(result.peScore).toBe(30); // peer component still applies to C_i = 0
    expect(result.ciComponent).toBe(0);
  });

  test('handles undefined/null inputs gracefully', () => {
    const result = calculatePEScore(undefined, undefined, undefined, null);
    expect(result.peScore).toBe(0);
    expect(result.ratingCount).toBe(0);
  });

  test('returns rci field for transparency display', () => {
    const result = calculatePEScore(4, 24, 6, []);
    expect(result.rci).toBe(1.0);
  });

  test('mixed ratings: 3-star avg with equal contribution → correct composite', () => {
    // C_i = 100, PQR_norm = 50, m_i = 2
    // PE = 0.70×100 + 0.30×50 = 70 + 15 = 85
    const result = calculatePEScore(4, 24, 6, [{ rating: 3 }, { rating: 3 }]);
    expect(result.peScore).toBe(85);
    expect(result.ciComponent).toBe(70);
    expect(result.peerComponent).toBe(15);
  });
});

// ─── calculateAllPEScores ────────────────────────────────────────────────────

describe('calculateAllPEScores', () => {
  test('generates correct PE scores for all members in the CS map', () => {
    // Group of 3, W_G = 12:
    //   alice: W_i = 8  → RCI = 3 × (8/12) = 2.0 → C_i = 100 (capped)
    //   bob:   W_i = 4  → RCI = 3 × (4/12) = 1.0 → C_i = 100
    //   carol: W_i = 0  → RCI = 0              → C_i = 0
    const csMap = {
      alice: { completedWeight: 8,  groupDoneWeight: 12 },
      bob:   { completedWeight: 4,  groupDoneWeight: 12 },
      carol: { completedWeight: 0,  groupDoneWeight: 12 },
    };
    const ratingsMap = {
      alice: [{ rating: 4 }, { rating: 5 }], // m_i = 2 → has_ratings
      bob:   [{ rating: 3 }],               // m_i = 1 → task_based_only
      carol: [],
    };

    const result = calculateAllPEScores(csMap, ratingsMap, 3);

    // alice: C_i=100, PQR = (75+100)/2 = 87.5 → PE = 0.70×100 + 0.30×87.5 = 96.25
    expect(result.alice.peScore).toBe(96.25);
    expect(result.alice.ratingsStatus).toBe('has_ratings');

    // bob: m_i=1 → task_based_only → PE = C_i = 100
    expect(result.bob.peScore).toBe(100);
    expect(result.bob.ratingsStatus).toBe('task_based_only');

    // carol: C_i=0, no ratings → PE = 0
    expect(result.carol.peScore).toBe(0);
    expect(result.carol.ratingsStatus).toBe('task_based_only');

    expect(Object.keys(result)).toEqual(['alice', 'bob', 'carol']);
  });
});
