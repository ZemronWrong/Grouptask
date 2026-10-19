/**
 * Settings Page — Profile, Theme, Notifications, Privacy sections.
 */

import { STORES, get, put, getAll, getAllByIndex } from '../../services/indexedDBService.js';
import { currentUser } from '../../services/authService.js';
import { updateDisplayName } from '../../services/authService.js';
import { escapeHtml } from '../../utils/helpers.js';
import { navigate } from '../../services/router.js';
import { 
  initTheme, setColorTheme, setBoardTheme, getColorTheme, getBoardTheme, getTerm 
} from '../../services/themeService.js';
import { ICONS } from '../../assets/icons/icons.js';

const DEFAULT_AVATARS = [
  '🧙', '🗡️', '🛡️', '🏹', '⚗️', '🐉', '🦅', '🌟', '🎯', '💎'
];

function getLocalPrefs() {
  try { return JSON.parse(localStorage.getItem('grouptask_settings') || '{}'); } catch { return {}; }
}

function saveLocalPrefs(prefs) {
  localStorage.setItem('grouptask_settings', JSON.stringify(prefs));
}

function getNotifPrefs() {
  try { return JSON.parse(localStorage.getItem('grouptask_notification_prefs') || '{}'); } catch { return {}; }
}

function saveNotifPrefs(prefs) {
  localStorage.setItem('grouptask_notification_prefs', JSON.stringify(prefs));
}

