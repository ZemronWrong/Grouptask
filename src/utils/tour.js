/**
 * tour — a small "coach mark" helper (D6).
 *
 * startTour(steps, { onFinish }) dims the page, draws a highlight box around
 * one element per step and shows a popup next to it with Back / Next / Skip.
 * Each step is `{ selector, title, text, demo? }`:
 *   selector — CSS selector, or a list of selectors (the first visible match
 *              wins), or null for a centred popup with no highlight.
 *   demo     — optional HTML shown inside the popup (e.g. a CSS animation).
 *
 * The overlay lives on <body>, outside #app, and looks its target up again on
 * every reposition, so it survives the page re-rendering underneath it. It
 * covers the whole page while open, so nothing behind it can be clicked or
 * dragged: the tour itself never changes any data.
 */

import { escapeHtml } from './helpers.js';

const MARGIN = 8;   // keep the popup this far from the viewport edges
const GAP = 14;     // space between the highlight and the popup
const PAD = 6;      // highlight padding around the target

let active = null;

export function isTourActive() {
  return !!active;
}

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

/** Steps whose target is on screen (steps without a selector always count). */
export function filterVisibleSteps(steps, isVisible) {
  return (steps || []).filter((s) => !s.selector || isVisible(s.selector));
}

/**
 * Where to put a popup of `size` next to `rect` inside viewport `vp`.
 * Tries below, above, right, left; if none fits (a target bigger than the
 * screen), the popup sits at the bottom centre over the target.
 * Returns `{ top, left, side }`.
 */
export function placePopup(rect, size, vp) {
  const clampLeft = (x) => Math.max(MARGIN, Math.min(x, vp.width - size.width - MARGIN));
  const clampTop = (y) => Math.max(MARGIN, Math.min(y, vp.height - size.height - MARGIN));
  if (!rect) {
    return { top: clampTop((vp.height - size.height) / 2), left: clampLeft((vp.width - size.width) / 2), side: 'center' };
  }
  const centreX = rect.left + rect.width / 2 - size.width / 2;
  const centreY = rect.top + rect.height / 2 - size.height / 2;
  const options = [
    { side: 'bottom', fits: rect.bottom + GAP + size.height <= vp.height - MARGIN, top: rect.bottom + GAP, left: centreX },
    { side: 'top',    fits: rect.top - GAP - size.height >= MARGIN,               top: rect.top - GAP - size.height, left: centreX },
    { side: 'right',  fits: rect.right + GAP + size.width <= vp.width - MARGIN,   top: centreY, left: rect.right + GAP },
    { side: 'left',   fits: rect.left - GAP - size.width >= MARGIN,               top: centreY, left: rect.left - GAP - size.width },
  ];
  const pick = options.find((o) => o.fits);
  if (pick) return { top: clampTop(pick.top), left: clampLeft(pick.left), side: pick.side };
  return { top: clampTop(vp.height - size.height - MARGIN * 3), left: clampLeft((vp.width - size.width) / 2), side: 'over' };
}

// ── DOM ───────────────────────────────────────────────────────────────────────

