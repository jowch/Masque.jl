// Shared by the live clip recorders (docs_clip.mjs, cluster_clip.mjs, home_orbit_gif.mjs): an
// unrecorded warm-up. Julia compiles each redraw the first time it runs, so a clip recorded on
// a fresh kernel opens with seconds of a figure that doesn't answer, which a reader takes for
// the package being slow. The recorders make their moves once with capture off, then rerun
// the figure cell with `resetFigure` so the clip starts from the notebook's first state on a
// kernel that has already compiled every redraw in it.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The widget's last gesture frame (frontend/src/mount.ts), or null before the first one.
export const gestureStamp = (page) => page.evaluate(() => {
  const s = document.querySelector(".ip-host")?.dataset.masqueGestureFrame;
  return s ? JSON.parse(s) : null;
});

// Wait until Julia has answered a drag's release: a release frame newer than `before`.
export async function waitReleaseFrame(page, before, timeout = 120000) {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await gestureStamp(page);
    if (s && s.settle && s.n > (before?.n ?? 0)) return s;
    if (Date.now() > until) throw new Error("warm-up: Julia never answered the drag's release");
    await sleep(100);
  }
}

// Rerun the cell `cellId` (the figure cell) and wait until every cell has finished and every
// widget has mounted again. Pluto hides the cell's run button in a clip, but `click()` still
// reaches it.
export async function resetFigure(page, cellId, timeout = 180000) {
  await page.evaluate((id) => {
    document.querySelectorAll(".ip-host").forEach((h) => { h.__masqueStale = true; });
    const btn = document.getElementById(id)?.querySelector("button.runcell");
    if (!btn) throw new Error(`no run button on cell ${id}`);
    btn.click();
  }, cellId);
  const until = Date.now() + timeout;
  for (;;) {
    const st = await page.evaluate(() => {
      const hosts = [...document.querySelectorAll(".ip-host")];
      const mounted = hosts.filter((h) => {
        let sr = null;
        h.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        return !h.__masqueStale && !!sr?.querySelector(".surface");
      });
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        err: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n").slice(0, 800),
        fresh: hosts.length > 0 && mounted.length === hosts.length,
      };
    });
    if (st.err) throw new Error(`notebook errored after the reset: ${st.err}`);
    if (!st.busy && st.fresh) break;
    if (Date.now() > until) throw new Error("timed out waiting for the widget to mount again");
    await sleep(200);
  }
  // `show` compiles the view path again after the mount (src/render.jl, `_kick_view_warmup!`);
  // on a warm kernel that takes a moment, and a drag that lands first waits for it.
  await sleep(2000);
}
