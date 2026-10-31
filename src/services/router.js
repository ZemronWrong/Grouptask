/**
 * Minimal hash-based SPA router.
 *
 * Routes:
 *   #/login
 *   #/dashboard
 *   #/settings
 *   #/profile
 *   #/group/:groupId
 *   #/group/:groupId/evaluate
 *   #/group/:groupId/leaderboard
 *   #/group/:groupId/members
 *   #/group/:groupId/audit
 */

const routes = [];

export function addRoute(pattern, handler) {
  const paramNames = [];
  const regexStr = pattern.replace(/:([^/]+)/g, (_m, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({ regex: new RegExp(`^${regexStr}$`), paramNames, handler });
}

export function navigate(hash) {
  window.location.hash = hash;
}

function matchRoute(path) {
  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
      return { handler: route.handler, params };
    }
  }
  return null;
}

function onHashChange() {
  const path = window.location.hash.slice(1) || '/login';
  const matched = matchRoute(path);
  if (matched) {
    return matched.handler(matched.params);
  } else {
    navigate('#/login');
  }
}

export function initRouter() {
  window.addEventListener('hashchange', onHashChange);
  onHashChange();
}

/** Re-render the current screen; resolves when it has finished rendering. */
export function reloadCurrentRoute() {
  return onHashChange();
}
