import { describe, test, expect } from '@jest/globals';
import {
  calculateContributionScore,
  calculateAllContributionScores,
} from '../src/core/scoringEngine.js';

describe('calculateContributionScore', () => {
  const tasks = [
    { id: '1', assignedTo: 'alice', status: 'done',        weight: 3 },
    { id: '2', assignedTo: 'alice', status: 'in-progress', weight: 2 },
    { id: '3', assignedTo: 'alice', status: 'done',        weight: 5 },
    { id: '4', assignedTo: 'bob',   status: 'done',        weight: 4 },
    { id: '5', assignedTo: 'bob',   status: 'todo',        weight: 6 },
  ];

  test('returns correct score for member with mixed statuses', () => {
    const result = calculateContributionScore(tasks, 'alice');
    // completed weight = 3+5 = 8, total = 3+2+5 = 10 → 80%
    expect(result.score).toBe(80);
    expect(result.completedWeight).toBe(8);
    expect(result.totalWeight).toBe(10);
    expect(result.completedCount).toBe(2);
    expect(result.totalCount).toBe(3);
  });

  test('returns correct score for another member', () => {
    const result = calculateContributionScore(tasks, 'bob');
    // completed weight = 4, total = 4+6 = 10 → 40%
    expect(result.score).toBe(40);
  });

  test('returns zero for member with no assigned tasks', () => {
    const result = calculateContributionScore(tasks, 'charlie');
    expect(result.score).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  test('returns zero when all assigned tasks have zero weight', () => {
    const zeroTasks = [
      { id: '1', assignedTo: 'x', status: 'done', weight: 0 },
      { id: '2', assignedTo: 'x', status: 'todo', weight: 0 },
    ];
    expect(calculateContributionScore(zeroTasks, 'x').score).toBe(0);
  });

  test('returns 100 when all tasks are done', () => {
    const allDone = [
      { id: '1', assignedTo: 'z', status: 'done', weight: 5 },
      { id: '2', assignedTo: 'z', status: 'done', weight: 3 },
    ];
    expect(calculateContributionScore(allDone, 'z').score).toBe(100);
  });

  test('handles null / undefined inputs gracefully', () => {
    expect(calculateContributionScore(null, 'a').score).toBe(0);
    expect(calculateContributionScore([], null).score).toBe(0);
    expect(calculateContributionScore(undefined, undefined).score).toBe(0);
  });

  test('handles tasks with missing weight (defaults to 0)', () => {
    const noWeight = [{ id: '1', assignedTo: 'm', status: 'done' }];
    const result = calculateContributionScore(noWeight, 'm');
    expect(result.totalWeight).toBe(0);
    expect(result.score).toBe(0);
  });
});

describe('calculateAllContributionScores', () => {
  test('returns scores for every member ID provided', () => {
    const tasks = [
      { id: '1', assignedTo: 'a', status: 'done', weight: 2 },
      { id: '2', assignedTo: 'b', status: 'todo', weight: 3 },
    ];
    const result = calculateAllContributionScores(tasks, ['a', 'b', 'c']);
    expect(result.a.score).toBe(100);
    expect(result.b.score).toBe(0);
    expect(result.c.score).toBe(0);
  });
});
