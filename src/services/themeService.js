/**
 * Manages the color and board theme settings.
 */

const THEME_KEYS = {
  COLOR: 'grouptask_color_theme',
  BOARD: 'grouptask_board_theme'
};

const TERMS = {
  guild: {
    appTitle: 'Adventurers Guild',
    owner: 'Guildmaster',
    coAdmin: 'Vice Guildmaster',
    member: 'Guild Member',
    taskBoard: 'Quest Board',
    task: 'Quest',
    tasks: 'Quests',
    addQuest: '+ ADD QUEST',
    rewardLabel: 'Gold',
    rewardIcon: 'Gold',
    pendingProof: 'PROOF AWAITING',
    reviewProof: 'REVIEW PROOF',
    submitProof: 'SUBMIT PROOF',
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
    taskBoard: 'Assignment Board',
    task: 'Assignment',
    tasks: 'Assignments',
    addQuest: '+ ADD ASSIGNMENT',
    rewardLabel: 'Points',
    rewardIcon: 'Pts',
    pendingProof: 'SUBMISSION AWAITING',
    reviewProof: 'GRADE SUBMISSION',
    submitProof: 'TURN IN',
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

let currentColorTheme = localStorage.getItem(THEME_KEYS.COLOR) || 'black';
let currentBoardTheme = localStorage.getItem(THEME_KEYS.BOARD) || 'guild';

export function initTheme() {
  applyThemeDOM();
}

export function setColorTheme(color) {
  currentColorTheme = color;
  localStorage.setItem(THEME_KEYS.COLOR, color);
  applyThemeDOM();
}

export function setBoardTheme(board) {
  currentBoardTheme = board;
  localStorage.setItem(THEME_KEYS.BOARD, board);
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
  return TERMS[currentBoardTheme]?.[key] || key;
}

/**
 * Gets the display role name for a member.
 */
export function getRoleName(roleKey) {
  if (roleKey === 'owner') return getTerm('owner');
  if (roleKey === 'co-admin') return getTerm('coAdmin');
  return getTerm('member');
}

function applyThemeDOM() {
  document.documentElement.setAttribute('data-color-theme', currentColorTheme);
  document.documentElement.setAttribute('data-board-theme', currentBoardTheme);
  
  // Dispatch an event so React-like views can re-render if necessary
  window.dispatchEvent(new CustomEvent('themeChanged'));
}
