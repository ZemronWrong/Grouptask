import { signUp, signInWithGoogle } from '../../services/authService.js';
import { navigate } from '../../services/router.js';
import { ICONS } from '../../assets/icons/icons.js';
import { withBusy } from '../../utils/ui.js';
import { authErrorMessage } from '../../utils/errors.js';

export function renderRegister() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">
          <span class="logo-icon">${ICONS.clipboard}</span>
          <h1>GroupTask</h1>
          <p class="auth-subtitle">Create your account</p>
        </div>
        <div class="auth-tabs">
          <button class="auth-tab" type="button" id="tab-login">Sign in</button>
          <button class="auth-tab active" type="button">Register</button>
        </div>
        <form class="auth-form" id="register-form">
          <div class="form-group">
            <label for="reg-name">Display name</label>
            <input id="reg-name" type="text" autocomplete="name" required placeholder="Alex" />
          </div>
          <div class="form-group">
            <label for="reg-email">Email</label>
            <input id="reg-email" type="email" autocomplete="email" required placeholder="you@school.edu" />
          </div>
          <div class="form-group">
            <label for="reg-password">Password</label>
            <input id="reg-password" type="password" autocomplete="new-password" required minlength="6" aria-describedby="reg-password-hint" />
            <small class="field-hint" id="reg-password-hint">At least 6 characters.</small>
          </div>
          <p class="auth-error" id="register-error" role="alert"></p>
          <button class="btn btn-primary" id="btn-reg-submit" type="submit">Create account</button>
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

  document.getElementById('tab-login').addEventListener('click', () => navigate('#/login'));

  const submitBtn = document.getElementById('btn-reg-submit');
  const googleBtn = document.getElementById('btn-google');

  const errorEl = document.getElementById('register-error');

  document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (googleBtn.disabled) return;
    errorEl.textContent = '';
    return withBusy(submitBtn, async () => {
      try {
        await signUp(
          document.getElementById('reg-email').value.trim(),
          document.getElementById('reg-password').value,
          document.getElementById('reg-name').value.trim(),
        );
        // F3: the dashboard downloads this user's groups once if this device has none
        navigate('#/dashboard');
      } catch (err) {
        errorEl.textContent = authErrorMessage(err, 'Could not create your account. Please try again.');
      }
    }, { label: 'Creating account…' });
  });

  googleBtn.addEventListener('click', () => {
    if (submitBtn.disabled) return;
    errorEl.textContent = '';
    return withBusy(googleBtn, async () => {
      try {
        await signInWithGoogle();
        navigate('#/dashboard');
      } catch (err) {
        errorEl.textContent = authErrorMessage(err, 'Google sign-in failed. Please try again.');
      }
    }, { label: 'Opening Google…' });
  });
}
