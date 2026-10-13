import { describe, test, expect } from '@jest/globals';
import {
  calculateContributionScore,
  calculateAllContributionScores,
} from '../src/core/scoringEngine.js';

/**
 * Test Suite: calculateContributionScore
 *
 * WPS formula (Chapter 3):
 *   WPS_i = (W_i / W_G) × 100
 *   where:
 *     W_i = sum of done-task weights for member i
 *     W_G = sum of done-task weights across the ENTIRE group (all members)
 *
 * Note: This is a PROPORTIONAL SHARE formula, not a personal completion-rate.
 * The denominator is group-wide done weight, NOT the member's own assigned weight.
 */
describe('calculateContributionScore', () => {
  //
  // Task fixture:
  //   alice done:  weight 3 + weight 5 = 8   (in-progress task weight 2 is NOT counted)
  //   bob done:    weight 4               = 4
  //   total group done weight W_G         = 12
  //
  const tasks = [
    { id: '1', assignedTo: 'alice', status: 'done',        weight: 3 },
    { id: '2', assignedTo: 'alice', status: 'in-progress', weight: 2 },
    { id: '3', assignedTo: 'alice', status: 'done',        weight: 5 },
    { id: '4', assignedTo: 'bob',   status: 'done',        weight: 4 },
    { id: '5', assignedTo: 'bob',   status: 'todo',        weight: 6 },
  ];

  test('returns correct WPS score for alice (done weight = 8, group done weight = 12 → 66.67%)', () => {
    const result = calculateContributionScore(tasks, 'alice');
    // W_i = 3 + 5 = 8,  W_G = 3 + 5 + 4 = 12
    // WPS = 8 / 12 × 100 = 66.67
    expect(result.score).toBe(66.67);
    expect(result.completedWeight).toBe(8);
    expect(result.groupDoneWeight).toBe(12);
    expect(result.completedCount).toBe(2);
    expect(result.totalCount).toBe(3);  // all tasks assigned to alice (done + in-progress)
  });

  test('returns correct WPS score for bob (done weight = 4, group done weight = 12 → 33.33%)', () => {
    const result = calculateContributionScore(tasks, 'bob');
    // W_i = 4,  W_G = 12
    // WPS = 4 / 12 × 100 = 33.33
    expect(result.score).toBe(33.33);
    expect(result.completedWeight).toBe(4);
    expect(result.groupDoneWeight).toBe(12);
  });

  test('scores sum to 100 across the group (proportional share property)', () => {
    const alice = calculateContributionScore(tasks, 'alice');
    const bob   = calculateContributionScore(tasks, 'bob');
    // 66.67 + 33.33 = 100.00 (within floating-point rounding)
    expect(alice.score + bob.score).toBeCloseTo(100, 1);
  });

  test('returns zero for member with no assigned tasks', () => {
    const result = calculateContributionScore(tasks, 'charlie');
    expect(result.score).toBe(0);
    expect(result.completedWeight).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  test('returns zero when all done tasks have zero weight (W_G = 0 guard)', () => {
    const zeroTasks = [
      { id: '1', assignedTo: 'x', status: 'done', weight: 0 },
      { id: '2', assignedTo: 'x', status: 'todo', weight: 0 },
    ];
    expect(calculateContributionScore(zeroTasks, 'x').score).toBe(0);
  });

  test('returns 100 when the solo member is the only one who completed tasks', () => {
    // Single member group; only z has done tasks
    const allDone = [
      { id: '1', assignedTo: 'z', status: 'done', weight: 5 },
      { id: '2', assignedTo: 'z', status: 'done', weight: 3 },
    ];
    // W_i = 8, W_G = 8 → WPS = 100%
    expect(calculateContributionScore(allDone, 'z').score).toBe(100);
  });

  test('handles null / undefined inputs gracefully without throwing', () => {
    expect(calculateContributionScore(null, 'a').score).toBe(0);
    expect(calculateContributionScore([], null).score).toBe(0);
    expect(calculateContributionScore(undefined, undefined).score).toBe(0);
  });

  test('handles tasks with missing weight property (defaults to 0)', () => {
    const noWeight = [{ id: '1', assignedTo: 'm', status: 'done' }];
    const result = calculateContributionScore(noWeight, 'm');
    // weight defaults to 0, so W_G = 0 → score = 0
    expect(result.groupDoneWeight).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ─── calculateAllContributionScores ──────────────────────────────────────────

describe('calculateAllContributionScores', () => {
  test('returns scores for every member ID provided', () => {
    const tasks = [
      { id: '1', assignedTo: 'a', status: 'done', weight: 2 },
      { id: '2', assignedTo: 'b', status: 'todo', weight: 3 },
    ];
    // W_G = 2 (only task 1 is done)
    // a: W_i = 2, W_G = 2 → score = 100
    // b: W_i = 0            → score = 0
    // c: W_i = 0            → score = 0
    const result = calculateAllContributionScores(tasks, ['a', 'b', 'c']);
    expect(result.a.score).toBe(100);
    expect(result.b.score).toBe(0);
    expect(result.c.score).toBe(0);
  });

  test('all three members splitting work equally return ~33.33% each', () => {
    const tasks = [
      { id: '1', assignedTo: 'a', status: 'done', weight: 10 },
      { id: '2', assignedTo: 'b', status: 'done', weight: 10 },
      { id: '3', assignedTo: 'c', status: 'done', weight: 10 },
    ];
    // W_G = 30, each W_i = 10 → score = 33.33
    const result = calculateAllContributionScores(tasks, ['a', 'b', 'c']);
    expect(result.a.score).toBe(33.33);
    expect(result.b.score).toBe(33.33);
    expect(result.c.score).toBe(33.33);
  });
});
