# GroupTask: A Gamified Peer-Evaluation System for Cooperative Learning

[![Tests](https://img.shields.io/badge/tests-33%20passed-brightgreen.svg)](https://github.com/ZemronWrong/Grouptask)
[![Platform](https://img.shields.io/badge/architecture-Local--First%20PWA-blue.svg)]()
[![Framework](https://img.shields.io/badge/frontend-Vanilla%20ESM%20%2B%20Vite-orange.svg)]()
[![Deploy](https://img.shields.io/badge/deploy-Vercel-black.svg)](https://vercel.com)

**GroupTask** is an offline-first Progressive Web Application (PWA) engineered to mitigate the "free-rider" problem in student group projects. It combines objective task accountability, quantitative contribution scoring, calibrated peer reviews, and behavioral gamification mechanics to establish transparent and equitable academic collaboration.

---

## 1. System Architecture

GroupTask is architected around a **Local-First, Cloud-Synced** pattern:

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
                  └──────┬───────────────────────────────────────┘
                         │
                    Online Event (LWW Conflict Resolution)
                         │
                         ▼
                  ┌──────────────────────────────────────────────┐
                  │        Cloud Firestore Backend               │
                  │   (Real-time State Synchronization)          │
                  │   Secured by firestore.rules                 │
                  └──────────────────────────────────────────────┘
```

- **Zero-Dependency Core Models**: All mathematical evaluation logic (`src/core/`) consists of pure, deterministic functions without DOM, storage, or network couplings, allowing isolated testing and scientific replication.
- **Local-First Resilience**: Transactions commit immediately to browser IndexedDB storage, enabling seamless offline participation for students with intermittent connectivity.
- **Optimistic Synchronization & LWW**: A persistent mutation queue flushes pending actions upstream to Firebase Firestore upon network reconnection using a Last-Write-Wins (LWW) conflict resolution strategy.
- **Zero-Config Mock Mode**: If Firebase credentials are not provided, the application runs entirely locally in Mock Mode via IndexedDB and simulated local authentication.

---

## 2. Theoretical & Mathematical Framework

### 2.1. Weighted Contribution Score (CS)
Standard task counts bias evaluations toward trivial tasks. GroupTask calculates individual contribution proportionally based on task complexity weights:

$$\text{CS}_i = \left( \frac{\sum_{t \in T_i^{\text{done}}} w_t}{\sum_{t \in T_i^{\text{assigned}}} w_t} \right) \times 100$$

Where:
- $T_i^{\text{assigned}}$ is the set of all tasks assigned to member $i$.
- $T_i^{\text{done}} \subseteq T_i^{\text{assigned}}$ is the subset of verified completed tasks.
- $w_t \in [1, 10]$ represents the complexity weight assigned to task $t$.

### 2.2. Composite Peer Evaluation (PE)
To counteract popularity contests and reciprocal grade inflation, qualitative peer evaluations are anchored to objective task performance:

$$\text{PE}_i = 0.70 \cdot \text{CS}_i + 0.30 \cdot \overline{R}_i$$

Where peer ratings on a 1–5 Likert scale are normalized to a 0–100 continuum:

$$R_{\text{norm}} = \left( \frac{r - 1}{5 - 1} \right) \times 100 = \left( \frac{r - 1}{4} \right) \times 100$$

$$\overline{R}_i = \frac{1}{|P_i|} \sum_{r \in P_i} R_{\text{norm}}(r)$$

If no peer reviews have been submitted yet, $\text{PE}_i$ defaults to the objective contribution component ($\text{CS}_i \times 0.70$) to prevent penalizing students for peer delays.

### 2.3. Multi-Factor Free-Rider Detection
The system continuously monitors three objective disengagement markers:
1. **Divergence Metric**: Individual Contribution Score drops below 20% while the cohort average remains $\ge 50\%$.
2. **Temporal Inactivity**: Days elapsed since the student's last completed deliverable exceeds sprint thresholds ($> 7$ days or $> 14$ days).
3. **Commitment Avoidance**: Student holds zero in-progress or queued tasks after an initial onboarding grace window ($3$ days).

Members are categorized into risk tiers (`none`, `low`, `medium`, `high`) accompanied by explanatory diagnostic rationales.

### 2.4. Three-Score Gamification System
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

## 3. Directory Structure

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
│   ├── core/                   # Pure mathematical & behavioral engines
│   │   ├── badgeEngine.js          # Badge awarding logic (profile & board)
│   │   ├── eventEngine.js          # Unified event recording hub (BP, XP, Rep)
│   │   ├── gamificationEngine.js   # XP curves, streaks, legacy point math
│   │   ├── peerEvaluationEngine.js # Rating normalization & hybrid PE scores
│   │   ├── reputationEngine.js     # Rep tier thresholds & delta calculations
│   │   └── scoringEngine.js        # Contribution Score & free-rider detection
│   ├── features/               # Modular UI feature views
│   │   ├── audit/AuditHistory.js   # Group audit event stream & timeline
│   │   ├── auth/                   # Authentication (Login / Register)
│   │   ├── dashboard/              # Pulse dashboard, Leaderboard & Data Viz
│   │   ├── members/MemberList.js   # Roster management & team risk overview
│   │   ├── profile/                # User profile, Rep tier & XP progress
│   │   └── tasks/                  # Task board (TaskCard, TaskModal, boardEvents)
│   ├── lib/indexedDB.js        # Promisified IndexedDB primitive wrapper
│   ├── services/               # Data persistence & synchronization layer
│   │   ├── activityLogService.js   # Event recording for audit pulse
│   │   ├── authService.js          # Authentication (Mock & Firebase Auth)
│   │   ├── conflictResolver.js     # LWW conflict resolution engine
│   │   ├── connectionStatus.js     # Online/offline/syncing status signals
│   │   ├── indexedDBService.js     # Schema definition & local transactions (v5)
│   │   ├── memberService.js        # Group formation & invitation logic
│   │   ├── notificationService.js  # In-app & browser notification dispatcher
│   │   ├── router.js               # Lightweight hash-based SPA router
│   │   ├── syncService.js          # Cloud Firestore synchronization engine
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

## 4. Getting Started

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

## 5. Deployment (Vercel)

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

### Step 2 — Enable Firebase Authentication Providers
In the Firebase Console → **Authentication → Sign-in method**, enable:
- ✅ Email/Password
- ✅ Google

Then add your Vercel domain (e.g., `grouptask.vercel.app`) to **Authorized domains**.

### Step 3 — Deploy Firestore Security Rules
Install the Firebase CLI and deploy the included rules:
```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # select your project, use existing firestore.rules
firebase deploy --only firestore:rules
```

### Step 4 — Push to GitHub and import to Vercel
Vercel auto-deploys on every push to `main`. Connect your GitHub repo at [vercel.com/new](https://vercel.com/new).

---

## 6. Offline & Mock Mode Operation

- **Offline / Mock Mode**: When no Firebase API key is configured, GroupTask automatically operates in **Mock Mode**. Data is stored entirely client-side in IndexedDB (schema version 5), and mock authentication simulates multi-user workflows without server provisioning.
- **Production Cloud Deployment**: Populate the `VITE_FIREBASE_*` environment variables in Vercel (or `.env.local` locally) to activate real Firebase Auth and Firestore sync.
- **Sync Status Indicator**: A live connection badge in the UI shows `Offline`, `Connecting...`, `Connected`, or `Syncing` so users always know their data state.
