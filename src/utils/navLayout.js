/**
 * navLayout — how the group sidebar is shown at the current window width (H2).
 *
 *   full   — the sidebar with icons and labels
 *   rail   — a slim icon rail (labels in tooltips)
 *   drawer — a top bar with a menu button; the sidebar opens over the page
 *
 * The mode is written to <html data-nav="…"> and the CSS keys off it, so the
 * sidebar never just disappears. It is recomputed live while the window is
 * resized or snapped. The collapse/expand button stores a per-device choice in
 * localStorage (when available); the drawer is always used on narrow windows.
 */

export const NAV_DRAWER_BELOW = 700;
export const NAV_RAIL_BELOW = 1200;
export const SIDEBAR_PREF_KEY = 'grouptask_sidebar';

/** Which nav mode to use for a window `width` and a saved preference ('collapsed' | 'expanded' | null). */
export function navMode(width, pref = null) {
  if (width < NAV_DRAWER_BELOW) return 'drawer';
  if (pref === 'collapsed') return 'rail';
  if (pref === 'expanded') return 'full';
  return width < NAV_RAIL_BELOW ? 'rail' : 'full';
}

/** What the collapse button saves when pressed in `mode`. */
export function toggledPref(mode) {
  return mode === 'rail' ? 'expanded' : 'collapsed';
}

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

let memoryPref = null;   // used when localStorage is blocked

export function readSidebarPref(storage = defaultStorage()) {
  try {
    const v = storage?.getItem(SIDEBAR_PREF_KEY);
    if (v === 'collapsed' || v === 'expanded') return v;
  } catch { /* blocked: fall back to this session's choice */ }
  return memoryPref;
}

export function writeSidebarPref(pref, storage = defaultStorage()) {
  memoryPref = pref;
  try { storage?.setItem(SIDEBAR_PREF_KEY, pref); } catch { /* session only */ }
}

// ── DOM ───────────────────────────────────────────────────────────────────────

const root = () => document.documentElement;

export function currentNavMode() {
  return root().dataset.nav || navMode(window.innerWidth, readSidebarPref());
}

export function isDrawerOpen() {
  return root().dataset.drawer === 'open';
}

/** Labels on the toggle/menu buttons follow the mode, also after a screen re-renders. */
function syncControls() {
  const mode = currentNavMode();
  const open = isDrawerOpen();
  document.querySelectorAll('.sidebar-collapse-btn').forEach((btn) => {
    const label = mode === 'drawer' ? 'Close menu' : mode === 'rail' ? 'Expand sidebar' : 'Collapse sidebar';
    btn.setAttribute('aria-label', label);
    btn.dataset.tip = label;
    btn.setAttribute('aria-expanded', String(mode === 'drawer' ? open : mode === 'full'));
  });
  document.querySelectorAll('.nav-menu-btn').forEach((btn) => btn.setAttribute('aria-expanded', String(open)));
}

export function applyNavMode() {
  const mode = navMode(window.innerWidth, readSidebarPref());
  if (root().dataset.nav !== mode) {
    root().dataset.nav = mode;
    if (mode !== 'drawer') closeDrawer({ restoreFocus: false });
  }
  syncControls();
}

export function openDrawer() {
  if (currentNavMode() !== 'drawer') return;
  root().dataset.drawer = 'open';
  syncControls();
  // Wait for the visibility change before moving focus into the drawer
  requestAnimationFrame(() => {
    document.querySelector('.sidebar .sidebar-link.active, .sidebar .sidebar-link')?.focus({ preventScroll: true });
  });
}

export function closeDrawer({ restoreFocus = true } = {}) {
  if (!isDrawerOpen()) return;
  delete root().dataset.drawer;
  syncControls();
  if (restoreFocus) document.querySelector('.nav-menu-btn')?.focus({ preventScroll: true });
}

export function toggleSidebar() {
  const mode = currentNavMode();
  if (mode === 'drawer') { closeDrawer(); return; }
  writeSidebarPref(toggledPref(mode));
  applyNavMode();
}

let initialised = false;

/** Call once at start-up, before the first screen renders. */
export function initNavLayout() {
  applyNavMode();
  if (initialised) return;
  initialised = true;

  let frame = 0;
  window.addEventListener('resize', () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; applyNavMode(); });
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-menu-btn')) { isDrawerOpen() ? closeDrawer() : openDrawer(); return; }
    if (e.target.closest('.sidebar-collapse-btn')) { toggleSidebar(); return; }
    if (e.target.closest('.nav-backdrop')) { closeDrawer(); return; }
    // Choosing a page closes the drawer
    if (isDrawerOpen() && e.target.closest('.sidebar a[href]')) closeDrawer({ restoreFocus: false });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isDrawerOpen()) {
      e.stopPropagation();
      closeDrawer();
    }
  }, true);

  window.addEventListener('hashchange', () => closeDrawer({ restoreFocus: false }));

  // A screen render replaces the sidebar; keep its button labels right
  new MutationObserver(() => syncControls()).observe(document.getElementById('app') || document.body, { childList: true });
}
