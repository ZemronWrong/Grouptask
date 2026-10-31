/**
 * F4/F5: shared in-app feedback — toasts, the confirm dialog, busy buttons,
 * and keyboard handling for modals (Esc closes, focus moves in and back).
 *
 * Replaces the per-screen showToast copies and the browser alert()/confirm()
 * popups, which freeze the page and look out of place.
 */

// ── Toasts ────────────────────────────────────────────────────────────────────
// One region, bottom centre, above the connection pill's row so they never
// overlap it. Errors stay longer than success messages.
// I1: while a modal or the confirm dialog is open the region moves to the top
// centre so it never covers the modal's fields or buttons, and identical
// messages collapse into one toast with a count.

const TOAST_MS = { success: 3000, info: 3000, error: 6000 };
const TOAST_ACTION_MS = 5000;  // long enough to press Undo
const MAX_TOASTS = 3;
const MODAL_SELECTOR = '.modal-overlay, .member-popup-overlay, .confirm-overlay';

/** How long a toast stays up. */
export function toastDuration(type = 'info', hasAction = false) {
  if (hasAction) return Math.max(TOAST_ACTION_MS, TOAST_MS[type] || 0);
  return TOAST_MS[type] || TOAST_MS.info;
}

/** Text shown for a toast collapsed `count` times, e.g. "Undo (2)". */
export function withCount(label, count) {
  return count > 1 ? `${label} (${count})` : label;
}

let toastRegion = null;
const openToasts = new Map();  // key -> { el, count, actions, close }

function getToastRegion() {
  if (!toastRegion || !toastRegion.isConnected) {
    toastRegion = document.createElement('div');
    toastRegion.className = 'toast-region';
    toastRegion.setAttribute('role', 'status');
    toastRegion.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastRegion);
  }
  return toastRegion;
}

function isVisible(el) {
  return !!el && !el.hidden && el.isConnected && el.getClientRects().length > 0;
}

function anyModalOpen() {
  return [...document.querySelectorAll(MODAL_SELECTOR)].some(isVisible);
}

/** Put the toast region at the top while a modal is open, at the bottom otherwise. */
export function placeToasts() {
  if (typeof document === 'undefined') return;
  if (toastRegion?.isConnected) toastRegion.classList.toggle('toast-region-top', anyModalOpen());
}

/** Close every toast that offers an action (Undo); called when a modal opens. */
export function dismissActionToasts() {
  for (const entry of [...openToasts.values()]) if (entry.actions.length) entry.close();
}

/**
 * Show a toast. `type` is 'success' | 'info' | 'error'. `action` adds a button,
 * e.g. { label: 'Undo', onClick }. Returns a function that closes the toast.
 * Showing the same message again while it is up bumps its count instead of
 * adding a second toast; its Undo then takes back every collapsed action,
 * newest first.
 */
export function showToast(message, { type = 'info', action = null, duration } = {}) {
  const key = `${type}|${action?.label || ''}|${message}`;
  const ms = duration ?? toastDuration(type, !!action);
  const existing = openToasts.get(key);
  if (existing?.el.isConnected) {
    existing.count += 1;
    if (action) existing.actions.push(action.onClick);
    existing.refresh();
    existing.restart(ms);
    existing.el.parentElement?.appendChild(existing.el);  // newest at the bottom
    return existing.close;
  }

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  if (type === 'error') el.setAttribute('role', 'alert');
  const text = document.createElement('span');
  el.appendChild(text);

  let timer = null;
  const entry = { el, count: 1, actions: action ? [action.onClick] : [] };
  entry.close = () => {
    clearTimeout(timer);
    el.remove();
    if (openToasts.get(key) === entry) openToasts.delete(key);
  };
  entry.restart = (t) => { clearTimeout(timer); timer = setTimeout(entry.close, t); };

  let btn = null;
  if (action) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.addEventListener('click', async () => {
      const actions = entry.actions.slice().reverse();
      entry.close();
      for (const run of actions) await run();
    });
    el.appendChild(btn);
  }
  entry.refresh = () => {
    // With a button the count goes on it ("Undo (2)"); otherwise on the message
    text.textContent = btn ? message : withCount(message, entry.count);
    if (btn) btn.textContent = withCount(action.label, entry.count);
  };
  entry.refresh();
  openToasts.set(key, entry);

  const region = getToastRegion();
  placeToasts();
  region.appendChild(el);
  while (region.children.length > MAX_TOASTS) {
    const oldest = region.firstElementChild;
    const old = [...openToasts.values()].find((e) => e.el === oldest);
    if (old) old.close(); else oldest.remove();
  }
  entry.restart(ms);
  return entry.close;
}

// ── Busy buttons ──────────────────────────────────────────────────────────────

const BUSY_LABEL_DELAY_MS = 150;

/**
 * Run `task` while `button` shows it is working: pressed/disabled straight
 * away, a "Saving…" label if it takes longer than ~150 ms, and clicks while it
 * runs are ignored (returns undefined without running `task` again).
 */
export async function withBusy(button, task, { label = 'Saving…', delay = BUSY_LABEL_DELAY_MS } = {}) {
  if (!button) return task();
  if (button.dataset.busy === '1') return undefined;

  button.dataset.busy = '1';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.classList.add('is-busy');
  const original = button.innerHTML;
  const timer = setTimeout(() => { button.textContent = label; }, delay);
  try {
    return await task();
  } finally {
    clearTimeout(timer);
    delete button.dataset.busy;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-busy');
    button.innerHTML = original;
  }
}

