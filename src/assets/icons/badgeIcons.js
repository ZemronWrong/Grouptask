/**
 * Centralized SVG Icons for Badges & Achievements
 * Uses clean, modern Lucide SVG paths (https://lucide.dev)
 */

const badgeSvg = (path, color = 'currentColor') => 
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon badge-svg">${path}</svg>`;

export const BADGE_ICONS = {
  // Streaks
  streak_spark: badgeSvg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', '#eab308'), // Zap
  streak_ember: badgeSvg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z"/>', '#f97316'), // Flame
  streak_wildfire: badgeSvg('<path d="M12 2c1 3 4 4 4 8a6 6 0 0 1-12 0c0-3.5 2.5-6 4-7.5 1 2 2.5 3 4-.5Z"/><path d="m9 18 3-3 3 3"/>', '#ef4444'), // Fire / Bonfire
  streak_firestorm: badgeSvg('<path d="m19 5-7 7"/><path d="m14 10 5-5"/><path d="m20 10-6 6"/><path d="m15 15 5-5"/><path d="M4 20h.01"/><path d="M7 16h.01"/><path d="M11 12h.01"/>', '#ec4899'), // Comet / Meteor
  streak_undying: badgeSvg('<path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/>', '#a855f7'), // Sun / Undying Light

  // Discussions
  keyboard_i: badgeSvg('<path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/>', '#06b6d4'), // Message circle
  keyboard_ii: badgeSvg('<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5Z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>', '#3b82f6'), // Messages square
  keyboard_iii: badgeSvg('<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>', '#6366f1'), // Megaphone

  // Tasks
  card_i: badgeSvg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>', '#10b981'), // Target
  card_ii: badgeSvg('<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>', '#14b8a6'), // Swords
  card_iii: badgeSvg('<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>', '#f59e0b'), // Crown

  // Peer
  most_helpful: badgeSvg('<path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16"/><path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.8-2.8L13 15"/><path d="M14 6.5a2 2 0 1 0-4 0 2 2 0 0 0 4 0z"/>', '#ec4899'), // Helping Hand
  best_collaborator: badgeSvg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', '#8b5cf6'), // Users

  // Secret
  night_owl: badgeSvg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', '#818cf8'), // Moon
  early_bird: badgeSvg('<path d="M12 2v6"/><path d="M4.93 10.93l4.24 4.24"/><path d="M2 18h20"/><path d="M20 10l-4 4"/><path d="m22 22-5-5"/>', '#f97316'), // Sunrise

  // Board
  project_finisher: badgeSvg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>', '#22c55e'), // Flag
  deadline_master: badgeSvg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', '#0ea5e9'), // Timer / Clock
  team_player: badgeSvg('<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>', '#eab308'), // Medal / Award
  no_free_loader: badgeSvg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>', '#10b981'), // Shield Check
  documentation_hero: badgeSvg('<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/>', '#3b82f6'), // Book Open
  code_reviewer: badgeSvg('<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><path d="m8 11 2 2 4-4"/>', '#a855f7'), // Search Check
  bug_squasher: badgeSvg('<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>', '#ef4444'), // Bug
};
