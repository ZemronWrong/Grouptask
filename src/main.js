import './assets/styles/styles.css';
import { boot } from './app.js';
import { registerServiceWorker } from './services/serviceWorker.js';

registerServiceWorker();

boot().catch((err) => {
  console.error('[GroupTask] Failed to start:', err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `<div class="auth-container"><div class="auth-card">
      <h1>Could not start</h1>
      <p class="auth-error">${err.message || 'Unknown error'}</p>
    </div></div>`;
  }
});
