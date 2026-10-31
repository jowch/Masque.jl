// Per-click and hover cost of many held segment picks (#478); the numbers in
// docs/dev/perf-findings.md ("Re-drawing a selection") for segments come from this script.
//
// Run Pluto headless on the warmed env (CLAUDE.md, "Pluto integration testing"), with
// MASQUE_DEV_ENV set and Playwright installed by `scripts/cloud-warm.sh e2e`, then:
//   node bench/segment_picks/click.mjs http://localhost:1234 $PWD/bench/segment_picks/cairo.jl [out.json]
// and the same with webgl.jl. Widgets (figures.jl): a linked group of two panels with 5 000 rows
// held, two separate `:many` fields with 5 000 held each, one field with 5 000 held, and the
// scatter linked group of bench/selection_look as the closed-mark baseline. Each case is the
// median of 12 runs: `sync` is the event handler, `total` runs until two animation frames later.
// `masks` counts the overlay's <mask> elements after the last run.
import { writeFileSync } from "node:fs";
const { chromium } = await import(new URL("../../test/e2e/node_modules/playwright/index.mjs", import.meta.url));
const [base, notebook, outFile] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: "en-US", timezoneId: "UTC", viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
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
  if (s.surf >= 4 && s.busy === 0 && s.c) break;
  if (Date.now() - t0 > 2400000) { console.error("timeout", s); process.exit(1); }
  await page.waitForTimeout(3000);
}
await page.waitForTimeout(3000);
const C = JSON.parse(await page.evaluate(() => document.querySelector("#coords").textContent));

async function timed(w, ix, iy, type) {
  return page.evaluate(async ([w, ix, iy, type]) => {
    const host = [...document.querySelectorAll(".ip-host")][w];
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const b = host.querySelector("img, canvas").getBoundingClientRect();
    const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
    const o = { bubbles: true, composed: true, cancelable: true, clientX: b.left + ix * s, clientY: b.top + iy * s, pointerId: 1, pointerType: "mouse", isPrimary: true };
    const surface = sr.querySelector(".surface");
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    await frame();
    const t = performance.now();
    surface.dispatchEvent(new PointerEvent("pointermove", o));
    if (type === "click") {
      surface.dispatchEvent(new PointerEvent("pointerdown", o));
      surface.dispatchEvent(new PointerEvent("pointerup", o));
      surface.dispatchEvent(new MouseEvent("click", o));
    }
    const sync = performance.now() - t;
    await frame(); await frame();
    return { sync: +sync.toFixed(1), total: +(performance.now() - t).toFixed(1),
      nodes: sr.querySelectorAll("*").length, masks: sr.querySelectorAll("mask").length, halos: sr.querySelectorAll(".masque-halo").length };
  }, [w, ix, iy, type]);
}
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const out = { notebook, errors };
const series = async (name, fn, n = 12) => {
  const r = [];
  for (let i = 0; i < n; i++) { r.push(await fn(i)); await page.waitForTimeout(250); }
  out[name] = { sync: med(r.map((x) => x.sync)), total: med(r.map((x) => x.total)), masks: r.at(-1).masks, runs: r };
};
await series("linked_click", () => timed(0, C.linked[0], C.linked[1], "click"));
// Hover onto an unheld segment, then off it, in turn: the plot repaints with every pick still
// drawn. The two moves are reported apart.
const hoverRuns = [];
for (let i = 0; i < 24; i++) {
  hoverRuns.push({ on: i % 2 === 0, ...(i % 2 ? await timed(0, 2, 2, "hover") : await timed(0, C.linked_hover[0], C.linked_hover[1], "hover")) });
  await page.waitForTimeout(250);
}
for (const [name, on] of [["linked_hover_on", true], ["linked_hover_off", false]]) {
  const r = hoverRuns.filter((x) => x.on === on);
  out[name] = { sync: med(r.map((x) => x.sync)), total: med(r.map((x) => x.total)), masks: r.at(-1).masks, runs: r };
}
await series("two_click", () => timed(1, C.two[0], C.two[1], "click"));
await series("one_click", () => timed(2, C.one[0], C.one[1], "click"));
await series("scatter_linked_click", () => timed(3, C.scatter[0], C.scatter[1], "click"));
out.errors = errors;
if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, (k, v) => k === "runs" ? undefined : v));
await browser.close();
