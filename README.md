# GroupTask — Gamified Group Project Manager

[![Tests](https://img.shields.io/badge/tests-209%20passed-brightgreen.svg)](https://github.com/ZemronWrong/Grouptask)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/ZemronWrong/Grouptask)
[![Architecture](https://img.shields.io/badge/architecture-Local--First%20PWA-blue.svg)]()
[![Frontend](https://img.shields.io/badge/frontend-Vanilla%20ESM%20%2B%20Vite-orange.svg)]()
[![Deploy](https://img.shields.io/badge/deploy-Vercel-black.svg)](https://grouptask-nine.vercel.app)
[![Ethics](https://img.shields.io/badge/UREB-compliant-purple.svg)]()

**GroupTask** is an offline-first Progressive Web Application (PWA) built to solve the **free-rider problem** in student group projects. It combines weighted task accountability, quantitative contribution scoring (WPS), calibrated peer evaluation, and gamification (points, badges, streaks, leaderboard) to make group work transparent and fair.

> **Live app:** [grouptask-nine.vercel.app](https://grouptask-nine.vercel.app)

---

## Features

### Core Workflow
- **Kanban board** — To Do → In Progress → Pending Approval → Completed
- **Weighted tasks** — each task has a configurable weight; heavier tasks count more toward contribution scores
- **Proof submission** — students submit a link as proof of work; admins review and approve
- **Drag-and-drop** — move cards across columns; permission rules enforced client- and server-side
- **Task deadline picker** — date + time deadlines with overdue highlighting

### Contribution & Scoring
- **Weighted Proportional Share (WPS)** — mathematically fair contribution score: your completed task weights ÷ total group completed task weights × 100
- **Free-rider detection** — internal heuristic flags members below configurable threshold (admin-only, never shown to students per UREB)
- **Board Points (BP)** — gamification currency earned from task approvals, streaks, and activities
- **Peer Evaluation (PE)** — private 1–5 star ratings + written feedback; combined with WPS for composite score

### Gamification
- **Leaderboard** — ranked by Board Points with gold/silver/bronze medals; individual WPS and PE score visible to yourself only
- **Badges** — unlock achievements (First Task, Streak, Top Contributor, etc.)
- **Streak tracking** — daily activity streaks
- **Reputation system** — aggregated from peer evaluation ratings

### People & Access
- **Roles:** Owner → Co-Admin → Member → Viewer
- **Join Mode** — owner toggles between *Auto-join* (code → instant member) and *Require Approval* (code → join request queue)
- **Share modal** — manage member roles; admins can't promote themselves
- **Profile photos** — custom avatars shown on cards, leaderboard, team page, and peer evaluation

### Privacy & Ethics (UREB Compliant)
- Peer review comments and individual PE scores are **never shown to other students**
- `scoresHidden` group flag — researcher can hide all leaderboard scores during study phases
- Firestore security rules enforce all privacy constraints server-side
- No Google Analytics (removed)
- Audit log of all task state changes

### Technical
- **Offline-first** — IndexedDB is the primary store; the app works fully without internet
- **Sync queue** — writes are queued locally and flushed to Firestore within 500ms on reconnect
- **Conflict resolution** — last-write-wins with timestamp comparison (`conflictResolver.js`)
- **Real-time** — Firestore `onSnapshot` listeners push changes to all connected clients instantly
- **PWA** — installable, service worker for offline asset caching
- **CSV export** — admin-only export of all task data for research analysis

---

## Architecture

```
src/
├── core/            ← Pure functions — no DOM, no network. 100% unit tested.
│   ├── scoringEngine.js         (WPS formula)
│   ├── peerEvaluationEngine.js  (PE composite score)
│   ├── badgeEngine.js           (badge unlock conditions)
│   ├── reputationEngine.js      (peer rating → reputation)
│   ├── eventEngine.js           (activity event → Board Points)
│   └── gamificationEngine.js    (coordinates all engines)
│
├── services/        ← All I/O lives here — DB reads/writes, sync, auth.
│   ├── syncService.js           (IndexedDB ↔ Firestore bridge)
│   ├── taskService.js           (task CRUD + gamification trigger)
│   ├── authService.js           (Firebase Auth wrapper)
│   ├── memberService.js         (join, leave, kick, join-by-code)
│   ├── conflictResolver.js      (offline merge strategy)
│   └── indexedDBService.js      (IDB schema v5, CRUD helpers)
│
├── features/        ← Screen modules — each owns its HTML, events, layout.
│   ├── tasks/       (TaskBoard + 8 focused sub-modules)
│   ├── dashboard/   (Dashboard, Leaderboard, Peer Evaluation)
│   ├── auth/        (Login, Register, Welcome)
│   ├── members/     (Team page)
│   ├── profile/     (Profile, Settings)
│   └── audit/       (Audit History)
│
├── utils/           ← Pure helpers — formatters, validators, CSV, etc.
├── assets/          ← SVG icon system (Lucide), styles, badge icons
└── config/          ← Firebase config, Firestore client
```

**Data flow:**
```
UI Action → taskService / memberService
           → IndexedDB (write)
           → addToSyncQueue()
           → syncService flushes to Firestore (≤500ms)
           → onSnapshot listeners update other clients
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript ES Modules |
| Bundler | Vite 8 |
| Database (local) | IndexedDB (schema v5) |
| Database (cloud) | Cloud Firestore |
| Auth | Firebase Authentication (Email + Google) |
| Hosting | Vercel (auto-deploy from `main`) |
| Testing | Jest 29 + fake-indexeddb |
| Charts | Chart.js 4 |
| Date picker | hwangti/vanillajs-datetimepicker (CDN) |
| Icons | Lucide SVG (self-hosted) |

---

## Getting Started

### Prerequisites
- Node.js 20+
- A modern browser (Chrome, Firefox, Edge, Safari)

### Install & Run (Mock Mode — no Firebase needed)

```bash
git clone https://github.com/ZemronWrong/Grouptask.git
cd Grouptask
npm install
npm run dev
```

Open `http://localhost:5173`. The app runs fully offline using IndexedDB and simulated authentication — no Firebase account needed for local development.

### Run Tests

```bash
npm test
```

209 unit tests across 16 suites covering scoring, peer evaluation, gamification, badge unlock, and free-rider detection.

### Production Build

```bash
npm run build   # outputs to dist/
npm run preview # preview the production build locally
```

---

## Deployment (Vercel)

### 1. Set Environment Variables

In your Vercel project → **Settings → Environment Variables**, add:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

> **Do NOT set** `VITE_FIREBASE_MEASUREMENT_ID` — Google Analytics is intentionally removed (UREB A5).

After adding variables, redeploy from the Vercel dashboard.

### 2. Enable Firebase Auth Providers

Firebase Console → **Authentication → Sign-in method**, enable:
- ✅ Email/Password
- ✅ Google

Add your Vercel domain (e.g. `grouptask-nine.vercel.app`) to **Authorized domains**.

### 3. Deploy Firestore Security Rules

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

Or paste the contents of `firestore.rules` into Firebase Console → **Firestore → Rules**.

### 4. Push to GitHub

Vercel auto-deploys every push to `main`. Connect your repo at [vercel.com/new](https://vercel.com/new).

---

## Firestore Security Rules

`firestore.rules` enforces the following at the database level:

| Rule | Detail |
|---|---|
| Default-deny | No access unless explicitly granted |
| Group membership | Users can only read/write data in groups they belong to |
| Peer review privacy | Only the reviewer can read their own submission (UREB A1) |
| No self-approval | Students cannot approve their own task submissions |
| Weight integrity | Admins cannot change the weight of tasks assigned to themselves |
| Score visibility | `scoresHidden` field is write-locked — only changeable via Firebase Console |
| Join requests | Any authenticated user can create a join request; only admins approve |

---

## UREB Ethics Compliance

This app is deployed in an active academic research study (UREB-209-2026). All compliance items are implemented and must not be removed:

| Item | Status | Implementation |
|---|---|---|
| A1 — Peer review privacy | ✅ | Firestore rule: only reviewer reads own submission |
| A2 — Score visibility | ✅ | WPS/PE shown only to yourself; leaderboard shows Board Points only |
| A3 — No risk labels | ✅ | Free-rider labels removed from UI; detection is internal/admin-only |
| A4 — scoresHidden | ✅ | Researcher can hide all scores; field is write-locked via rules |
| A5 — No analytics | ✅ | `getAnalytics` removed from `firebaseConfig.js` |
| A6 — CSV export | ✅ | Admin-only task data export for research analysis |
| A7 — Security rule tests | ✅ | 10 Firestore rule test cases in `tests/firestoreRules.test.js` |
| A8 — Setup checklist | ✅ | `FIREBASE_SETUP.md` for researchers |

---

## Project Structure

```
GroupTask/
├── src/
│   ├── assets/
│   │   ├── icons/           # Lucide SVG icon system
│   │   └── styles/          # styles.css (vanilla CSS, no Tailwind)
│   ├── config/              # Firebase config, Firestore client
│   ├── core/                # Pure algorithmic engines (unit tested)
│   ├── features/
│   │   ├── audit/           # Audit history page
│   │   ├── auth/            # Login, Register, Welcome pages
│   │   ├── dashboard/       # Dashboard, Leaderboard, Peer Evaluation
│   │   ├── members/         # Team page
│   │   ├── profile/         # Profile, Settings
│   │   └── tasks/           # Kanban board + 8 sub-modules
│   ├── lib/                 # indexedDB.js (schema)
│   ├── services/            # All I/O: auth, sync, DB, notifications
│   └── utils/               # Formatters, validators, CSV, helpers
├── tests/                   # Jest unit tests + Firestore rule tests
├── firestore.rules           # Production Firestore security rules
├── FIREBASE_SETUP.md         # Researcher setup checklist (UREB A8)
├── vercel.json               # Vercel deployment config
├── vite.config.js            # Vite bundler config
├── jest.config.js            # Jest config (Node VM + ESM)
└── package.json
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (hot reload) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build locally |
| `npm test` | Run 209 unit tests with Jest |
| `npm run test:rules` | Run Firestore security rule tests (requires Java 21 + Firebase Emulator) |

---

## Contributing / Research Team

This codebase supports an active ethics-approved research study. Before making any changes that affect what the consent form or UREB submission describes, notify the co-researcher (Lemuel).

**Constraints:**
- No Tailwind CSS — vanilla CSS only
- No Google Analytics — `VITE_FIREBASE_MEASUREMENT_ID` must not be set
- All UREB A1–A8 items must remain intact
- No breaking changes to scoring formulas without updating the research paper

---

## License

Academic research project — all rights reserved.
