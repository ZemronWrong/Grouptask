/**
 * Connection Status Bar
 *
 * Injects a persistent pill into the page that reflects:
 *   - browser network state (online / offline)
 *   - IndexedDB sync queue state (syncing / synced)
 *
 * The element is created once on first call and updated reactively,
 * so it works across page navigations without re-registering listeners.
 */

import { getSyncQueue } from './indexedDBService.js';
import { isMock } from '../config/firebaseConfig.js';

const POLL_MS = 3000; // how often we check the sync queue

let _el = null;
let _pollTimer = null;

// ── State machine ─────────────────────────────────────────────────────────────
// States (in priority order, highest wins):
//   'lost'       – window.offline fired abruptly
//   'offline'    – started offline (no previous online)
//   'connecting' – navigator.onLine just turned true, queue still flushing
//   'syncing'    – online, queue has pending items
//   'connected'  – online, queue is empty
const STATE_CONFIG = {
  lost:       { label: 'Internet Lost',  icon: '✕',  cls: 'cs-lost'       },
  offline:    { label: 'Offline',         icon: '○',  cls: 'cs-offline'    },
  connecting: { label: 'Connecting…',    icon: '◎',  cls: 'cs-connecting' },
  syncing:    { label: 'Syncing…',       icon: '⟳',  cls: 'cs-syncing'    },
  connected:  { label: 'Connected',      icon: '●',  cls: 'cs-connected'  },
};

let _currentState = navigator.onLine ? 'connected' : 'offline';
let _queueLength = 0;   // E4: changes saved on this device but not yet uploaded

/** E4: second half of the label, e.g. "All changes saved" or "3 changes waiting". */
function _saveLabel() {
  if (_queueLength === 0) return _currentState === 'connected' ? 'All changes saved' : '';
  const n = `${_queueLength} change${_queueLength === 1 ? '' : 's'}`;
  return navigator.onLine ? `${n} to upload` : `${n} waiting`;
}

function setState(state, queueLength = _queueLength) {
  if (_currentState === state && _queueLength === queueLength) return;
  _currentState = state;
  _queueLength = queueLength;
  _render();
}

// ── DOM ───────────────────────────────────────────────────────────────────────
function _getOrCreate() {
  if (!_el) {
    _el = document.createElement('div');
    _el.id = 'connection-status';
    document.body.appendChild(_el);
  }
  return _el;
}

function _render() {
  const el = _getOrCreate();
  const cfg = STATE_CONFIG[_currentState] || STATE_CONFIG.connected;

  // Remove all state classes then apply current one
  el.className = `connection-status ${cfg.cls}`;
  if (_currentState === 'syncing' || _currentState === 'connecting') {
    el.classList.add('cs-spin');
  }

  const save = _saveLabel();
  el.innerHTML = `<span class="cs-icon">${cfg.icon}</span><span class="cs-label">${cfg.label}${save ? ` · ${save}` : ''}</span>`;
}

// ── Sync queue polling ────────────────────────────────────────────────────────
async function _pollQueue() {
  try {
    const queue = await getSyncQueue();
    if (!navigator.onLine) {
      // Network state is handled by the event listeners; just update the count
      setState(_currentState, queue.length);
      return;
    }
    setState(queue.length > 0 ? 'syncing' : 'connected', queue.length);
  } catch {
    // DB not ready yet; leave existing state
  }
}

// ── Network event listeners ───────────────────────────────────────────────────
function _onOnline() {
  setState('connecting');
  // After a short delay, check if queue is now flushed
  setTimeout(_pollQueue, 800);
}

function _onOffline() {
  // Distinguish "was online, just dropped" from "started offline"
  setState(_currentState === 'offline' ? 'offline' : 'lost');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Mount the connection status bar.
 * Safe to call multiple times — listeners are only registered once.
 */
export function initConnectionStatus() {
  _getOrCreate();
  _render();

  // Guard: only register listeners once
  if (_pollTimer !== null) return;

  window.addEventListener('online',  _onOnline);
  window.addEventListener('offline', _onOffline);

  // E4: follow the sync queue as it changes, not only on the poll
  for (const evt of ['sync-enqueued', 'sync-flushed', 'sync-rejected']) {
    window.addEventListener(evt, () => { _pollQueue(); });
  }
  _pollQueue();

  // Periodically check the sync queue even when online,
  // so the pill flips to "Syncing" when writes are queued locally.
  if (!isMock) {
    _pollTimer = setInterval(_pollQueue, POLL_MS);
  }
}

/**
 * Manually signal that a sync flush just started.
 * Called by syncService when flushQueue begins.
 */
export function signalSyncing() {
  if (navigator.onLine) setState('syncing');
}

/**
 * Manually signal that a sync flush finished.
 * Called by syncService when flushQueue completes.
 */
export function signalSynced() {
  // A flush can stop early (network drop), so check what is still queued
  _pollQueue();
}
