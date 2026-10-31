/**
 * WelcomePage — the landing page for logged-out users (#/welcome, D4).
 *
 * A short animated demo of a task going across a mini board, so first-time
 * users understand the flow before they sign in. The demo is plain HTML/CSS
 * driven by a timer: it imports no services and never reads or writes data.
 */

import { ICONS } from '../../assets/icons/icons.js';

export const DEMO_STEP_MS = 3500;   // 4 steps → one loop in 14 s

/** The four demo steps: which column the card is in, and the caption. */
export const DEMO_STEPS = [
  {
    column: 'todo',
    caption: 'Your leader creates the group and adds tasks. Each task has a weight: bigger tasks count more.',
  },
  {
    column: 'in-progress',
    caption: 'Take a task and start working.',
  },
  {
    column: 'pending-approval',
    caption: 'Done? Submit it for approval.',
  },
  {
    column: 'done',
    caption: 'An admin approves it, and you earn points and your contribution score goes up.',
  },
];

export const DEMO_COLUMNS = [
  { key: 'todo',             label: 'To Do' },
  { key: 'in-progress',      label: 'In Progress' },
  { key: 'pending-approval', label: 'Pending Approval' },
  { key: 'done',             label: 'Completed' },
];

/** Step index after moving `dir` (+1 / -1) from `i`, wrapping around. */
export function stepAfter(i, dir, count = DEMO_STEPS.length) {
  return ((i + dir) % count + count) % count;
}

const FEATURES = [
  { icon: '📶', title: 'Works offline and syncs later', text: 'Your work is saved on your device first and uploads when you are back online.' },
  { icon: '⚖️', title: 'Fair contribution scores', text: 'Approved tasks count by their weight, so everyone can see their fair share.' },
  { icon: '🏅', title: 'Points, badges, and a leaderboard', text: 'Earn points for approved work, keep streaks going, and unlock badges.' },
];

