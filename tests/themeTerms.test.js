import { describe, test, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import {
  TERMS, BOARD_THEMES, DEFAULT_BOARD_THEME, normalizeBoardTheme,
  getBoardTheme, getTerm, getRoleName, getApproversPhrase,
} from '../src/services/themeService.js';

// ─── F2: plain wording by default ────────────────────────────────────────────

describe('standard term set', () => {
  test('is the default board theme', () => {
    expect(DEFAULT_BOARD_THEME).toBe('standard');
    // No saved setting (no localStorage under Jest) → standard
    expect(getBoardTheme()).toBe('standard');
  });

  test('uses the plain words from the paper, tutorial and welcome page', () => {
    expect(TERMS.standard).toMatchObject({
      owner: 'Leader',
      coAdmin: 'Co-leader',
      member: 'Member',
      taskBoard: 'Task Board',
      task: 'Task',
      addQuest: '+ Add task',
      acceptTask: 'Accept task',
      submitProof: 'Submit for approval',
      reviewProof: 'Review submission',
      rewardLabel: 'Points',
      newGroup: 'Create group',
      joinGroup: 'Join group',
      myGroups: 'My groups',
      myRole: 'My role',
      todoColumn: 'To Do',
    });
  });

  test('getTerm and getRoleName return the standard words', () => {
    expect(getTerm('addQuest')).toBe('+ Add task');
    expect(getRoleName('owner')).toBe('Leader');
    expect(getRoleName('co-admin')).toBe('Co-leader');
    expect(getRoleName('member')).toBe('Member');
    expect(getRoleName('viewer')).toBe('Viewer');
    expect(getApproversPhrase()).toBe('leader or co-leader');
  });

  test('has no Guild, Quest or Gold wording', () => {
    Object.values(TERMS.standard).forEach((v) => expect(v).not.toMatch(/guild|quest|gold/i));
  });
});

describe('optional themes', () => {
  test('Guild and School are still available', () => {
    expect(BOARD_THEMES).toEqual(['standard', 'guild', 'school']);
  });

  test('every theme defines the same terms, so none falls back to a raw key', () => {
    const keys = Object.keys(TERMS.standard).sort();
    for (const theme of BOARD_THEMES) expect(Object.keys(TERMS[theme]).sort()).toEqual(keys);
  });

  test('an unknown or missing saved theme falls back to standard', () => {
    expect(normalizeBoardTheme(null)).toBe('standard');
    expect(normalizeBoardTheme('pirate')).toBe('standard');
    expect(normalizeBoardTheme('guild')).toBe('guild');
  });
});

describe('no "grade" wording anywhere (consent form: nothing is graded)', () => {
  const GRADE = /\bgrad(e|ed|es|ing)\b/i;

  test('no theme uses it', () => {
    for (const theme of BOARD_THEMES) {
      Object.values(TERMS[theme]).forEach((v) => expect(v).not.toMatch(GRADE));
    }
    expect(TERMS.school.reviewProof).toBe('Review submission');
  });

  test('no screen or service source uses it', () => {
    const root = new URL('../src/', import.meta.url);
    const files = [];
    const walk = (dir) => readdirSync(dir).forEach((name) => {
      const p = new URL(name, dir);
      if (statSync(p).isDirectory()) walk(new URL(`${name}/`, dir));
      else if (name.endsWith('.js')) files.push(p);
    });
    ['features/', 'services/', 'utils/'].forEach((d) => walk(new URL(d, root)));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) expect([f.pathname, readFileSync(f, 'utf8').match(GRADE)?.[0]]).toEqual([f.pathname, undefined]);
  });
});
