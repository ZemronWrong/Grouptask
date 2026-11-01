/**
 * tests/firestoreRules.test.js
 * Firestore Security Rules — Jest integration tests
 * Uses @firebase/rules-unit-testing v3 (no emulator binary required).
 * Run:  npx jest tests/firestoreRules.test.js --verbose
 * Setup: npm install --save-dev @firebase/rules-unit-testing@^3.0.0
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../firestore.rules');
const rulesContent = readFileSync(RULES_PATH, 'utf8');

const GROUP_ID     = 'group1';
const OWNER_UID    = 'uid-owner';
const CO_ADMIN_UID = 'uid-coadmin';
const MEMBER_UID   = 'uid-member';
const OTHER_UID    = 'uid-other';
const VIEWER_UID   = 'uid-viewer';   // NO members doc
const OUTSIDER_UID = 'uid-outsider'; // not in group
const MEMBER_CID   = `${GROUP_ID}_${MEMBER_UID}`;
const OTHER_CID    = `${GROUP_ID}_${OTHER_UID}`;
const CO_ADMIN_CID = `${GROUP_ID}_${CO_ADMIN_UID}`;
const OWNER_CID    = `${GROUP_ID}_${OWNER_UID}`;
const VALID_INVITE = 'INVITE-XYZ';
const WRONG_INVITE = 'WRONG-CODE';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'grouptask-rules-test',
    firestore: {
      rules: rulesContent,
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });
afterEach(async () => { await testEnv.clearFirestore(); });

async function seed(callback) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await callback(ctx.firestore());
  });
}

function authedDb(uid) { return testEnv.authenticatedContext(uid).firestore(); }
function unauthDb()    { return testEnv.unauthenticatedContext().firestore(); }

async function seedGroupAndMembers() {
  await seed(async (db) => {
    await db.collection('groups').doc(GROUP_ID).set({
      createdBy: OWNER_UID, inviteCode: VALID_INVITE, scoresHidden: false,
    });
    await db.collection('members').doc(`${GROUP_ID}_${OWNER_UID}`).set({ uid: OWNER_UID, groupId: GROUP_ID, role: 'owner' });
    await db.collection('members').doc(`${GROUP_ID}_${CO_ADMIN_UID}`).set({ uid: CO_ADMIN_UID, groupId: GROUP_ID, role: 'co-admin' });
    await db.collection('members').doc(`${GROUP_ID}_${MEMBER_UID}`).set({ uid: MEMBER_UID, groupId: GROUP_ID, role: 'member' });
    await db.collection('members').doc(`${GROUP_ID}_${OTHER_UID}`).set({ uid: OTHER_UID, groupId: GROUP_ID, role: 'member' });
    // VIEWER_UID intentionally has NO members doc
  });
}

// Case 1 — member cannot read another member's peer review
describe("Case 1 — member cannot read another member's peer review", () => {
  beforeEach(async () => {
    await seedGroupAndMembers();
    await seed(async (db) => {
      await db.collection('peerReviews').doc('review1').set({ groupId: GROUP_ID, reviewerId: OTHER_UID, evaluateeId: MEMBER_CID, score: 4 });
    });
  });
  test('reviewer CAN read their own review', async () => {
    await assertSucceeds(authedDb(OTHER_UID).collection('peerReviews').doc('review1').get());
  });
  test('different member CANNOT read the review', async () => {
    await assertFails(authedDb(MEMBER_UID).collection('peerReviews').doc('review1').get());
  });
  test("even the group owner CANNOT read another reviewer's review", async () => {
    await assertFails(authedDb(OWNER_UID).collection('peerReviews').doc('review1').get());
  });
});

// Case 2 — member cannot submit a self-review
describe('Case 2 — member cannot submit a self-review', () => {
  beforeEach(seedGroupAndMembers);
  test('MEMBER_UID CANNOT create a peerReview where evaluateeId is their own composite ID', async () => {
    await assertFails(authedDb(MEMBER_UID).collection('peerReviews').doc('self-review').set({ groupId: GROUP_ID, reviewerId: MEMBER_UID, evaluateeId: MEMBER_CID, score: 5 }));
  });
  test('MEMBER_UID CAN review a different group member', async () => {
    await assertSucceeds(authedDb(MEMBER_UID).collection('peerReviews').doc('valid-review').set({ groupId: GROUP_ID, reviewerId: MEMBER_UID, evaluateeId: OTHER_CID, score: 4 }));
  });
});

// Case 3 — member cannot self-approve (set status=done)
describe('Case 3 — member cannot self-approve', () => {
  beforeEach(async () => {
    await seedGroupAndMembers();
    await seed(async (db) => { await db.collection('tasks').doc('task1').set({ groupId: GROUP_ID, status: 'pending-approval', assignedTo: MEMBER_CID, weight: 100 }); });
  });
  test('MEMBER_UID CANNOT update status to "done"', async () => {
    await assertFails(authedDb(MEMBER_UID).collection('tasks').doc('task1').update({ status: 'done' }));
  });
  test('MEMBER_UID CAN update status to "in-progress"', async () => {
    await assertSucceeds(authedDb(MEMBER_UID).collection('tasks').doc('task1').update({ status: 'in-progress', weight: 100 }));
  });
});

// Case 4 — member cannot change task weight
describe('Case 4 — member cannot change task weight', () => {
  beforeEach(async () => {
    await seedGroupAndMembers();
    await seed(async (db) => { await db.collection('tasks').doc('task-weight').set({ groupId: GROUP_ID, status: 'in-progress', assignedTo: MEMBER_CID, weight: 100 }); });
  });
  test('MEMBER_UID CANNOT update weight on own task', async () => {
    await assertFails(authedDb(MEMBER_UID).collection('tasks').doc('task-weight').update({ status: 'in-progress', weight: 200 }));
  });
  test('MEMBER_UID CAN update status without changing weight', async () => {
    await assertSucceeds(authedDb(MEMBER_UID).collection('tasks').doc('task-weight').update({ status: 'todo', weight: 100 }));
  });
  test('owner CAN change weight on task NOT assigned to themselves', async () => {
    await assertSucceeds(authedDb(OWNER_UID).collection('tasks').doc('task-weight').update({ status: 'in-progress', weight: 150 }));
  });
});

// Case 5 — member cannot edit task assigned to someone else
describe('Case 5 — member cannot edit task assigned to another member', () => {
  beforeEach(async () => {
    await seedGroupAndMembers();
    await seed(async (db) => { await db.collection('tasks').doc('task-other').set({ groupId: GROUP_ID, status: 'in-progress', assignedTo: OTHER_CID, weight: 100 }); });
  });
  test('MEMBER_UID CANNOT update task assigned to OTHER_UID', async () => {
    await assertFails(authedDb(MEMBER_UID).collection('tasks').doc('task-other').update({ status: 'todo', weight: 100 }));
  });
  test('OTHER_UID CAN update their own task', async () => {
    await assertSucceeds(authedDb(OTHER_UID).collection('tasks').doc('task-other').update({ status: 'todo', weight: 100 }));
  });
});

// Case 6 — non-member viewer cannot self-assign unassigned task
describe('Case 6 — non-member viewer cannot self-assign an unassigned task', () => {
  beforeEach(async () => {
    await seedGroupAndMembers();
    await seed(async (db) => { await db.collection('tasks').doc('task-unassigned').set({ groupId: GROUP_ID, status: 'todo', assignedTo: null, weight: 100 }); });
  });
  test('VIEWER_UID (no members doc) CANNOT self-assign', async () => {
    const viewerCid = `${GROUP_ID}_${VIEWER_UID}`;
    await assertFails(authedDb(VIEWER_UID).collection('tasks').doc('task-unassigned').update({ assignedTo: viewerCid, status: 'in-progress', weight: 100 }));
  });
  test('real member CAN self-assign the unassigned task', async () => {
    await assertSucceeds(authedDb(MEMBER_UID).collection('tasks').doc('task-unassigned').update({ assignedTo: MEMBER_CID, status: 'in-progress', weight: 100 }));
  });
});

// Case 7 — non-member cannot read group tasks
describe('Case 7 — non-member cannot read group tasks', () => {
  beforeEach(async () => {
    await seedGroupAndMembers();
    await seed(async (db) => { await db.collection('tasks').doc('task-read').set({ groupId: GROUP_ID, status: 'todo', assignedTo: null, weight: 100 }); });
  });
  test('OUTSIDER_UID CANNOT read task', async () => {
    await assertFails(authedDb(OUTSIDER_UID).collection('tasks').doc('task-read').get());
  });
  test('unauthenticated user CANNOT read task', async () => {
    await assertFails(unauthDb().collection('tasks').doc('task-read').get());
  });
  test('MEMBER_UID CAN read task', async () => {
    await assertSucceeds(authedDb(MEMBER_UID).collection('tasks').doc('task-read').get());
  });
});

// Case 8 — cannot join without valid invite code
describe('Case 8 — cannot join a group without valid invite code', () => {
  const NEW_UID = 'uid-newuser';
  beforeEach(seedGroupAndMembers);
  test('NEW_UID CANNOT join with wrong invite code', async () => {
    await assertFails(authedDb(NEW_UID).collection('members').doc(`${GROUP_ID}_${NEW_UID}`).set({ uid: NEW_UID, groupId: GROUP_ID, role: 'member', inviteCode: WRONG_INVITE }));
  });
  test('NEW_UID CANNOT join with no invite code', async () => {
    await assertFails(authedDb(NEW_UID).collection('members').doc(`${GROUP_ID}_${NEW_UID}`).set({ uid: NEW_UID, groupId: GROUP_ID, role: 'member' }));
  });
  test('NEW_UID CAN join with correct invite code', async () => {
    await assertSucceeds(authedDb(NEW_UID).collection('members').doc(`${GROUP_ID}_${NEW_UID}`).set({ uid: NEW_UID, groupId: GROUP_ID, role: 'member', inviteCode: VALID_INVITE }));
  });
});

// Case 9 — co-admin can approve task not assigned to themselves
describe('Case 9 — co-admin can approve task not assigned to themselves', () => {
  beforeEach(async () => {
    await seedGroupAndMembers();
    await seed(async (db) => { await db.collection('tasks').doc('task-approve').set({ groupId: GROUP_ID, status: 'pending-approval', assignedTo: MEMBER_CID, weight: 100 }); });
  });
  test('CO_ADMIN_UID CAN set status=done on task NOT assigned to them', async () => {
    await assertSucceeds(authedDb(CO_ADMIN_UID).collection('tasks').doc('task-approve').update({ status: 'done', weight: 100 }));
  });
  test('CO_ADMIN_UID CANNOT set status=done on task assigned to themselves', async () => {
    await seed(async (db) => { await db.collection('tasks').doc('task-approve').set({ groupId: GROUP_ID, status: 'pending-approval', assignedTo: CO_ADMIN_CID, weight: 100 }); });
    await assertFails(authedDb(CO_ADMIN_UID).collection('tasks').doc('task-approve').update({ status: 'done', weight: 100 }));
  });
  test('OWNER_UID CAN approve task assigned to CO_ADMIN_UID', async () => {
    await seed(async (db) => { await db.collection('tasks').doc('task-approve').set({ groupId: GROUP_ID, status: 'pending-approval', assignedTo: CO_ADMIN_CID, weight: 100 }); });
    await assertSucceeds(authedDb(OWNER_UID).collection('tasks').doc('task-approve').update({ status: 'done', weight: 100 }));
  });
});

// Case 10 — member cannot set scoresHidden on group document
describe('Case 10 — member cannot set scoresHidden on group document', () => {
  beforeEach(seedGroupAndMembers);
  test('MEMBER_UID CANNOT update scoresHidden', async () => {
    await assertFails(authedDb(MEMBER_UID).collection('groups').doc(GROUP_ID).update({ scoresHidden: true }));
  });
  test('OWNER_UID CANNOT set scoresHidden (A4 restriction)', async () => {
    await assertFails(authedDb(OWNER_UID).collection('groups').doc(GROUP_ID).update({ scoresHidden: true }));
  });
  test('OWNER_UID CAN update other fields', async () => {
    await assertSucceeds(authedDb(OWNER_UID).collection('groups').doc(GROUP_ID).update({ name: 'Updated Group Name' }));
  });
  test('MEMBER_UID CAN update only joinRequests and updatedAt', async () => {
    await assertSucceeds(authedDb(MEMBER_UID).collection('groups').doc(GROUP_ID).update({ joinRequests: [MEMBER_UID], updatedAt: new Date().toISOString() }));
  });
});

