// Spike (live redraw): drag the histogram threshold in live_spike.jl and check the image's mask
// redraws mid-drag over the gesture channel, then the release commits through @bind.
//
//   node live_spike.mjs <base-url> <notebook-abs-path> [screenshot-dir]

import { chromium } from "playwright";
import { PNG } from "pngjs";
import { shutdownOpenSession } from "./fresh_session.mjs";

const [base, notebook, shotDir] = process.argv.slice(2);
const errors = [];
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const NOISE = /pluto-available\.fonsp\.com|Failed to load resource: net::ERR_FAILED/;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const context = await browser.newContext({
    locale: "en-US", timezoneId: "UTC", viewport: { width: 1100, height: 1200 }, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !NOISE.test(m.text())) errors.push(m.text()) });

  await shutdownOpenSession(base, notebook);
  await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, { waitUntil: "domcontentloaded" });
  const deadline = Date.now() + 900000;
  for (;;) {
    const st = await page.evaluate(() => {
      const run = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
      if (run && !window.__ran) { run.click(); window.__ran = true }
      const host = document.querySelector(".ip-host");
      let sr = null; host?.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot });
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        errored: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n"),
        ready: !!sr?.querySelector(".surface") && !!document.querySelector("#out_live"),
      };
    });
    if (st.errored) throw new Error(`cell errored:\n${st.errored.slice(0, 2000)}`);
    if (st.ready && st.busy === 0) break;
    if (Date.now() > deadline) throw new Error("notebook never became ready");
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000);
  console.log(`backend: ${(await page.textContent("#backend_live")).trim()}`);
  const manifest = JSON.parse(await page.textContent("#manifest_live"));
  const out = () => page.textContent("#out_live");
  await page.evaluate(() => document.querySelector(".ip-host").scrollIntoView({ block: "center" }));
  const r = await page.evaluate(() => {
    const b = document.querySelector(".ip-host").querySelector("img, canvas").getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  });
  const s = r.width / manifest.width;
  const at = (x, y) => ({ x: r.left + x * s, y: r.top + y * s });
  const frameStamp = () => page.evaluate(() => {
    const d = document.querySelector(".ip-host").dataset.masqueGestureFrame;
    return d ? JSON.parse(d) : null;
  });
  // red mask pixels in the left half of the widget
  const redCount = async (name) => {
    const buf = await page.screenshot({ clip: { x: r.left, y: r.top, width: r.width / 2, height: r.height } });
    if (shotDir && name) (await import("node:fs")).writeFileSync(`${shotDir}/${name}`, buf);
    const png = PNG.sync.read(buf);
    let n = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const [R, G, B] = [png.data[i], png.data[i + 1], png.data[i + 2]];
      if (R > 150 && R - G > 60 && R - B > 60) n++;
    }
    return n;
  };

  const v0 = await out();
  console.log(v0);
  const red0 = await redCount();
  check("starts with a mask at 0.5", red0 > 50 && /value = 0\.5/.test(v0), `${red0} red px`);

  const tg = manifest.layers.find((l) => l.id === "level").geometry;
  const mid = (tg.span[0] + tg.span[1]) / 2;
  const p0 = at(tg.pos, mid);
  const t0 = Date.now();
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  // sweep left (a lower level lets more through), slowly, then hold
  const target = at(tg.pos - (tg.pos - tg.span[0]) * 0, mid); void target;
  const xs = [];
  for (let k = 1; k <= 30; k++) xs.push(p0.x - k * 4);
  const n0 = (await frameStamp())?.n ?? 0;
  for (const x of xs) { await page.mouse.move(x, p0.y); await page.waitForTimeout(60) }
  await page.waitForTimeout(1500);
  const stMid = await frameStamp();
  const redMid = await redCount("live-mid.png");
  check("frames land mid-drag", stMid && stMid.n > n0 && stMid.settle === false, JSON.stringify(stMid));
  check("mask grows mid-drag, before release", redMid > red0 * 1.2, `${red0} -> ${redMid} red px`);
  const midOut = await out();
  check("no @bind commit mid-drag", midOut === v0, midOut);
  const framesDuringSweep = (stMid?.n ?? 0) - n0;
  console.log(`frames during a ${xs.length}-step sweep (~${xs.length * 60} ms + hold): ${framesDuringSweep}`);

  await page.mouse.up();
  let stEnd = null;
  for (let k = 0; k < 120; k++) { stEnd = await frameStamp(); if (stEnd?.settle) break; await page.waitForTimeout(250) }
  check("release settles a full-resolution frame", stEnd?.settle === true, JSON.stringify(stEnd));
  let v1 = v0;
  for (let k = 0; k < 240 && v1 === v0; k++) { await page.waitForTimeout(250); v1 = await out() }
  console.log(v1);
  check("release commits through @bind", v1 !== v0 && /ThresholdEvent\(:level/.test(v1), v1);
  await page.mouse.move(r.left - 10, r.top - 10);
  await page.waitForTimeout(500);
  const red1 = await redCount("live-settled.png");
  check("settled mask matches the dragged level", Math.abs(red1 - redMid) < redMid * 0.15, `${redMid} vs ${red1}`);
  if (shotDir) await page.locator(".ip-host").screenshot({ path: `${shotDir}/live-widget.png` });
  console.log(`elapsed ${Date.now() - t0} ms`);
  // A second sweep, now that the first paid the compile: how many frames land per second?
  {
    const g2 = await page.evaluate(() => 0); void g2;
    const startN = (await frameStamp())?.n ?? 0;
    const lineX = p0.x - 30 * 4;
    await page.mouse.move(lineX, p0.y);
    await page.mouse.down();
    const tS = Date.now();
    for (let k = 1; k <= 40; k++) { await page.mouse.move(lineX + k * 3, p0.y); await page.waitForTimeout(50) }
    const endN = (await frameStamp())?.n ?? 0;
    const secs = (Date.now() - tS) / 1000;
    await page.mouse.up();
    console.log(`warm sweep: ${endN - startN} frames in ${secs.toFixed(1)} s (${((endN - startN) / secs).toFixed(1)} fps)`);
    check("warm sweep keeps redrawing", endN - startN >= 3, `${endN - startN} frames`);
  }
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
const bad = checks.filter((c) => !c.ok);
console.log(`${checks.length - bad.length}/${checks.length} passed`);
process.exit(bad.length ? 1 : 0);
