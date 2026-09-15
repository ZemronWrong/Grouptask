/**
 * Formats an ISO date string into a standard localized short date (e.g. "Sep 15, 2026").
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Calculates remaining or overdue days relative to the current time.
 * @param {string} isoString - Target deadline
 * @returns {string} Human-friendly relative deadline label
 */
export function formatRelative(isoString) {
  if (!isoString) return '';
  const diff = new Date(isoString) - new Date();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days}d left`;
}

/**
 * Returns today's date formatted as YYYY-MM-DD for HTML date inputs.
 * @returns {string}
 */
export function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Converts a timestamp or Date into an intuitive human-readable elapsed duration
 * (e.g. "Just now", "5m ago", "2h ago", "3d ago").
 * @param {number|string|Date} timestampOrDate
 * @returns {string}
 */
export function formatTimeAgo(timestampOrDate) {
  if (!timestampOrDate) return '';
  const d = timestampOrDate instanceof Date ? timestampOrDate : new Date(timestampOrDate);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