/** True while withBusy is running for this button. */
export function isBusyButton(button) {
  return button?.dataset?.busy === '1';
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

/**
 * In-app replacement for confirm(). Resolves true if the user confirms.
 * Destructive by default (red confirm button); Esc or Cancel resolves false.
 * Focus starts on Cancel and returns to where it was afterwards.
 */
export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true } = {}) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <h2 id="confirm-title"></h2>
        <p id="confirm-message"></p>
        <div class="confirm-actions">
          <button type="button" class="btn btn-secondary" data-cancel></button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok></button>
        </div>
      </div>
    `;
    overlay.querySelector('#confirm-title').textContent = title;
    overlay.querySelector('#confirm-message').textContent = message;
    const cancelBtn = overlay.querySelector('[data-cancel]');
    const okBtn = overlay.querySelector('[data-ok]');
    cancelBtn.textContent = cancelLabel;
    okBtn.textContent = confirmLabel;

    const finish = (ok) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
      resolve(ok);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else if (e.key === 'Tab') {
        // Keep focus inside the dialog
        e.preventDefault();
        (document.activeElement === cancelBtn ? okBtn : cancelBtn).focus();
      }
    };

    cancelBtn.addEventListener('click', () => finish(false));
    okBtn.addEventListener('click', () => finish(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    cancelBtn.focus();
  });
}

// ── Modal keyboard basics ─────────────────────────────────────────────────────
// Esc closes the top modal or popup, opening a modal puts the cursor in its
// first field, and closing it returns focus to the button that opened it.
// Works for every modal without each screen wiring it up.

const OVERLAY_SELECTOR = '.modal-overlay, .member-popup-overlay';
const CLOSE_SELECTOR = '.btn-close-modal, #btn-close-detail-modal, #member-popup-close, [data-close]';
const FIELD_SELECTOR = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])';

function openOverlays() {
  return [...document.querySelectorAll(OVERLAY_SELECTOR)].filter(isVisible);
}

/** Close an overlay the same way its own close button does. */
function closeOverlay(overlay) {
  const btn = overlay.querySelector(CLOSE_SELECTOR);
  if (btn) btn.click();
  else if (overlay.classList.contains('member-popup-overlay')) overlay.remove();
  else overlay.hidden = true;
}

function focusFirstField(overlay) {
  if (overlay.contains(document.activeElement)) return;  // the screen already chose (e.g. task title)
  const field = [...overlay.querySelectorAll(FIELD_SELECTOR)].find(isVisible);
  const target = field
    || [...overlay.querySelectorAll('button:not([disabled]), a[href]')].find((el) => isVisible(el) && !el.matches(CLOSE_SELECTOR))
    || overlay.querySelector(CLOSE_SELECTOR);
  target?.focus({ preventScroll: true });
}

/** The same control after a re-render replaced it (matched by id). */
function findEquivalent(el) {
  if (el?.isConnected) return el;
  return el?.id ? document.getElementById(el.id) : null;
}

function restoreFocus(opener) {
  if (!opener) return;
  const target = findEquivalent(opener);
  if (target && document.activeElement === document.body) target.focus({ preventScroll: true });
  // The board re-renders just after a modal closes; try once more afterwards
  setTimeout(() => {
    const again = findEquivalent(opener);
    if (again && (!document.activeElement || document.activeElement === document.body)) again.focus({ preventScroll: true });
  }, 400);
}

let modalKeysReady = false;

export function initModalKeyboard() {
  if (modalKeysReady || typeof document === 'undefined') return;
  modalKeysReady = true;

  // Remember the last control focused outside any modal: that's the opener
  let lastOutsideFocus = null;
  document.addEventListener('focusin', (e) => {
    if (!e.target.closest?.(`${OVERLAY_SELECTOR}, .confirm-overlay`)) lastOutsideFocus = e.target;
  });

  const openers = new Map();  // overlay -> element to return focus to
  let confirmOpen = false;
  const sync = () => {
    const open = openOverlays();
    let opened = false;
    for (const overlay of open) {
      if (openers.has(overlay)) continue;
      openers.set(overlay, lastOutsideFocus);
      focusFirstField(overlay);
      opened = true;
    }
    // I1: the confirm dialog counts as a modal for toasts too
    const confirmNow = !!document.querySelector('.confirm-overlay');
    if (confirmNow && !confirmOpen) opened = true;
    confirmOpen = confirmNow;
    // I1: a newly opened modal clears any Undo toasts and moves the rest to the top
    if (opened) dismissActionToasts();
    placeToasts();
    for (const [overlay, opener] of openers) {
      if (open.includes(overlay)) continue;
      openers.delete(overlay);
      if (openers.size === 0) restoreFocus(opener);
    }
  };
  new MutationObserver(sync).observe(document.body, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'],
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;  // the tour and confirm dialog handle their own Esc
    const top = openOverlays().pop();
    if (top) {
      e.preventDefault();
      closeOverlay(top);
      return;
    }
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown && !dropdown.hidden) {
      e.preventDefault();
      dropdown.hidden = true;
      document.getElementById('btn-notifications')?.focus();
    }
  });
}