function findTarget(selector) {
  if (!selector) return null;
  const list = Array.isArray(selector) ? selector : [selector];
  for (const sel of list) {
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('.tour-overlay')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

function prefersReducedMotion() {
  return document.documentElement.dataset.reduceMotion === 'true'
    || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Start a tour. Starting a new one closes any tour already open.
 * `onFinish(reason)` runs once when it closes: 'done', 'skip' or 'navigate'.
 * Returns `{ close }`, or null if no step has anything on screen.
 */
export function startTour(steps, { onFinish } = {}) {
  if (active) active.close('skip');

  const shown = filterVisibleSteps(steps, (sel) => !!findTarget(sel));
  if (shown.length === 0) return null;

  const overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  overlay.innerHTML = `
    <div class="tour-blocker"></div>
    <div class="tour-highlight" hidden></div>
    <div class="tour-popup" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabindex="-1"></div>
  `;
  const blocker = overlay.querySelector('.tour-blocker');
  const highlight = overlay.querySelector('.tour-highlight');
  const popup = overlay.querySelector('.tour-popup');
  const previousFocus = document.activeElement;
  let index = 0;
  let frame = 0;

  function position() {
    frame = 0;
    const target = findTarget(shown[index].selector);
    let rect = null;
    if (target) {
      const r = target.getBoundingClientRect();
      // Clamp to the viewport so a huge target (the whole board) stays framed
      const top = Math.max(r.top - PAD, MARGIN);
      const left = Math.max(r.left - PAD, MARGIN);
      const bottom = Math.min(r.bottom + PAD, window.innerHeight - MARGIN);
      const right = Math.min(r.right + PAD, window.innerWidth - MARGIN);
      rect = { top, left, bottom, right, width: right - left, height: bottom - top };
      Object.assign(highlight.style, { top: `${top}px`, left: `${left}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }
    highlight.hidden = !rect;
    blocker.classList.toggle('tour-dim', !rect);
    const pos = placePopup(rect, { width: popup.offsetWidth, height: popup.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight });
    Object.assign(popup.style, { top: `${pos.top}px`, left: `${pos.left}px` });
    popup.dataset.side = pos.side;
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(position);
  }

  function render() {
    const step = shown[index];
    const last = index === shown.length - 1;
    popup.innerHTML = `
      <div class="tour-progress">Step ${index + 1} of ${shown.length}</div>
      <h3 class="tour-title" id="tour-title">${escapeHtml(step.title)}</h3>
      <p class="tour-text">${escapeHtml(step.text)}</p>
      ${step.demo ? `<div class="tour-demo" aria-hidden="true">${step.demo}</div>` : ''}
      <div class="tour-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-tour="skip">Skip</button>
        <span class="tour-spacer"></span>
        ${index > 0 ? '<button type="button" class="btn btn-secondary btn-sm" data-tour="back">Back</button>' : ''}
        <button type="button" class="btn btn-primary btn-sm" data-tour="next">${last ? 'Done' : 'Next'}</button>
      </div>
    `;
    const target = findTarget(step.selector);
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    position();
    popup.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  }

  function go(dir) {
    // Skip steps whose element has gone since the tour started (e.g. a card was removed)
    let i = index + dir;
    while (i >= 0 && i < shown.length && shown[i].selector && !findTarget(shown[i].selector)) i += dir;
    if (i >= shown.length) { close('done'); return; }
    if (i < 0) return;
    index = i;
    render();
  }

  popup.addEventListener('click', (e) => {
    const action = e.target.closest('[data-tour]')?.dataset.tour;
    if (action === 'next') go(1);
    else if (action === 'back') go(-1);
    else if (action === 'skip') close('skip');
  });

  // Keys: Esc closes, arrows step, Tab stays inside the popup. Captured and
  // stopped here so nothing on the page behind the tour reacts to them.
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('skip'); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); return; }
    if (e.key === 'Tab') {
      const buttons = [...popup.querySelectorAll('button')];
      const i = buttons.indexOf(document.activeElement);
      e.preventDefault();
      e.stopPropagation();
      const next = e.shiftKey ? (i <= 0 ? buttons.length - 1 : i - 1) : (i + 1) % buttons.length;
      buttons[next]?.focus();
      return;
    }
    // Enter/Space only act on the popup's own buttons
    if ((e.key === 'Enter' || e.key === ' ') && !popup.contains(document.activeElement)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Re-render underneath (refreshBoard, renderTaskBoard) replaces the target
  // element; look it up again whenever the page changes.
  const observer = new MutationObserver((records) => {
    if (records.some((r) => !overlay.contains(r.target))) schedule();
  });

  function onHashChange() { close('navigate'); }

  function close(reason) {
    if (active !== controller) return;
    active = null;
    observer.disconnect();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('hashchange', onHashChange);
    if (frame) cancelAnimationFrame(frame);
    overlay.remove();
    if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    try { onFinish?.(reason); } catch (err) { console.error('[Tour] onFinish failed', err); }
  }

  const controller = { close };
  active = controller;

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('hashchange', onHashChange);
  observer.observe(document.body, { childList: true, subtree: true });
  render();
  return controller;
}
