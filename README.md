<<<<<<< HEAD
# GroupTask

GroupTask is a Progressive Web App (PWA) designed for managing student group projects. It features real-time task management, a sleek Kanvera-inspired dashboard with live pulse metrics, gamification, and peer evaluation systems to ensure fair contribution tracking.

## Features

- **Dynamic Dashboard**: Kanvera-inspired UI featuring a compact sidebar for quick group switching and a rich "Pulse" panel displaying sparklines, recent activity, and active members.
- **Activity History**: A granular event timeline that tracks task creations, state changes, member joins, and comments across each project.
- **Task Management**: Kanban-style task boards (To-Do, In Progress, Done) tailored for group collaboration.
- **Gamification & Leaderboards**: Points and badges are awarded for completing tasks and peer reviews to encourage engagement.
- **Peer Evaluation**: Built-in mechanisms to rate and review group members.
- **Offline First**: Utilizes IndexedDB for local persistence, seamlessly syncing with Firebase when online.

## Tech Stack

- **Frontend**: Vanilla JavaScript (ESModules), HTML5, CSS3 (Glassmorphism & custom themes)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Backend & Auth**: Firebase v10 SDK (Firestore, Auth)
- **Local Storage**: IndexedDB (Offline capability via sync queue)
- **Icons**: SVG-based [Lucide Icons](https://lucide.dev/)

## Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed (v16+ recommended).

### Installation

1. Clone the repository or extract the project files.
2. Navigate to the project directory:
   ```bash
   cd GroupTask
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Running the App Locally

To start the development server, run:

```bash
npm run dev
```

This will launch Vite on `http://localhost:3000`. The browser should open automatically.

### Building for Production

To create an optimized production build, run:

```bash
npm run build
```

The output will be generated in the `dist` folder. You can preview the production build using:

```bash
npm run preview
```

### Running Tests

To run the Jest test suite:

```bash
npm run test
```

## Firebase Configuration

The application uses Firebase for real-time synchronization and authentication. It supports a **Mock Mode** for local development.

- If the Firebase API Key is empty or set to a placeholder (e.g., `YOUR_API_KEY`) in `src/config/firebaseConfig.js`, the app automatically falls back to **Mock Mode**.
- In Mock Mode, any email/password combination will sign you in, and all data operations remain entirely local to your browser via IndexedDB.
- To connect to a live Firebase backend, update the `firebaseConfig` object in `src/config/firebaseConfig.js` with your actual Firebase project credentials.
=======
# Grouptask
The Group Task module is a gamified peer evaluation system that ensures fair contribution and accountability in team-based academic work. It removes the possibility of "free-loaders" by making every member's contribution visible, measurable, and tied to rewards or consequences.
>>>>>>> 1ce068f5febad7fbf541e38e294049de9c8b607f
