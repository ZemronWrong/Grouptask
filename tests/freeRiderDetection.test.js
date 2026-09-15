import { describe, test, expect } from '@jest/globals';
import {
  daysSinceLastCompletion,
  hasNoActiveTasks,
  detectFreeRider,
  detectAllFreeRiders,
} from '../src/core/scoringEngine.js';

describe('daysSinceLastCompletion', () => {
  test('returns 0 when task was completed just now', () => {
    const tasks = [
      { assignedTo: 'user1', status: 'done', completedAt: Date.now() },
    ];
    expect(daysSinceLastCompletion(tasks, 'user1')).toBe(0);
  });

  test('returns correct day count for older completion', () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const tasks = [
      { assignedTo: 'user1', status: 'done', completedAt: threeDaysAgo },
    ];
    expect(daysSinceLastCompletion(tasks, 'user1')).toBe(3);
  });

  test('returns Infinity when no completed tasks exist', () => {
    const tasks = [
      { assignedTo: 'user1', status: 'todo' },
    ];
    expect(daysSinceLastCompletion(tasks, 'user1')).toBe(Infinity);
  });
});

describe('hasNoActiveTasks', () => {
  test('returns true when user has no tasks or only done tasks', () => {
    const tasks = [
      { assignedTo: 'user1', status: 'done' },
      { assignedTo: 'user2', status: 'in-progress' },
    ];
    expect(hasNoActiveTasks(tasks, 'user1')).toBe(true);
  });

  test('returns false when user has in-progress or todo tasks', () => {
    const tasks = [
      { assignedTo: 'user1', status: 'in-progress' },
    ];
    expect(hasNoActiveTasks(tasks, 'user1')).toBe(false);
  });
});

describe('detectFreeRider and detectAllFreeRiders', () => {
  test('detects high risk for member with low CS, long inactivity, and no active tasks', () => {
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
    const tasks = [
      { id: '1', assignedTo: 'alice', status: 'done', weight: 5, completedAt: tenDaysAgo },
    ];
    const result = detectFreeRider({
      tasks,
      memberId: 'alice',
      memberCS: 10,
      groupAvgCS: 75,
      memberJoinedAt: fourDaysAgo,
    });
    expect(['medium', 'high']).toContain(result.risk);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test('reports none risk for active, high-contributing member', () => {
    const tasks = [
      { id: '1', assignedTo: 'bob', status: 'in-progress', weight: 3 },
      { id: '2', assignedTo: 'bob', status: 'done', weight: 5, completedAt: Date.now() },
    ];
    const result = detectFreeRider({
      tasks,
      memberId: 'bob',
      memberCS: 85,
      groupAvgCS: 70,
      memberJoinedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    });
    expect(result.risk).toBe('none');
    expect(result.reasons).toEqual([]);
  });

  test('batch evaluates all members', () => {
    const members = [
      { id: 'm1', joinedAt: Date.now() - 10000 },
      { id: 'm2', joinedAt: Date.now() - 10000 },
    ];
    const csMap = {
      m1: { score: 90 },
      m2: { score: 10 },
    };
    const result = detectAllFreeRiders([], members, csMap);
    expect(result.m1).toBeDefined();
    expect(result.m2).toBeDefined();
  });
});
