# GroupTask: A Gamified Peer-Evaluation System for Cooperative Learning

[![Tests](https://img.shields.io/badge/tests-33%20passed-brightgreen.svg)](https://github.com/ZemronWrong/Grouptask)
[![Platform](https://img.shields.io/badge/architecture-Local--First%20PWA-blue.svg)]()
[![Framework](https://img.shields.io/badge/frontend-Vanilla%20ESM%20%2B%20Vite-orange.svg)]()
[![Deploy](https://img.shields.io/badge/deploy-Vercel-black.svg)](https://vercel.com)

**GroupTask** is an offline-first Progressive Web Application (PWA) engineered to mitigate the "free-rider" problem in student group projects. It combines objective task accountability, quantitative contribution scoring, calibrated peer reviews, and behavioral gamification mechanics to establish transparent and equitable academic collaboration.

---

## 1. System Architecture

GroupTask is architected around a **Local-First, Cloud-Synced** pattern with a **single persistence system** — the custom IndexedDB sync queue — as the sole offline manager. Firestore's built-in `enableIndexedDbPersistence` is intentionally disabled to prevent race conditions between two competing write paths.

```
                  ┌──────────────────────────────────────────────┐
                  │              Browser Runtime                 │
                  │                                              │
                  │   UI Views (src/features/)                   │
                  │      │                                       │
                  │      ▼                                       │
                  │   Algorithmic Engines (src/core/)            │
                  │   • Scoring • Peer Eval • Gamification       │
                  │   • Event Engine • Reputation • Badges       │
                  │      │                                       │
                  │      ▼                                       │
                  │   Storage & Mutation Dispatcher              │
                  │      │                                       │
                  │   IndexedDB (Local Source of Truth)          │
                  │   (DB_VERSION = 5 — includes EVENTS store)   │
                  │      │                                       │
                  │      ▼                                       │
                  │   Sync Queue (Mutation Outbox)               │
                  │   Triggers flush on every local change       │
                  │   (500ms debounce, batched)                  │
                  └──────┬───────────────────────────────────────┘
                         │
                    Online Event — serverTimestamp() replaces
                    client Date.now() on flush (LWW)
                         │
                         ▼
                  ┌──────────────────────────────────────────────┐
                  │        Cloud Firestore Backend               │
                  │   (Real-time State Synchronization)          │
                  │   Secured by firestore.rules                 │
                  └──────────────────────────────────────────────┘
```

- **Single Persistence System**: Only the custom `syncService.js` queue manages offline writes. Firestore's built-in cache is disabled — running both simultaneously causes race conditions on reconnect.
- **Immediate Sync**: Every `addToSyncQueue()` call dispatches a `sync-enqueued` CustomEvent. The sync engine listens and flushes within 500ms, making changes visible to other users in near real-time.
- **Server Timestamps**: When the sync queue flushes to Firestore, client `Date.now()` timestamps are replaced with `serverTimestamp()` for authoritative, clock-skew-resistant ordering. Local IndexedDB records retain epoch ms for offline sorting.
- **Zero-Dependency Core Models**: All mathematical evaluation logic (`src/core/`) consists of pure, deterministic functions without DOM, storage, or network couplings, allowing isolated testing and scientific replication.
- **Optimistic Sync & LWW**: A persistent mutation queue flushes pending actions upstream to Firebase Firestore upon network reconnection using a Last-Write-Wins (LWW) conflict resolution strategy.
- **Zero-Config Mock Mode**: If Firebase credentials are not provided, the application runs entirely locally in Mock Mode via IndexedDB and simulated local authentication.

---

## 2. Theoretical & Mathematical Framework

### 2.1. Weighted Proportional Share (WPS)

> **Note:** This formula was updated to address a known bias in the prior completion-rate model, where a member with a single easy task could outscore a member who completed most of the group's work.

GroupTask calculates each member's contribution as their **proportional share of the group's total completed output**, not their personal completion rate:

$$\text{WPS}_i = \left( \frac{\sum_{t \in T_i^{\text{done}}} w_t}{\sum_{t \in T_{\text{group}}^{\text{done}}} w_t} \right) \times 100$$

Where:
- $T_i^{\text{done}}$ is the set of verified completed tasks assigned to member $i$.
- $T_{\text{group}}^{\text{done}}$ is ALL completed tasks in the group (the denominator is group-wide, not member-specific).
- $w_t \in [1, 10]$ is the complexity weight of task $t$, set by the group owner/admin and immutable by members.

**Properties:**
- If a member has zero tasks, WPS = 0 (no divide-by-zero).
- All member WPS scores always sum to ≤ 100% of completed work.
- Task weight is locked after creation and can only be changed by an admin, preventing score inflation.

### 2.2. Composite Peer Evaluation (PE)

To counteract popularity contests and reciprocal grade inflation, qualitative peer evaluations are anchored to objective task performance:

$$\text{PE}_i = 0.70 \cdot \text{WPS}_i + 0.30 \cdot \overline{R}_i$$

Where peer ratings on a 1–5 Likert scale are normalized to a 0–100 continuum:

$$R_{\text{norm}} = \left( \frac{r - 1}{5 - 1} \right) \times 100 = \left( \frac{r - 1}{4} \right) \times 100$$

$$\overline{R}_i = \frac{1}{|P_i|} \sum_{r \in P_i} R_{\text{norm}}(r)$$

**No-ratings fallback (transparent):** If no peer reviews have been submitted, $\text{PE}_i$ falls back to $\text{WPS}_i \times 0.70$. The system explicitly reports `ratingsStatus: 'no_ratings_defaulting_to_cs'` so evaluators know the score is incomplete — this is not silently applied.

### 2.3. Task Approval Workflow & Verified Completions

To ensure contribution scores reflect *verified* work, task status transitions are role-gated:

| Actor | Allowed status transitions |
|-------|---------------------------|
| **Any member** | Their own card: `todo` ↔ `in-progress` |
| **Any member** | Their own card → `pending-approval` (submit for review) |
| **Owner / Co-Admin** | Any card → `done` (approve); rejected → back to `in-progress` |

This is enforced at **two levels**:
1. **Client-side** in `boardEvents.js` — immediate UX feedback.
2. **Server-side** in `firestore.rules` — the database rejects rule violations even if the client is bypassed.

### 2.4. Multi-Factor Free-Rider Detection

The system continuously monitors three objective disengagement markers:
1. **Divergence Metric**: Individual WPS drops below 20% while the cohort average remains ≥ 50%.
2. **Temporal Inactivity**: Days elapsed since the student's last completed deliverable exceeds sprint thresholds (> 7 days or > 14 days).
3. **Commitment Avoidance**: Student holds zero in-progress or queued tasks after an initial onboarding grace window (3 days).

Members are categorized into risk tiers (`none`, `low`, `medium`, `high`) accompanied by explanatory diagnostic rationales.

### 2.5. Three-Score Gamification System

The gamification system uses three independent scores to prevent gaming:

| Score | Scope | Source | Used For |
|-------|-------|--------|----------|
| **Board Points (BP)** | Per-board | Card completions | Board leaderboard & board badges |
| **Global XP** | Cross-board | Cards + comments + streaks | Profile level (1–20) |
| **Reputation** | Global | Peer evals + quality signals | Profile tier, trust & free-rider flags |

**Board Point Calculation**: Points awarded are 1:1 with the card's weight. Overdue completions award 50% BP and 80% XP, with a Reputation penalty.

**Reputation Tiers**: Awakened → Ascended → Transcended → Mystic → Celestial → Eternal

**Leveling Curve**: A 20-tier progression model spanning Apprentice to Guild Overlord with exponential XP thresholds.

**Streak Continuity Invariant**: Daily completion events are grouped into UTC calendar date buckets with a 1-day grace window.

---

## 3. Security Model

### 3.1. Firestore Security Rules (`firestore.rules`)

All data access is enforced server-side. Key rules:

- **Groups**: Any authenticated user can read a group document (required for invite code resolution). Only the creator can update/delete.
- **Tasks**: Members can read and create tasks within their group. Members can only update their **own assigned** cards and **cannot** set `status = 'done'` directly — only admins can approve. Task `weight` is immutable by non-admins.
- **Members**: Composite document ID format (`groupId_userId`) allows the `isMemberOfGroup()` helper to efficiently verify membership using `exists()` without a full collection scan.
- **Peer Reviews**: Reviewer-only read access. Group admins can read for governance. Evaluatees cannot read reviews about themselves.
- **Proof Submissions**: Only the submitting member or a group admin can read/write.

### 3.2. Member ID Format

Member records use a composite document ID: `{groupId}_{userId}`. This is required by the `isMemberOfGroup()` Firestore security function which uses `exists()` for efficient, billed-per-read membership checks.

---

## 4. Directory Structure

```
Grouptask/
├── public/                     # Static assets served at root
│   ├── icons/                  # PWA application icons (192px & 512px)
│   ├── manifest.json           # Web App Manifest
│   └── sw.js                   # Service Worker (offline caching)
├── src/
│   ├── app.js                  # Application bootstrap & routing table
│   ├── main.js                 # DOM entry point
│   ├── assets/
│   │   ├── icons/icons.js      # Vector SVG icon library (Lucide-based + Google)
│   │   └── styles/styles.css   # Theme tokens & responsive styles
│   ├── config/
│   │   └── firebaseConfig.js   # Cloud backend & Mock Mode detector
│   │                           # (enableIndexedDbPersistence intentionally disabled)
│   ├── core/                   # Pure mathematical & behavioral engines
│   │   ├── badgeEngine.js          # Badge awarding logic (profile & board)
│   │   ├── eventEngine.js          # Unified event recording hub (BP, XP, Rep)
│   │   ├── gamificationEngine.js   # XP curves, streaks, legacy point math
│   │   ├── peerEvaluationEngine.js # Rating normalization & hybrid PE scores
│   │   ├── reputationEngine.js     # Rep tier thresholds & delta calculations
│   │   └── scoringEngine.js        # WPS formula & free-rider detection
│   ├── features/               # Modular UI feature views
│   │   ├── audit/AuditHistory.js   # Group audit event stream & timeline
│   │   ├── auth/                   # Authentication (Login / Register)
│   │   ├── dashboard/              # Pulse dashboard, Leaderboard & Data Viz
│   │   ├── members/MemberList.js   # Roster management & team risk overview
│   │   ├── profile/                # User profile, Rep tier & XP progress
│   │   └── tasks/                  # Task board (TaskCard, TaskModal, boardEvents)
│   │       └── boardEvents.js      # Role-based card move permissions
│   ├── lib/indexedDB.js        # Promisified IndexedDB primitive wrapper
│   ├── services/               # Data persistence & synchronization layer
│   │   ├── activityLogService.js   # Event recording for audit pulse
│   │   ├── authService.js          # Authentication (Mock & Firebase Auth)
│   │   ├── conflictResolver.js     # LWW conflict resolution engine
│   │   ├── connectionStatus.js     # Online/offline/syncing status signals
│   │   ├── indexedDBService.js     # Schema definition & local transactions (v5)
│   │   │                           # addToSyncQueue emits 'sync-enqueued' event
│   │   ├── memberService.js        # Group formation & invitation logic
│   │   ├── notificationService.js  # In-app & browser notification dispatcher
│   │   ├── router.js               # Lightweight hash-based SPA router
│   │   ├── syncService.js          # Cloud Firestore synchronization engine
│   │   │                           # Listens to 'sync-enqueued'; flushes in 500ms
│   │   │                           # Replaces Date.now() with serverTimestamp() on flush
│   │   ├── taskService.js          # Task lifecycle management
│   │   └── themeService.js         # Domain terminology & color theming
│   └── utils/                  # Shared utilities
│       ├── formatters.js       # Temporal & numeric formatters
│       ├── helpers.js          # Cryptographic UUIDs & sanitization
│       └── validators.js       # Input integrity validation
├── tests/                      # Automated Jest unit test suite
│   ├── contributionScore.test.js
│   ├── freeRiderDetection.test.js
│   ├── gamification.test.js
│   ├── peerEvaluation.test.js
│   └── setup.js                # IndexedDB mock environment setup
├── firestore.rules             # Production Firestore security rules
├── vercel.json                 # Vercel deployment configuration
├── index.html                  # Single-page application template
├── jest.config.js              # Test runner configuration (Node VM ESM)
├── package.json                # Project dependencies and npm scripts
└── vite.config.js              # Production bundler configuration
```

---

## 5. Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 20.x or higher recommended)
- Modern web browser (Chrome, Firefox, Edge, Safari)

### Installation
1. Clone repository:
   ```bash
   git clone https://github.com/ZemronWrong/Grouptask.git
   cd Grouptask
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally (Mock Mode — no Firebase needed)
```bash
npm run dev
```
Open `http://localhost:3000` in your browser. The app runs fully offline using IndexedDB and simulated authentication.

### Running Automated Test Suites
```bash
npm test
```

### Production Build
```bash
npm run build
```
Output files are written to the `dist/` folder and can be previewed locally using `npm run preview`.

---

## 6. Deployment (Vercel)

This project is configured for zero-config deployment on Vercel via `vercel.json`.

### Step 1 — Set Environment Variables on Vercel
In your Vercel project dashboard go to **Settings → Environment Variables** and add all keys from `.env.example`:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

> **Without these**, the app will fall back to Mock Mode in production and data will NOT persist across users.

After adding variables, **redeploy** from the Vercel dashboard (Deployments → 3-dot menu → Redeploy) for them to take effect.

### Step 2 — Enable Firebase Authentication Providers
In the Firebase Console → **Authentication → Sign-in method**, enable:
- ✅ Email/Password
- ✅ Google

Then add your Vercel domain (e.g., `grouptask.vercel.app`) to **Authorized domains**.

### Step 3 — Deploy Firestore Security Rules
Copy the contents of `firestore.rules` and paste them into the Firebase Console → **Firestore Database → Rules** tab, then click **Publish**.

Alternatively, use the Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # select your project, use existing firestore.rules
firebase deploy --only firestore:rules
```

### Step 4 — Push to GitHub
Vercel auto-deploys on every push to `main`. Connect your GitHub repo at [vercel.com/new](https://vercel.com/new).

---

## 7. Offline & Mock Mode Operation

- **Offline / Mock Mode**: When no Firebase API key is configured, GroupTask automatically operates in **Mock Mode**. Data is stored entirely client-side in IndexedDB (schema version 5), and mock authentication simulates multi-user workflows without server provisioning.
- **Production Cloud Deployment**: Populate the `VITE_FIREBASE_*` environment variables in Vercel (or `.env.local` locally) to activate real Firebase Auth and Firestore sync.
- **Sync Status Indicator**: A live connection badge in the UI shows `Offline`, `Connecting...`, `Connected`, or `Syncing` so users always know their data state.
- **Near Real-Time Sync**: Local changes are flushed to Firestore within 500ms of occurrence (debounced batch). Other users see updates as soon as their Firestore listener receives the change — typically under 1 second on a stable connection.

---

## 8. Changelog (Recent)

| Version | Change |
|---------|--------|
| `a94d9ce` | **fix:** Immediate sync on local change — `sync-enqueued` event + 500ms debounce flush |
| `2eb977a` | **fix:** Removed dual persistence conflict — disabled `enableIndexedDbPersistence`; `syncService` now uses `serverTimestamp()` on flush |
| `b110401` | **fix:** Advisor feedback — WPS formula, role-based card moves, PE transparency, Firestore task rules |
| `be7ec0b` | **fix:** Composite member ID format (`groupId_uid`) for Firestore `isMemberOfGroup()` rule |
| `1d91cbd` | **fix:** Firestore `groups` rule — allow any authed user to read (required for invite code resolution) |
