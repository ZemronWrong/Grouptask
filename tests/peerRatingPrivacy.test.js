import { describe, test, expect } from '@jest/globals';
import { calculateReputation, countsTowardReputation, REP_DELTAS } from '../src/core/reputationEngine.js';
import { evaluateBoardBadges } from '../src/core/badgeEngine.js';

// E2a: a peer rating must not change anything other group members can see.

describe('reputation ignores peer ratings', () => {
  test('legacy peer-eval events in the ledger do not count', () => {
    const events = [
      { userId: 'u1', eventType: 'card_complete',           repDelta: 5 },
      { userId: 'u1', eventType: 'peer_eval_received_low',  repDelta: -20 },
      { userId: 'u1', eventType: 'peer_eval_received_high', repDelta: 15 },
    ];
    expect(calculateReputation(events, 'u1')).toBe(5);
  });

  test('a single low rating can no longer push reputation below zero', () => {
    const events = [{ userId: 'u1', eventType: 'peer_eval_received_low', repDelta: -20 }];
    expect(calculateReputation(events, 'u1')).toBe(0);
  });

  test('other event types still count', () => {
    expect(countsTowardReputation({ eventType: 'card_complete' })).toBe(true);
    expect(countsTowardReputation({ eventType: 'peer_eval_received_high' })).toBe(false);
  });

  test('there are no peer-eval reputation deltas left', () => {
    expect(Object.keys(REP_DELTAS).some((k) => k.startsWith('peer_eval'))).toBe(false);
  });
});

describe('Team Player badge cannot leak a reviewer rating', () => {
  const ctx = {
    memberId: 'g1_u1',
    reputation: 10,
    tasks: [],
    proofs: [],
    contributionScore: 0,
    completedCount: 0,
    reviewCount: 0,
    existingBadgeIds: [],
  };

  test('is not awarded without a peer score', () => {
    const ids = evaluateBoardBadges({ ...ctx, avgPeerScore: null }).map((b) => b.id);
    expect(ids).not.toContain('team_player');
  });

  test('still works if a real aggregate is ever supplied', () => {
    const ids = evaluateBoardBadges({ ...ctx, avgPeerScore: 4.5 }).map((b) => b.id);
    expect(ids).toContain('team_player');
  });
});
