import { describe, test, expect } from '@jest/globals';
import {
  calculatePoints,
  buildLeaderboard,
  evaluateBadges,
  findMostImproved,
} from '../src/core/gamificationEngine.js';

describe('calculatePoints', () => {
  const tasks = [
    { assignedTo: 'a', status: 'done', weight: 3 },
    { assignedTo: 'a', status: 'done', weight: 5 },
    { assignedTo: 'a', status: 'todo', weight: 2 },
    { assignedTo: 'b', status: 'done', weight: 4 },
  ];

  test('sums weight×10 for completed tasks only', () => {
    expect(calculatePoints(tasks, 'a')).toBe(80); // (3+5)*10
  });

  test('returns 0 for member with no completed tasks', () => {
    expect(calculatePoints(tasks, 'c')).toBe(0);
  });

  test('handles null inputs', () => {
    expect(calculatePoints(null, 'a')).toBe(0);
    expect(calculatePoints(tasks, null)).toBe(0);
  });
});

describe('buildLeaderboard', () => {
  test('sorts by points descending and assigns ranks', () => {
    const tasks = [
      { assignedTo: 'a', status: 'done', weight: 2 },
      { assignedTo: 'b', status: 'done', weight: 5 },
    ];
    const board = buildLeaderboard(tasks, ['a', 'b'], { a: 'Alice', b: 'Bob' });
    expect(board[0].memberId).toBe('b');
    expect(board[0].rank).toBe(1);
    expect(board[1].rank).toBe(2);
  });

  test('handles members with no tasks', () => {
    const board = buildLeaderboard([], ['a'], { a: 'Alice' });
    expect(board[0].points).toBe(0);
    expect(board[0].rank).toBe(1);
  });
});

describe('evaluateBadges', () => {
  test('awards First Blood after 1 completed task', () => {
    const tasks = [{ assignedTo: 'a', status: 'done', weight: 1 }];
    const badges = evaluateBadges(tasks, 'a', []);
    expect(badges.some((b) => b.id === 'first_task')).toBe(true);
  });

  test('does not re-award existing badges', () => {
    const tasks = [{ assignedTo: 'a', status: 'done', weight: 1 }];
    const badges = evaluateBadges(tasks, 'a', ['first_task']);
    expect(badges.some((b) => b.id === 'first_task')).toBe(false);
  });

  test('awards Heavy Lifter for weight ≥ 8', () => {
    const tasks = [{ assignedTo: 'a', status: 'done', weight: 8 }];
    const badges = evaluateBadges(tasks, 'a', []);
    expect(badges.some((b) => b.id === 'high_weight')).toBe(true);
  });

  test('awards On a Roll after 5 tasks', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      assignedTo: 'a', status: 'done', weight: 1,
    }));
    const badges = evaluateBadges(tasks, 'a', []);
    expect(badges.some((b) => b.id === 'five_tasks')).toBe(true);
  });
});

describe('findMostImproved', () => {
  test('identifies the member with the largest CS jump', () => {
    const prev    = { a: 20, b: 50 };
    const current = { a: 80, b: 60 };
    expect(findMostImproved(prev, current)).toBe('a'); // +60 vs +10
  });

  test('returns null when nobody improved', () => {
    const prev    = { a: 80 };
    const current = { a: 70 };
    expect(findMostImproved(prev, current)).toBeNull();
  });
});
