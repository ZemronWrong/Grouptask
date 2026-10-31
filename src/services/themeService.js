/**
 * Manages the color and board theme settings.
 */

const THEME_KEYS = {
  COLOR: 'grouptask_color_theme',
  BOARD: 'grouptask_board_theme'
};

export const BOARD_THEMES = ['standard', 'guild', 'school'];
// F2: plain wording by default; Guild and School are optional themes in Settings
export const DEFAULT_BOARD_THEME = 'standard';

export const TERMS = {
  standard: {
    appTitle: 'Group',
    owner: 'Leader',
    coAdmin: 'Co-leader',
    member: 'Member',
    viewer: 'Viewer',
    taskBoard: 'Task Board',
    todoColumn: 'To Do',
    task: 'Task',
    tasks: 'Tasks',
    addQuest: '+ Add task',
    rewardLabel: 'Points',
    rewardIcon: 'pts',
    pendingProof: 'waiting for review',
    reviewProof: 'Review submission',
    submitProof: 'Submit for approval',
    resubmitProof: 'Resubmit',
    acceptTask: 'Accept task',
    abandonTask: 'Give up this task?',
    saveTask: 'Save task',
    newGroup: 'Create group',
    joinGroup: 'Join group',
    groupNamePlaceHolder: 'e.g. Capstone Group 3',
    myGroups: 'My groups',
    myRole: 'My role',
    boardTitlePrefix: '📋'
  },
  guild: {
    appTitle: 'Adventurers Guild',
    owner: 'Guildmaster',
    coAdmin: 'Vice Guildmaster',
    member: 'Guild Member',
    viewer: 'Only View',
    taskBoard: 'Quest Board',
    todoColumn: 'Quest Board',
    task: 'Quest',
    tasks: 'Quests',
    addQuest: '+ ADD QUEST',
    rewardLabel: 'Gold',
    rewardIcon: 'Gold',
    pendingProof: 'PROOF AWAITING',
    reviewProof: 'REVIEW PROOF',
    submitProof: 'SUBMIT PROOF',
    resubmitProof: 'RESUBMIT',
    acceptTask: 'ACCEPT QUEST',
    abandonTask: 'Abandon this quest?',
    saveTask: 'Save Quest',
    newGroup: 'Form Guild',
    joinGroup: 'Join Guild',
    groupNamePlaceHolder: 'e.g. Knights of the Round',
    myGroups: 'My Guilds',
    myRole: 'My Rank',
    boardTitlePrefix: '⚜'
  },
  school: {
    appTitle: 'Classroom',
    owner: 'Leader',
    coAdmin: 'Assistant',
    member: 'Student',
    viewer: 'Only View',
    taskBoard: 'Assignment Board',
    todoColumn: 'Assignment Board',
    task: 'Assignment',
    tasks: 'Assignments',
    addQuest: '+ ADD ASSIGNMENT',
    rewardLabel: 'Points',
    rewardIcon: 'Pts',
    pendingProof: 'SUBMISSION AWAITING',
    // F2: the consent form says nothing in the app is marked, so no marking wording
    reviewProof: 'Review submission',
    submitProof: 'TURN IN',
    resubmitProof: 'TURN IN AGAIN',
    acceptTask: 'START ASSIGNMENT',
    abandonTask: 'Drop this assignment?',
    saveTask: 'Save Assignment',
    newGroup: 'Create Class',
    joinGroup: 'Join Class',
    groupNamePlaceHolder: 'e.g. CS101 Fall',
    myGroups: 'My Classes',
    myRole: 'My Role',
    boardTitlePrefix: '🎓'
  }
};

function readSetting(key) {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}

function writeSetting(key, value) {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* private mode: this session only */ }
}

/** A stored board theme, or the default if it is missing or unknown. */
export function normalizeBoardTheme(board) {
  return BOARD_THEMES.includes(board) ? board : DEFAULT_BOARD_THEME;
}

let currentColorTheme = readSetting(THEME_KEYS.COLOR) || 'blue';
let currentBoardTheme = normalizeBoardTheme(readSetting(THEME_KEYS.BOARD));

export function initTheme() {
  applyThemeDOM();
}

export function setColorTheme(color) {
  currentColorTheme = color;
  writeSetting(THEME_KEYS.COLOR, color);
  applyThemeDOM();
}

export function setBoardTheme(board) {
  currentBoardTheme = normalizeBoardTheme(board);
  writeSetting(THEME_KEYS.BOARD, currentBoardTheme);
  applyThemeDOM();
}

export function getColorTheme() {
  return currentColorTheme;
}

export function getBoardTheme() {
  return currentBoardTheme;
}

/**
 * Returns the mapped terminology for the current board theme.
 */
export function getTerm(key) {
  return TERMS[currentBoardTheme]?.[key] || TERMS[DEFAULT_BOARD_THEME][key] || key;
}

/**
 * Gets the display role name for a member.
 */
export function getRoleName(roleKey) {
  if (roleKey === 'owner') return getTerm('owner');
  if (roleKey === 'co-admin') return getTerm('coAdmin');
  if (roleKey === 'viewer') return getTerm('viewer');
  return getTerm('member');
}

/** "leader or co-leader" — who approves work, for use inside a sentence. */
export function getApproversPhrase() {
  return `${getTerm('owner').toLowerCase()} or ${getTerm('coAdmin').toLowerCase()}`;
}

function applyThemeDOM() {
  document.documentElement.setAttribute('data-color-theme', currentColorTheme);
  document.documentElement.setAttribute('data-board-theme', currentBoardTheme);
  
  // Dispatch an event so React-like views can re-render if necessary
  window.dispatchEvent(new CustomEvent('themeChanged'));
}
