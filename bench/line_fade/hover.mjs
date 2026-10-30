// How long hovering a line takes to fade the axis's other lines (#464); the numbers in
// docs/dev/perf-findings.md ("Fading lines on hover") come from this script.
//
// Run Pluto headless on the warmed env (CLAUDE.md, "Pluto integration testing"), with
// MASQUE_DEV_ENV set and Playwright installed by `scripts/cloud-warm.sh e2e`, then:
//   node bench/line_fade/hover.mjs http://localhost:1234 $PWD/bench/line_fade/cairo.jl [out.json]
// and the same with webgl.jl. For each figure (figures.jl) it times, as medians of 12:
//   swap   the pointer moves from one line to another, so the fade redraws;
//   along  it moves one pixel along the same line, which redraws nothing (the baseline);
//   off    it moves off the plot from a line, which takes the fade away;
// each half the time at the first line and half at the last (`first`, `last`: those medians;
// `redraws`: the most fade redraws any run made).
// `sync` is the event handler, `total` runs until two animation frames later. `sweep` moves the
// pointer across every line, one move per animation frame for 60 frames, and gives the handler's
// median and worst time and how many frames' handlers took longer than a 60 Hz frame (16.7 ms),
// and how many of those redrew the fade.
import { writeFileSync } from "node:fs";
const { chromium } = await import(new URL("../../test/e2e/node_modules/playwright/index.mjs", import.meta.url));
const [base, notebook, outFile] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: "en-US", timezoneId: "UTC", viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => {
    const run = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
    if (run && !window.__ran) { window.__ran = true; run.click(); }
    let surf = 0;
    for (const h of document.querySelectorAll(".ip-host")) { let sr = null; h.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; }); if (sr?.querySelector(".surface")) surf++; }
    return { surf, busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
      err: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n").slice(0, 2000), c: !!document.querySelector("#coords") };
  });
  if (s.err) { console.error("cell error:\n" + s.err); process.exit(1); }
  if (s.surf >= 8 && s.busy === 0 && s.c) break;
  if (Date.now() - t0 > 1800000) { console.error("timeout", s); process.exit(1); }
  await page.waitForTimeout(3000);
}
await page.waitForTimeout(3000);
const C = JSON.parse(await page.evaluate(() => document.querySelector("#coords").textContent));

// In the page: widget w's surface, a pointer event at image px, the fade's redraw count.
await page.evaluate(() => {
  window.__w = (w) => {
    const host = [...document.querySelectorAll(".ip-host")][w];
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const b = host.querySelector("img, canvas").getBoundingClientRect();
    const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
    const surface = sr.querySelector(".surface");
    const ev = (ix, iy) => new PointerEvent("pointermove", { bubbles: true, composed: true, cancelable: true, clientX: b.left + ix * s, clientY: b.top + iy * s, pointerId: 1, pointerType: "mouse", isPrimary: true });
    const draws = () => [...sr.querySelectorAll(".masque-fade")].reduce((n, el) => n + (el.masqueFade?.draws ?? 0), 0);
    return { surface, ev, draws };
  };
  window.__frame = () => new Promise((r) => requestAnimationFrame(r));
});

// Moves to `from` and lets it settle, then times the move to `to`.
async function timed(w, from, to) {
  return page.evaluate(async ([w, from, to]) => {
    const { surface, ev, draws } = window.__w(w);
    surface.dispatchEvent(ev(...from));
    await window.__frame(); await window.__frame();
    const d0 = draws();
    const t = performance.now();
    surface.dispatchEvent(ev(...to));
    const sync = performance.now() - t;
    await window.__frame(); await window.__frame();
    return { sync: +sync.toFixed(2), total: +(performance.now() - t).toFixed(1), redraws: draws() - d0 };
  }, [w, from, to]);
}

async function sweep(w, a, b, n = 60) {
  return page.evaluate(async ([w, a, b, n]) => {
    const { surface, ev, draws } = window.__w(w);
    surface.dispatchEvent(ev(2, 2));
    await window.__frame(); await window.__frame();
    const d0 = draws(), times = [], slow = [0, 0];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1), d = draws();
      const t = performance.now();
      surface.dispatchEvent(ev(a[0], a[1] + f * (b[1] - a[1])));
      times.push(performance.now() - t);
      if (times[i] > 16.7) slow[draws() > d ? 0 : 1]++;
      await window.__frame();
    }
    surface.dispatchEvent(ev(2, 2));
    const s = [...times].sort((x, y) => x - y);
    return { median: +s[n >> 1].toFixed(2), worst: +s[n - 1].toFixed(2), over16: slow[0] + slow[1], over16Redrawing: slow[0], redraws: draws() - d0 };
  }, [w, a, b, n]);
}

const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const series = async (fn, n = 12) => {
  const r = [];
  for (let i = 0; i < n; i++) { r.push(await fn(i)); await page.waitForTimeout(150); }
  // Odd runs end on the first line, even runs on the last (`end` below).
  const at = (p) => med(r.filter((_, i) => i % 2 === p).map((x) => x.sync));
  return { sync: med(r.map((x) => x.sync)), first: at(1), last: at(0), total: med(r.map((x) => x.total)), redraws: Math.max(...r.map((x) => x.redraws)), runs: r };
};
const out = { notebook, cases: [] };
for (const [w, c] of C.entries()) {
  // Every case ends on the first and the last line in turn: separate `lines!` plots are tested
  // in order, so the hit test costs more on the last plot than on the first.
  const end = (i) => i % 2 ? c.a : c.b, other = (i) => i % 2 ? c.b : c.a;
  const row = { name: c.name, vertices: c.vertices };
  row.swap = await series((i) => timed(w, other(i), end(i)));
  row.along = await series((i) => timed(w, end(i), [end(i)[0] + 1, end(i)[1]]));
  row.off = await series((i) => timed(w, end(i), [2, 2]));
  row.sweep = await sweep(w, c.a, c.b);
  out.cases.push(row);
  console.log(JSON.stringify(row, (k, v) => k === "runs" ? undefined : v));
}
out.errors = errors;
if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 1));
if (errors.length) console.log("page errors:", errors);
await browser.close();
