# GroupTask: A Gamified Peer-Evaluation System for Cooperative Learning

[![Tests](https://img.shields.io/badge/tests-37%20passed-brightgreen.svg)]()
[![Platform](https://img.shields.io/badge/architecture-Local--First%20PWA-blue.svg)]()
[![Framework](https://img.shields.io/badge/frontend-Vanilla%20ESM%20%2B%20Vite-orange.svg)]()

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
                  │      │                                       │
                  │      ▼                                       │
                  │   Storage & Mutation Dispatcher              │
                  │      │                                       │
                  │   IndexedDB (Local Source of Truth)          │
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
                  │        (Real-time State Synchronization)     │
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

### 2.4. Gamification & Streak Continuity
- **Experience Points (XP)**: Completed deliverables award points scaled by weight: $\text{Points} = \sum (w_t \times 10)$.
- **Leveling Curve**: A 20-tier progression model spanning Novice to Guild Overlord with exponential thresholds.
- **Streak Continuity Invariant**: Daily completion events are grouped into UTC calendar date buckets with a 1-day grace window, ensuring consistent study habits without weekend penalization.

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
│   │   ├── icons/icons.js      # Vector SVG icon library (Lucide-based)
│   │   └── styles/styles.css   # Theme tokens & responsive styles
│   ├── config/
│   │   └── firebaseConfig.js   # Cloud backend & Mock Mode detector
│   ├── core/                   # Pure mathematical & behavioral engines
│   │   ├── gamificationEngine.js   # XP curves, streaks, badge state machine
│   │   ├── peerEvaluationEngine.js # Rating normalization & hybrid PE scores
│   │   └── scoringEngine.js        # Contribution Score & free-rider detection
│   ├── features/               # Modular UI feature views
│   │   ├── audit/AuditHistory.js   # Group audit event stream & timeline
│   │   ├── auth/                   # Authentication (Login / Register)
│   │   ├── dashboard/              # Kanvera-inspired Pulse dashboard & widgets
│   │   ├── members/MemberList.js   # Roster management & team risk overview
│   │   ├── profile/                # User profile & preferences
│   │   └── tasks/                  # Task board, drag-and-drop, & comments
│   ├── lib/indexedDB.js        # Promisified IndexedDB primitive wrapper
│   ├── services/               # Data persistence & synchronization layer
│   │   ├── activityLogService.js   # Event recording for audit pulse
│   │   ├── authService.js          # Authentication (Mock & Firebase Auth)
│   │   ├── conflictResolver.js     # LWW conflict resolution engine
│   │   ├── indexedDBService.js     # Schema definition & local transactions
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
   git clone <repository-url>
   cd Grouptask
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
To launch the development server with Hot Module Replacement (HMR):
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### Running Automated Test Suites
To execute the algorithmic unit tests:
```bash
npm test
```

### Production Build
To generate an optimized, tree-shaken static production bundle:
```bash
npm run build
```
Output files are written to the `dist/` folder and can be previewed locally using `npm run preview`.

---

## 5. Offline & Mock Mode Operation

- **Offline / Mock Mode**: When no Firebase API key is configured or set to placeholder credentials, GroupTask automatically operates in **Mock Mode**. Data is stored entirely client-side in IndexedDB, and mock authentication simulates multi-user workflows without server provisioning.
- **Production Cloud Deployment**: To link a live Firebase project, populate the configuration object in `src/config/firebaseConfig.js` with your Firebase project credentials.
