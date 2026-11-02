# Firebase Console Setup Checklist (A8 — UREB Requirements)

> Complete the following steps before any participant uses the app.
> Check each item off and record the date/initials when done.

---

## 1. Access Control

- [ ] **Two-step verification (2FA)** enabled on every Google account that has access to the Firebase project. Check: Google Account → Security → 2-Step Verification.
- [ ] Only the **three researchers** appear under Firebase console → Project Settings → Users and Permissions. Remove any others.

---

## 2. Database Location

- [ ] Verify Firestore is in **`asia-southeast1` (Singapore)**. Check: Firebase console → Firestore → Usage → Database location.
- [ ] If a separate project is used for the study, create it in `asia-southeast1` before initialising Firestore.

---

## 3. Firestore Security Rules

Publish the rules **after every deployment** that changes `firestore.rules`:

**Option A — Firebase CLI (recommended):**
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

**Option B — Firebase console:**
1. Open Firebase console → Firestore → Rules.
2. Copy-paste the contents of `firestore.rules`.
3. Click **Publish**.

- [ ] Rules published and verified in the console.

---

## 4. Run Security Rules Tests Before Participant Use

```bash
cd GroupTask
npx jest tests/firestoreRules.test.js --verbose
```

All 10 test cases must pass. Do not proceed if any fail.

- [ ] All 10 rules tests passing (record date: __________ / initials: ____)

---

## 5. Analytics

- [ ] `VITE_FIREBASE_MEASUREMENT_ID` is **not** set in Vercel environment variables (or set to empty string). Check: Vercel → Project → Settings → Environment Variables.
- [ ] Confirm `firebaseConfig.js` does not import or initialise `getAnalytics`.

---

## 6. Separate Study Project (Recommended)

Using a dedicated Firebase project for the study makes end-of-study data deletion trivial (delete the project).

- [ ] Decide: shared project or dedicated study project.
- [ ] If dedicated: create new Firebase project → Firestore in `asia-southeast1` → deploy rules → update Vercel env vars.

---

## 7. Participant Withdrawal Procedure

No additional code is required. To deactivate a participant's account:

1. Firebase console → Authentication → Users → find the participant's email → **Disable account**.
2. The app will redirect the disabled user to the login page with an error message (Firebase handles this automatically).
3. To export the group's task list so they can continue without the app: **the group owner uses the "Export Tasks CSV" button** on the task board.

- [ ] Withdrawal procedure understood and communicated to all researchers.

---

## 8. Data Disposal (End of Study)

Per the consent form and UREB application:

- Export all data needed for analysis before disposal.
- Delete the Firebase project (or all Firestore collections and Authentication users) after the retention period.
- [ ] Data disposal date agreed upon: __________

---

*Document version: 2026-11-01. Update if the app behaviour changes before the study.*

