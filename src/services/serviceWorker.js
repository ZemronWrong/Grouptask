/**
 * Registers the service worker (F3, was C1) so the app starts offline, and
 * offers a refresh when a new version has been downloaded instead of
 * switching versions in the middle of someone's work.
 */

/**
 * The build's own entry file name (it has a content hash), e.g. "index-AbC123.js".
 * The worker uses it as its cache name, so every build gets a fresh cache.
 */
export function buildId(moduleUrl = import.meta.url) {
  return new URL(moduleUrl).pathname.split('/').pop().replace(/\.js$/, '') || 'dev';
}

function showUpdateToast(worker) {
  if (document.getElementById('update-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'update-toast';
  toast.className = 'update-toast';
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span>A new version is available</span>
    <button type="button" class="btn btn-primary btn-sm" id="btn-update-refresh">Refresh</button>
    <button type="button" class="btn-icon" id="btn-update-dismiss" aria-label="Later">✕</button>
  `;
  document.body.appendChild(toast);
  toast.querySelector('#btn-update-refresh').addEventListener('click', () => {
    toast.querySelector('#btn-update-refresh').disabled = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  });
  toast.querySelector('#btn-update-dismiss').addEventListener('click', () => toast.remove());
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  window.addEventListener('load', async () => {
    try {
      const hadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(buildId())}`);

      const offer = (worker) => { if (worker && navigator.serviceWorker.controller) showUpdateToast(worker); };
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') offer(worker);
        });
      });

      // Reload once the new version has taken over, but only when the user
      // asked for it (the very first install takes control silently)
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        reloading = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn('[SW] Registration failed:', err.message);
    }
  });
}
