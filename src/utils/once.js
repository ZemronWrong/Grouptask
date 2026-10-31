/**
 * Wrap an async function so it runs at most once per key (F3).
 *
 * A call while a run for the same key is in progress gets that run's promise;
 * after it has succeeded, later calls resolve straight away with the same
 * result. A failed run is forgotten, so the next call tries again.
 */
export function oncePerKey(fn) {
  const runs = new Map();
  const call = (key) => {
    if (!runs.has(key)) {
      const run = Promise.resolve().then(() => fn(key));
      runs.set(key, run);
      run.catch(() => { if (runs.get(key) === run) runs.delete(key); });
    }
    return runs.get(key);
  };
  /** Forget one key (or all), e.g. on sign-out. */
  call.reset = (key) => (key === undefined ? runs.clear() : runs.delete(key));
  return call;
}
