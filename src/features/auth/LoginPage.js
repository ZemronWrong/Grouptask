import { signIn, signInWithGoogle } from '../../services/authService.js';
import { navigate } from '../../services/router.js';
import { ICONS } from '../../assets/icons/icons.js';

export function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">
          <span class="logo-icon">${ICONS.clipboard}</span>
          <h1>GroupTask</h1>
          <p class="auth-subtitle">Collaborative project manager</p>
        </div>
        <div class="auth-tabs">
          <button class="auth-tab active" type="button">Sign in</button>
          <button class="auth-tab" type="button" id="tab-register">Register</button>
        </div>
        <form class="auth-form" id="login-form">
          <div class="form-group">
            <label for="login-email">Email</label>
            <input id="login-email" type="email" autocomplete="email" required placeholder="you@school.edu" />
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <input id="login-password" type="password" autocomplete="current-password" required minlength="6" />
          </div>
          <p class="auth-error" id="login-error"></p>
          <button class="btn btn-primary" id="btn-login-submit" type="submit">Sign in</button>
        </form>
        <div class="auth-divider"><span>or</span></div>
        <button class="btn btn-google" type="button" id="btn-google">
          ${ICONS.google}
          Continue with Google
        </button>
        <a class="auth-demo-link" href="#/welcome">▶ Watch how it works</a>
      </div>
    </div>
  `;

  document.getElementById('tab-register').addEventListener('click', () => navigate('#/register'));

  const submitBtn = document.getElementById('btn-login-submit');
  const googleBtn = document.getElementById('btn-google');

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';
    try {
      await signIn(
        document.getElementById('login-email').value.trim(),
        document.getElementById('login-password').value,
      );
      // F3: the dashboard downloads this user's groups once if this device has none
      navigate('#/dashboard');
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
      errorEl.textContent = err.message || 'Sign in failed.';
    }
  });

  googleBtn.addEventListener('click', async () => {
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    googleBtn.disabled = true;
    try {
      await signInWithGoogle();
      navigate('#/dashboard');
    } catch (err) {
      googleBtn.disabled = false;
      errorEl.textContent = err.message || 'Google sign-in failed.';
    }
  });
}
