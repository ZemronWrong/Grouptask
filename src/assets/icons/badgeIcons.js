/**
 * Authentic Pixel Fantasy Icons for Badges & Achievements
 * Sourced from Raven Fantasy Icon Set
 */

const getBadgeImg = (filename, label) => {
  const url = new URL(`../images/badges/${filename}`, import.meta.url).href;
  return `<img src="${url}" alt="${label}" class="pixel-badge-icon" draggable="false" />`;
};

export const BADGE_ICONS = {
  // Streaks (Fire & Momentum)
  streak_spark: getBadgeImg('streak_spark.png', 'Spark'),
  streak_ember: getBadgeImg('streak_ember.png', 'Ember'),
  streak_wildfire: getBadgeImg('streak_wildfire.png', 'Wildfire'),
  streak_firestorm: getBadgeImg('streak_firestorm.png', 'Firestorm'),
  streak_undying: getBadgeImg('streak_undying.png', 'Undying'),

  // Discussions (Communication & Megaphone)
  keyboard_i: getBadgeImg('keyboard_i.png', 'Keyboard Warrior I'),
  keyboard_ii: getBadgeImg('keyboard_ii.png', 'Keyboard Warrior II'),
  keyboard_iii: getBadgeImg('keyboard_iii.png', 'Keyboard Warrior III'),

  // Tasks (Weapon & Champion Progression)
  card_i: getBadgeImg('card_i.png', 'Card Master I'),
  card_ii: getBadgeImg('card_ii.png', 'Card Master II'),
  card_iii: getBadgeImg('card_iii.png', 'Card Master III'),

  // Peer Recognition
  most_helpful: getBadgeImg('most_helpful.png', 'Most Helpful'),
  best_collaborator: getBadgeImg('best_collaborator.png', 'Best Collaborator'),

  // Secret Badges
  night_owl: getBadgeImg('night_owl.png', 'Night Owl'),
  early_bird: getBadgeImg('early_bird.png', 'Early Bird'),

  // Board & Project
  project_finisher: getBadgeImg('project_finisher.png', 'Project Finisher'),
  deadline_master: getBadgeImg('deadline_master.png', 'Deadline Master'),
  team_player: getBadgeImg('team_player.png', 'Team Player'),
  no_free_loader: getBadgeImg('no_free_loader.png', 'No Free-Loader'),
  documentation_hero: getBadgeImg('documentation_hero.png', 'Documentation Hero'),
  code_reviewer: getBadgeImg('code_reviewer.png', 'Code Reviewer'),
  bug_squasher: getBadgeImg('bug_squasher.png', 'Bug Squasher'),
};
