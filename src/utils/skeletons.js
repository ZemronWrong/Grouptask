/**
 * Skeleton placeholders (F3): grey shapes laid out like the real screen, shown
 * while a screen's code or data is still loading, so nothing jumps when the
 * content arrives. Display-only: no data access.
 */

const bar = (w, h = 12, extra = '') => `<span class="skel" style="width:${w}; height:${h}px;${extra}"></span>`;

function sidebarSkeleton(cls = 'sidebar') {
  return `
    <aside class="${cls} skel-sidebar" aria-hidden="true">
      ${bar('60%', 22)}
      ${bar('80%')}${bar('70%')}${bar('75%')}${bar('65%')}
    </aside>
  `;
}

/** One card-shaped placeholder; also used for empty board columns. */
export function skeletonCardHTML() {
  return `<div class="skel-card" aria-hidden="true">${bar('75%', 14)}${bar('45%')}${bar('30%', 18, ' margin-top:10px;')}</div>`;
}

/** Notification rows while the list loads. */
export function skeletonListHTML(rows = 3) {
  return Array.from({ length: rows }, () => `
    <div class="skel-row" aria-hidden="true">
      <span class="skel skel-circle"></span>
      <div class="skel-row-lines">${bar('70%')}${bar('40%', 10)}</div>
    </div>
  `).join('');
}

function boardSkeleton() {
  const column = (cards) => `
    <div class="kanban-column">
      <div class="column-header">${bar('55%', 14)}</div>
      <div class="column-cards">${Array.from({ length: cards }, skeletonCardHTML).join('')}</div>
    </div>
  `;
  return `
    <div class="app-layout">
      ${sidebarSkeleton()}
      <div class="main-content">
        <header class="board-header">${bar('220px', 26)}</header>
        <div class="kanban-wrapper"><div class="kanban-board">${column(3)}${column(2)}${column(1)}</div></div>
      </div>
    </div>
  `;
}

function dashboardSkeleton() {
  return `
    <div class="dash-layout">
      ${sidebarSkeleton('dash-sidebar')}
      <main class="dash-main skel-main">
        ${bar('40%', 28)}
        <div class="skel-tiles">${skeletonCardHTML()}${skeletonCardHTML()}${skeletonCardHTML()}</div>
        ${skeletonListHTML(4)}
      </main>
    </div>
  `;
}

function pageSkeleton() {
  return `
    <div class="app-layout">
      ${sidebarSkeleton()}
      <div class="main-content skel-main">
        <header class="board-header">${bar('260px', 26)}</header>
        <div class="skel-tiles">${skeletonCardHTML()}${skeletonCardHTML()}${skeletonCardHTML()}</div>
        ${skeletonListHTML(5)}
      </div>
    </div>
  `;
}

const SCREENS = { board: boardSkeleton, dashboard: dashboardSkeleton, page: pageSkeleton };

/** The whole-screen skeleton for 'board', 'dashboard' or 'page' (leaderboard, members, …). */
export function screenSkeletonHTML(kind) {
  return `<div class="skel-screen" role="status" aria-label="Loading">${(SCREENS[kind] || pageSkeleton)()}</div>`;
}