export async function renderSettings() {
  const app = document.getElementById('app');
  const user = currentUser();
  if (!user) { navigate('#/login'); return; }

  // Load or create user profile
  let profile = await get(STORES.USER_PROFILES, user.uid);
  if (!profile) {
    profile = {
      uid: user.uid,
      displayName: user.displayName || user.email || '',
      bio: '',
      avatar: '',
      avatarType: 'default', // 'default' | 'emoji' | 'custom'
      avatarEmoji: '🧙',
      roleVisible: true,
    };
    await put(STORES.USER_PROFILES, profile);
  }

  const localPrefs = getLocalPrefs();
  const notifPrefs = getNotifPrefs();
  const fontSize = localPrefs.fontSize || 'medium';
  const animations = localPrefs.animations !== false;
  const sounds = localPrefs.sounds !== false;

  const NOTIF_TYPES = [
    { key: 'task_assigned', label: 'Task Assigned to Me' },
    { key: 'task_completed', label: 'Task Completed by Teammate' },
    { key: 'comment_added', label: 'Comment on My Card' },
    { key: 'peer_eval_reminder', label: 'Peer Evaluation Reminder' },
    { key: 'approval_request', label: 'Approval Request (Owners/Co-Admins)' },
    { key: 'free_rider_alert', label: 'Free-Rider Warning' },
    { key: 'badge_earned', label: 'Badge Earned' },
    { key: 'member_joined', label: 'Member Joined' },
    { key: 'evaluation_received', label: 'Evaluation Received' },
  ];

  app.innerHTML = `
    <header class="board-header">
      <div class="board-header-left">
        <button class="btn-icon" id="btn-settings-back" title="Back">${ICONS.back}</button>
        <h1 class="board-title">${ICONS.settings} Settings</h1>
      </div>
    </header>

    <div class="settings-page">
      <!-- Section A: Profile Settings -->
      <div class="settings-section">
        <h2 class="settings-section-title">👤 Profile Settings</h2>
        
        <div class="settings-card">
          <div class="settings-avatar-area">
            <div class="settings-avatar-preview" id="avatar-preview">
              ${profile.avatarType === 'custom' && profile.avatar
                ? `<img src="${profile.avatar}" alt="Avatar" class="settings-avatar-img" />`
                : `<span class="settings-avatar-emoji">${profile.avatarEmoji || '🧙'}</span>`
              }
            </div>
            <div class="settings-avatar-controls">
              <label class="btn btn-secondary btn-sm" for="avatar-upload">
                📷 Upload Image
              </label>
              <input type="file" id="avatar-upload" accept="image/*" hidden />
              <button class="btn btn-secondary btn-sm" id="btn-remove-avatar">Remove</button>
            </div>
          </div>

          <div class="settings-avatar-defaults">
            <span class="settings-label">Or choose a default:</span>
            <div class="avatar-picker" id="avatar-picker">
              ${DEFAULT_AVATARS.map(emoji => `
                <button class="avatar-pick-btn ${profile.avatarEmoji === emoji ? 'active' : ''}" data-emoji="${emoji}">
                  ${emoji}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="form-group" style="margin-top:16px;">
            <label for="settings-display-name">Display Name</label>
            <input type="text" id="settings-display-name" value="${escapeHtml(profile.displayName)}" placeholder="Your visible name" />
          </div>

          <div class="form-group" style="margin-top:12px;">
            <label for="settings-bio">Bio / Status <span style="color:var(--text-muted); font-weight:normal;">(max 150 chars)</span></label>
            <textarea id="settings-bio" rows="2" maxlength="150" placeholder="A short status message…">${escapeHtml(profile.bio || '')}</textarea>
            <span class="char-count" id="bio-char-count">${(profile.bio || '').length}/150</span>
          </div>

          <div class="settings-toggle-row" style="margin-top:12px;">
            <span>Show my role badge to others</span>
            <label class="toggle-switch">
              <input type="checkbox" id="toggle-role-visible" ${profile.roleVisible ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div style="margin-top:16px; text-align:right;">
            <button class="btn btn-primary btn-sm" id="btn-save-profile">Save Profile</button>
          </div>
        </div>
      </div>

      <!-- Section B: Theme & Appearance -->
      <div class="settings-section">
        <h2 class="settings-section-title">🎨 Theme & Appearance</h2>
        
        <div class="settings-card">
          <div class="settings-option-group">
            <span class="settings-label">Color Mode</span>
            <div class="theme-btn-group">
              <button class="theme-btn ${getColorTheme() === 'black' ? 'active' : ''}" data-color="black">🌑 Dark</button>
              <button class="theme-btn ${getColorTheme() === 'blue' ? 'active' : ''}" data-color="blue">🔵 Blue</button>
              <button class="theme-btn ${getColorTheme() === 'white' ? 'active' : ''}" data-color="white">☀️ Light</button>
            </div>
          </div>

          <div class="settings-option-group" style="margin-top:16px;">
            <span class="settings-label">Terminology Style</span>
            <div class="theme-btn-group">
              <button class="theme-btn ${getBoardTheme() === 'guild' ? 'active' : ''}" data-board="guild">⚔️ Guild</button>
              <button class="theme-btn ${getBoardTheme() === 'school' ? 'active' : ''}" data-board="school">🎓 School</button>
            </div>
          </div>

          <div class="settings-option-group" style="margin-top:16px;">
            <span class="settings-label">Font Size</span>
            <div class="theme-btn-group">
              <button class="theme-btn ${fontSize === 'small' ? 'active' : ''}" data-fontsize="small">Small</button>
              <button class="theme-btn ${fontSize === 'medium' ? 'active' : ''}" data-fontsize="medium">Medium</button>
              <button class="theme-btn ${fontSize === 'large' ? 'active' : ''}" data-fontsize="large">Large</button>
            </div>
          </div>

          <div class="settings-toggle-row" style="margin-top:16px;">
            <span>Animations</span>
            <label class="toggle-switch">
              <input type="checkbox" id="toggle-animations" ${animations ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="settings-toggle-row" style="margin-top:12px;">
            <span>Sound Effects</span>
            <label class="toggle-switch">
              <input type="checkbox" id="toggle-sounds" ${sounds ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- Section C: Notification Preferences -->
      <div class="settings-section">
        <h2 class="settings-section-title">🔔 Notification Preferences</h2>
        
        <div class="settings-card">
          ${NOTIF_TYPES.map(n => `
            <div class="settings-toggle-row">
              <span>${n.label}</span>
              <label class="toggle-switch">
                <input type="checkbox" class="notif-toggle" data-notif-type="${n.key}" ${notifPrefs[n.key] !== false ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>
          `).join('')}

          <div class="settings-option-group" style="margin-top:16px; border-top:1px solid var(--border); padding-top:16px;">
            <span class="settings-label">Digest Frequency</span>
            <div class="theme-btn-group">
              <button class="theme-btn ${(notifPrefs.digest || 'instant') === 'instant' ? 'active' : ''}" data-digest="instant">Instant</button>
              <button class="theme-btn ${notifPrefs.digest === 'daily' ? 'active' : ''}" data-digest="daily">Daily</button>
              <button class="theme-btn ${notifPrefs.digest === 'weekly' ? 'active' : ''}" data-digest="weekly">Weekly</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Section D: Privacy & Data -->
      <div class="settings-section">
        <h2 class="settings-section-title">🔒 Privacy & Data</h2>
        
        <div class="settings-card">
          <div class="settings-toggle-row">
            <span>Anonymize my peer evaluations</span>
            <label class="toggle-switch">
              <input type="checkbox" id="toggle-anon-ratings" ${localPrefs.anonRatings ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div style="display:flex; gap:12px; margin-top:20px; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" id="btn-export-data">📦 Export My Data (JSON)</button>
            <button class="btn btn-sm" id="btn-delete-account" style="border-color:var(--danger); color:var(--danger);">🗑️ Delete My Account</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── Event Bindings ──

  document.getElementById('btn-settings-back').addEventListener('click', () => navigate('#/dashboard'));

  // Avatar upload
  document.getElementById('avatar-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500000) { alert('Image too large. Max 500KB.'); return; }

    const reader = new FileReader();
    reader.onload = async () => {
      profile.avatar = reader.result;
      profile.avatarType = 'custom';
      await put(STORES.USER_PROFILES, profile);
      renderSettings();
    };
    reader.readAsDataURL(file);
  });

  // Remove avatar
  document.getElementById('btn-remove-avatar').addEventListener('click', async () => {
    profile.avatar = '';
    profile.avatarType = 'default';
    await put(STORES.USER_PROFILES, profile);
    renderSettings();
  });

  // Default avatar picker
  document.querySelectorAll('.avatar-pick-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      profile.avatarEmoji = btn.dataset.emoji;
      profile.avatarType = 'default';
      profile.avatar = '';
      await put(STORES.USER_PROFILES, profile);
      renderSettings();
    });
  });

  // Bio char count
  document.getElementById('settings-bio').addEventListener('input', (e) => {
    document.getElementById('bio-char-count').textContent = `${e.target.value.length}/150`;
  });

  // Save profile
  document.getElementById('btn-save-profile').addEventListener('click', async () => {
    const newName = document.getElementById('settings-display-name').value.trim() || profile.displayName;
    profile.displayName = newName;
    profile.bio = document.getElementById('settings-bio').value.trim();
    profile.roleVisible = document.getElementById('toggle-role-visible').checked;
    await put(STORES.USER_PROFILES, profile);

    // Update auth user's displayName so currentUser().displayName is correct everywhere
    await updateDisplayName(newName);

    // Also update displayName on all member records for this user
    const allMembers = await getAll(STORES.MEMBERS);
    for (const m of allMembers) {
      if (m.uid === user.uid && m.displayName !== newName) {
        m.displayName = newName;
        await put(STORES.MEMBERS, m);
      }
    }

    showSettingsToast('Profile saved!');
  });

  // Color theme
  document.querySelectorAll('.theme-btn[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      setColorTheme(btn.dataset.color);
      renderSettings();
    });
  });

  // Board theme
  document.querySelectorAll('.theme-btn[data-board]').forEach(btn => {
    btn.addEventListener('click', () => {
      setBoardTheme(btn.dataset.board);
      renderSettings();
    });
  });

  // Font size
  document.querySelectorAll('.theme-btn[data-fontsize]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prefs = getLocalPrefs();
      prefs.fontSize = btn.dataset.fontsize;
      saveLocalPrefs(prefs);
      document.documentElement.setAttribute('data-font-size', btn.dataset.fontsize);
      renderSettings();
    });
  });

  // Animations toggle
  document.getElementById('toggle-animations').addEventListener('change', (e) => {
    const prefs = getLocalPrefs();
    prefs.animations = e.target.checked;
    saveLocalPrefs(prefs);
    document.documentElement.setAttribute('data-reduce-motion', !e.target.checked ? 'true' : 'false');
  });

  // Sound effects toggle
  document.getElementById('toggle-sounds').addEventListener('change', (e) => {
    const prefs = getLocalPrefs();
    prefs.sounds = e.target.checked;
    saveLocalPrefs(prefs);
  });

  // Notification toggles
  document.querySelectorAll('.notif-toggle').forEach(toggle => {
    toggle.addEventListener('change', () => {
      const prefs = getNotifPrefs();
      prefs[toggle.dataset.notifType] = toggle.checked;
      saveNotifPrefs(prefs);
    });
  });

  // Digest frequency
  document.querySelectorAll('.theme-btn[data-digest]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prefs = getNotifPrefs();
      prefs.digest = btn.dataset.digest;
      saveNotifPrefs(prefs);
      renderSettings();
    });
  });

  // Anonymize ratings
  document.getElementById('toggle-anon-ratings').addEventListener('change', (e) => {
    const prefs = getLocalPrefs();
    prefs.anonRatings = e.target.checked;
    saveLocalPrefs(prefs);
  });

  // Export data
  document.getElementById('btn-export-data').addEventListener('click', async () => {
    const data = {
      profile,
      groups: await getAll(STORES.GROUPS),
      tasks: await getAll(STORES.TASKS),
      members: (await getAll(STORES.MEMBERS)).filter(m => m.uid === user.uid),
      badges: await getAll(STORES.BADGES),
      peerReviews: await getAll(STORES.PEER_REVIEWS),
      notifications: await getAllByIndex(STORES.NOTIFICATIONS, 'uid', user.uid),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grouptask-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSettingsToast('Data exported!');
  });

  // Delete account
  document.getElementById('btn-delete-account').addEventListener('click', async () => {
    if (!confirm('Are you sure? This will mark your account for deletion. The group owner will need to approve.')) return;
    profile.deleted = true;
    profile.deletedAt = Date.now();
    await put(STORES.USER_PROFILES, profile);
    showSettingsToast('Account deletion requested. The group owner will be notified.');
  });

  // Apply current font size & motion preferences
  document.documentElement.setAttribute('data-font-size', fontSize);
  document.documentElement.setAttribute('data-reduce-motion', !animations ? 'true' : 'false');
}