function prefersReducedMotion() {
  return document.documentElement.dataset.reduceMotion === 'true'
    || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function ctaHTML() {
  return `
    <div class="welcome-cta">
      <a class="btn btn-primary" href="#/register">Get started</a>
      <a class="btn btn-secondary" href="#/login">Sign in</a>
    </div>
  `;
}

/** A fake card as it looks at `step` (0–3). */
function demoCardHTML(step) {
  return `
    <div class="wd-card-title">Write the survey questions</div>
    <div class="wd-card-row">
      <span class="wd-weight" title="Weight">⚖ 30</span>
      <span class="wd-avatar" ${step >= 1 ? '' : 'hidden'} title="You">Y</span>
    </div>
    <div class="wd-submit" ${step === 2 ? '' : 'hidden'}>🚀 SUBMIT</div>
    <div class="wd-points" ${step === 3 ? '' : 'hidden'}>+30 pts</div>
  `;
}

function scoreHTML() {
  return `
    <div class="wd-score" aria-hidden="true">
      <div class="wd-score-label">Your contribution score</div>
      <div class="wd-score-track">
        <div class="wd-score-fill"></div>
        <div class="wd-score-share" title="Equal share"></div>
      </div>
      <div class="wd-score-note">Line = equal share for a group of 4</div>
    </div>
  `;
}

function animatedDemoHTML() {
  return `
    <div class="welcome-demo" id="welcome-demo" data-step="0">
      <div class="wd-board">
        ${DEMO_COLUMNS.map((c) => `
          <div class="wd-col" data-col="${c.key}">
            <div class="wd-col-title">${c.label}</div>
          </div>
        `).join('')}
        <div class="wd-card wd-card-static" style="--col:1">
          <div class="wd-card-title">Design the slides</div>
          <div class="wd-card-row"><span class="wd-weight">⚖ 20</span><span class="wd-avatar wd-avatar-other">B</span></div>
        </div>
        <div class="wd-card wd-card-moving" style="--col:0" id="wd-card">${demoCardHTML(0)}</div>
      </div>
      ${scoreHTML()}
      <p class="wd-caption" id="wd-caption" aria-live="off">${DEMO_STEPS[0].caption}</p>
      <div class="wd-controls">
        <button type="button" class="btn-icon wd-nav" data-dir="-1" aria-label="Previous step">◀</button>
        ${DEMO_STEPS.map((_, i) => `<button type="button" class="wd-dot" data-step="${i}" aria-label="Step ${i + 1}"></button>`).join('')}
        <button type="button" class="btn-icon wd-nav" data-dir="1" aria-label="Next step">▶</button>
        <button type="button" class="btn btn-secondary btn-sm wd-pause" id="wd-pause" aria-pressed="false">Pause</button>
      </div>
    </div>
  `;
}

/** prefers-reduced-motion: the four steps side by side, no animation. */
function staticDemoHTML() {
  return `
    <ol class="welcome-steps-static">
      ${DEMO_STEPS.map((s, i) => `
        <li class="wd-panel" data-step="${i}">
          <div class="wd-panel-head"><span class="wd-panel-num">${i + 1}</span>${DEMO_COLUMNS.find((c) => c.key === s.column).label}</div>
          <div class="wd-card">${demoCardHTML(i)}</div>
          <p class="wd-caption">${s.caption}</p>
        </li>
      `).join('')}
    </ol>
  `;
}

/** Drive the animated demo. Stops by itself once the page is gone. */
function startDemo(root) {
  const card = root.querySelector('#wd-card');
  const caption = root.querySelector('#wd-caption');
  const pauseBtn = root.querySelector('#wd-pause');
  let step = 0;
  let playing = true;
  let timer = null;

  function show(i) {
    step = i;
    root.dataset.step = String(i);
    const col = DEMO_COLUMNS.findIndex((c) => c.key === DEMO_STEPS[i].column);
    card.style.setProperty('--col', col);
    card.innerHTML = demoCardHTML(i);
    caption.textContent = DEMO_STEPS[i].caption;
    root.querySelectorAll('.wd-dot').forEach((d) => {
      const on = Number(d.dataset.step) === i;
      d.classList.toggle('active', on);
      d.setAttribute('aria-current', on ? 'step' : 'false');
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (!playing) return;
    timer = setTimeout(() => {
      if (!root.isConnected) return;
      show(stepAfter(step, 1));
      schedule();
    }, DEMO_STEP_MS);
  }

  function setPlaying(on) {
    playing = on;
    pauseBtn.textContent = on ? 'Pause' : 'Play';
    pauseBtn.setAttribute('aria-pressed', on ? 'false' : 'true');
    // Read captions aloud only when the user is stepping through by hand
    caption.setAttribute('aria-live', on ? 'off' : 'polite');
    schedule();
  }

  root.addEventListener('click', (e) => {
    const dot = e.target.closest('.wd-dot');
    const nav = e.target.closest('.wd-nav');
    if (dot) { show(Number(dot.dataset.step)); setPlaying(false); }
    else if (nav) { show(stepAfter(step, Number(nav.dataset.dir))); setPlaying(false); }
    else if (e.target.closest('#wd-pause')) setPlaying(!playing);
  });

  show(0);
  schedule();
}

export function renderWelcome() {
  const app = document.getElementById('app');
  const reduced = prefersReducedMotion();
  app.innerHTML = `
    <div class="welcome-page">
      <section class="welcome-hero">
        <span class="logo-icon">${ICONS.clipboard}</span>
        <h1 class="welcome-title">GroupTask</h1>
        <p class="welcome-tagline">Split group work into weighted tasks, get them approved, and see your fair share.</p>
        ${ctaHTML()}
      </section>

      <section class="welcome-section" aria-labelledby="welcome-how">
        <h2 class="welcome-heading" id="welcome-how">How it works</h2>
        ${reduced ? staticDemoHTML() : animatedDemoHTML()}
      </section>

      <section class="welcome-features">
        ${FEATURES.map((f) => `
          <div class="welcome-feature">
            <div class="welcome-feature-icon" aria-hidden="true">${f.icon}</div>
            <h3>${f.title}</h3>
            <p>${f.text}</p>
          </div>
        `).join('')}
      </section>

      <section class="welcome-bottom">
        <h2 class="welcome-heading">Ready to start your group project?</h2>
        ${ctaHTML()}
      </section>
    </div>
  `;

  if (!reduced) startDemo(app.querySelector('#welcome-demo'));
}
