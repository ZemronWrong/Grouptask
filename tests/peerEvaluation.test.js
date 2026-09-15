import { describe, test, expect } from '@jest/globals';
import {
  normaliseRating,
  averagePeerRating,
  calculatePEScore,
  calculateAllPEScores,
} from '../src/core/peerEvaluationEngine.js';

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

describe('averagePeerRating', () => {
  test('averages normalised ratings correctly', () => {
    // ratings: 5→100, 3→50, 1→0 → avg = 50
    const ratings = [{ rating: 5 }, { rating: 3 }, { rating: 1 }];
    expect(averagePeerRating(ratings)).toBe(50);
  });

  test('returns 0 for empty array', () => {
    expect(averagePeerRating([])).toBe(0);
  });

  test('returns 0 for null', () => {
    expect(averagePeerRating(null)).toBe(0);
  });
});

describe('calculatePEScore', () => {
  test('weights CS at 70% and peer at 30% when ratings exist', () => {
    // CS=80, peerAvg=100 → 80*0.7 + 100*0.3 = 56 + 30 = 86
    const result = calculatePEScore(80, [{ rating: 5 }, { rating: 5 }]);
    expect(result.peScore).toBe(86);
    expect(result.csComponent).toBe(56);
    expect(result.peerComponent).toBe(30);
    expect(result.hasRatings).toBe(true);
  });

  test('uses only CS component when no ratings exist', () => {
    const result = calculatePEScore(80, []);
    expect(result.peScore).toBe(56);
    expect(result.peerComponent).toBe(0);
    expect(result.hasRatings).toBe(false);
  });

  test('handles zero CS with ratings', () => {
    const result = calculatePEScore(0, [{ rating: 5 }]);
    expect(result.peScore).toBe(30);
    expect(result.csComponent).toBe(0);
  });

  test('handles non-numeric CS gracefully', () => {
    const result = calculatePEScore(undefined, []);
    expect(result.peScore).toBe(0);
  });
});

describe('calculateAllPEScores', () => {
  test('generates PE scores for all members in the CS map', () => {
    const csMap = {
      alice: { score: 100 },
      bob:   { score: 40 },
    };
    const ratingsMap = {
      alice: [{ rating: 4 }, { rating: 5 }],
      bob:   [],
    };
    const result = calculateAllPEScores(csMap, ratingsMap);

    expect(result.alice.peScore).toBeGreaterThan(0);
    expect(result.bob.hasRatings).toBe(false);
    expect(Object.keys(result)).toEqual(['alice', 'bob']);
  });
});
