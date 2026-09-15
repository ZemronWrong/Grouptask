/**
 * Notification Service — Central notification dispatcher.
 * Writes to IndexedDB and optionally triggers browser push notifications.
 */

import { STORES, put, getAll, getAllByIndex, remove, get } from './indexedDBService.js';
import { generateId } from '../utils/helpers.js';

const MAX_NOTIFICATIONS = 50;

/**
 * Get user notification preferences from localStorage.
 */
function getPreferences() {
  try {
    return JSON.parse(localStorage.getItem('grouptask_notification_prefs') || '{}');
  } catch { return {}; }
}

/**
 * Check if a notification type is enabled for the user.
 */
function isEnabled(type) {
  const prefs = getPreferences();
  // Default: all enabled
  return prefs[type] !== false;
}

/**
 * Send a notification.
 * @param {object} opts
 * @param {string} opts.uid - The recipient user's UID
 * @param {string} opts.type - Notification type (e.g., 'task_assigned', 'badge_earned')
 * @param {string} opts.title - Short title
 * @param {string} opts.message - Notification body text
 * @param {string} [opts.icon] - Emoji icon
 * @param {string} [opts.actionLink] - Hash route to navigate to
 * @param {string} [opts.groupId] - Associated group ID
 */
export async function notify({ uid, type, title, message, icon = '🔔', actionLink = '', groupId = '' }) {
  if (!uid || !type) return;
  if (!isEnabled(type)) return;

  const notification = {
    id: generateId(),
    uid,
    type,
    title,
    message,
    icon,
    actionLink,
    groupId,
    read: false,
    createdAt: Date.now(),
  };

  try {
    await put(STORES.NOTIFICATIONS, notification);

    // Purge old notifications if over the limit
    const all = await getAllByIndex(STORES.NOTIFICATIONS, 'uid', uid);
    if (all.length > MAX_NOTIFICATIONS) {
      const sorted = all.sort((a, b) => a.createdAt - b.createdAt);
      const toRemove = sorted.slice(0, all.length - MAX_NOTIFICATIONS);
      for (const n of toRemove) {
        await remove(STORES.NOTIFICATIONS, n.id);
      }
    }

    // Trigger browser notification if available
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: message, icon: '/icons/icon-192.png' });
    }

    // Dispatch custom event so the bell badge can update
    window.dispatchEvent(new CustomEvent('notificationAdded'));

  } catch (err) {
    console.warn('[NotificationService] Failed to save notification:', err);
  }
}

/**
 * Get all notifications for a user, sorted newest first.
 */
export async function getNotifications(uid) {
  const all = await getAllByIndex(STORES.NOTIFICATIONS, 'uid', uid);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get unread count for a user.
 */
export async function getUnreadCount(uid) {
  const all = await getAllByIndex(STORES.NOTIFICATIONS, 'uid', uid);
  return all.filter(n => !n.read).length;
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(notificationId) {
  const n = await get(STORES.NOTIFICATIONS, notificationId);
  if (n) {
    n.read = true;
    await put(STORES.NOTIFICATIONS, n);
    window.dispatchEvent(new CustomEvent('notificationAdded'));
  }
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(uid) {
  const all = await getAllByIndex(STORES.NOTIFICATIONS, 'uid', uid);
  for (const n of all) {
    if (!n.read) {
      n.read = true;
      await put(STORES.NOTIFICATIONS, n);
    }
  }
  window.dispatchEvent(new CustomEvent('notificationAdded'));
}

/**
 * Request browser notification permission.
 */
export async function requestPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}
