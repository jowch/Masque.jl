// A `passed` list that logs each check as it passes: seconds since the driver started, and
// since the check before it. A CI log then shows which check takes the time (#492).
export function timedChecks(driver) {
  const t0 = Date.now();
  let prev = t0;
  const list = [];
  const s = (ms) => (ms / 1000).toFixed(1);
  const log = (what) => {
    const now = Date.now();
    console.log(`[${driver} ${s(now - t0)}s, +${s(now - prev)}s] ${what}`);
    prev = now;
  };
  // A step that is not a check, such as the notebook finishing its first run.
  list.mark = log;
  list.push = (...names) => {
    log(names.join(", "));
    return Array.prototype.push.apply(list, names);
  };
  return list;
}
