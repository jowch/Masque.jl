// Per-click cost of the selected look at 5 000 picks (#394); the numbers in
// docs/dev/perf-findings.md ("Re-drawing a selection") come from this script.
//
// Run Pluto headless on the warmed env (CLAUDE.md, "Pluto integration testing"), with
// MASQUE_DEV_ENV set and Playwright installed by `scripts/cloud-warm.sh e2e`, then:
//   node bench/selection_look/click.mjs http://localhost:1234 $PWD/bench/selection_look/cairo.jl [out.json]
// and the same with webgl.jl. Each case is the median of 12 runs: `sync` is the event handler,
// `total` runs until two animation frames later, which is when the redraw is on screen.
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
  if (s.surf >= 3 && s.busy === 0 && s.c) break;
  if (Date.now() - t0 > 1800000) { console.error("timeout", s); process.exit(1); }
  await page.waitForTimeout(3000);
}
await page.waitForTimeout(3000);
const C = JSON.parse(await page.evaluate(() => document.querySelector("#coords").textContent));

// Dispatch a gesture at image px on widget w; time the handler (sync) and until two frames later.
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
    return { sync: +sync.toFixed(1), total: +(performance.now() - t).toFixed(1) };
  }, [w, ix, iy, type]);
}
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const out = { notebook, errors };
const series = async (name, fn, n = 12) => {
  const r = [];
  for (let i = 0; i < n; i++) { r.push(await fn(i)); await page.waitForTimeout(250); }
  out[name] = { sync: med(r.map((x) => x.sync)), total: med(r.map((x) => x.total)), runs: r };
};
// Two panels of 10k marks, 5k picked in each. Each click adds or takes out one pick.
await series("click_5k_of_10k", () => timed(0, C.brush[0], C.brush[1], "click"));
// 100k marks, 5k picked.
await series("click_5k_of_100k", () => timed(2, C.big[0], C.big[1], "click"));
// Hover on the legend's first entry, which previews one cluster (~1 250 marks per panel), then
// off it, in turn.
await series("legend_hover", async (i) => i % 2 ? timed(1, 2, 2, "hover") : timed(1, C.legend[0], C.legend[1], "hover"));
out.errors = errors;
if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ click10k: out.click_5k_of_10k, click100k: out.click_5k_of_100k, legend: out.legend_hover }, (k, v) => k === "runs" ? undefined : v));
await browser.close();
